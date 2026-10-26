"""Build, validate, and serialise the files that `hailprint publish` writes under site/data/."""

import json
import math
from collections.abc import Iterable
from datetime import UTC, date, datetime
from functools import cache
from importlib.metadata import version
from importlib.resources import files
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import shapely
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from shapely.geometry.polygon import orient

from hailprint import score, swath
from hailprint.files import FORBIDDEN_WORD
from hailprint.parcels import OWNER_FIELDS

Doc = dict[str, Any]
RECEIPT_KIND = "receipt"
RUN_TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
MESSAGE_CHARS = 200
COORD_DECIMALS = 6
STORMS_DIR = "storms"
SWATH_FILE = "swath.geojson"
REPORTS_FILE = "reports.geojson"
PAIRS_FILE = "pairs.json"
ZIPS_FILE = "zip-counts.json"
METADATA_KEYS = ("source", "product", "confidence")
SPC_PRODUCT = "preliminary hail reports"
HCAD_PRODUCT = "Parcels.gdb"


@cache
def _schemas() -> dict[str, Doc]:
    """The committed schemas by file kind, read from the installed package."""
    folder = files("hailprint") / "schemas"
    suffix = ".schema.json"
    return {
        path.name.removesuffix(suffix): json.loads(path.read_text(encoding="utf-8"))
        for path in folder.iterdir()
        if path.name.endswith(suffix)
    }


@cache
def _validator(kind: str) -> Draft202012Validator:
    schemas = _schemas()
    if kind == RECEIPT_KIND or kind not in schemas:
        raise ValueError(f"unknown file kind {kind!r}")
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas.values()
    )
    return Draft202012Validator(schemas[kind], registry=registry)


def _json_path(parts: Iterable[str | int]) -> str:
    return "$" + "".join(f"[{p}]" if isinstance(p, int) else f".{p}" for p in parts)


def validate(doc: Doc, kind: str) -> None:
    """Raise ValueError with the file kind and the JSON path when the document breaks its schema."""
    errors = sorted(
        _validator(kind).iter_errors(doc), key=lambda e: [str(p) for p in e.absolute_path]
    )
    if errors:
        message = errors[0].message
        if len(message) > MESSAGE_CHARS:
            message = f"{message[:80]} ... {message[-80:]}"
        raise ValueError(f"{kind}: {_json_path(errors[0].absolute_path)}: {message}")


def dumps(doc: Doc, kind: str) -> str:
    """Compact JSON text; NaN, Infinity, the forbidden word, or an owner field raises ValueError."""
    try:
        text = json.dumps(doc, allow_nan=False, separators=(",", ":"), ensure_ascii=False)
    except ValueError as err:
        raise ValueError(f"{kind}: {err}") from err
    lowered = text.lower()
    if FORBIDDEN_WORD in lowered:
        raise ValueError(f"{kind}: forbidden word {FORBIDDEN_WORD!r} in the text")
    for field in OWNER_FIELDS:
        if field.lower() in lowered:
            raise ValueError(f"{kind}: owner field {field!r} in the text")
    return text


def _inches(threshold_mm: float) -> float:
    """The size class in inches, exact to the hundredth; `mm / 25.4` alone carries float noise."""
    return round(threshold_mm / 25.4, 2)


def _utc_text(run_time: datetime) -> str:
    if run_time.tzinfo is None:
        raise ValueError("run_time needs a time zone")
    return run_time.astimezone(UTC).strftime(RUN_TIME_FORMAT)


def receipt(storm_date: date, sources: list[dict[str, str]], run_time: datetime) -> Doc:
    """The provenance block of one published file; `run_time` needs a time zone."""
    return {
        "storm_date": storm_date.isoformat(),
        "sources": [dict(source) for source in sources],
        "confidence": swath.CONFIDENCE,
        "run_time": _utc_text(run_time),
        "package_version": version("hailprint"),
    }


def _ring(ring: shapely.LinearRing) -> list[list[float]]:
    return [[float(x), float(y)] for x, y in ring.coords]


def _multipolygon(geometry: shapely.Geometry) -> Doc:
    """GeoJSON coordinates by RFC 7946: counter-clockwise exteriors, clockwise holes."""
    # shortcut: swath and report coordinates round to 6 decimals (0.1 m), upgrade when a
    # sub-metre use appears
    rounded = shapely.transform(geometry, lambda xy: np.round(xy, COORD_DECIMALS))
    polygons = [orient(polygon, 1.0) for polygon in shapely.get_parts(rounded)]
    return {
        "type": "MultiPolygon",
        "coordinates": [
            [_ring(polygon.exterior), *(_ring(hole) for hole in polygon.interiors)]
            for polygon in polygons
        ],
    }


def swath_doc(swaths: gpd.GeoDataFrame, rcpt: Doc) -> Doc:
    """The swath file as a FeatureCollection: one MultiPolygon per class, sorted by size.

    The area of a class comes from the metric swaths of the scorer, so it equals the swath area
    in the pairs file. A frame without a CRS raises ValueError.
    """
    metric = score.metric_swaths(swaths)
    ordered = swaths.sort_values("threshold_mm").reset_index(drop=True)
    features = [
        {
            "type": "Feature",
            "properties": {
                "threshold_mm": float(row["threshold_mm"]),
                "threshold_in": _inches(float(row["threshold_mm"])),
                "label": str(row["label"]),
                "area_km2": float(area_m2) / 1e6,
            },
            "geometry": _multipolygon(row["geometry"]),
        }
        for row, area_m2 in zip(ordered.to_dict("records"), metric.area, strict=True)
    ]
    return {"type": "FeatureCollection", "receipt": rcpt, "features": features}


def reports_doc(frame: gpd.GeoDataFrame, rcpt: Doc) -> Doc:
    """The neighbourhood reports as Point features. The `id` is the row index of the frame.

    Only the five report columns leave the machine: the SPC comment text never does.
    """
    points = frame.geometry.to_crs("EPSG:4326")
    features = [
        {
            "type": "Feature",
            "properties": {
                "id": index,
                "time": str(row["time"]),
                "location": str(row["location"]),
                "county": str(row["county"]),
                "state": str(row["state"]),
                "size_in": float(row["size_in"]),
            },
            "geometry": {
                "type": "Point",
                "coordinates": [
                    round(float(point.x), COORD_DECIMALS),
                    round(float(point.y), COORD_DECIMALS),
                ],
            },
        }
        for index, (row, point) in enumerate(zip(frame.to_dict("records"), points, strict=True))
    ]
    return {"type": "FeatureCollection", "receipt": rcpt, "features": features}


def pairs_doc(swaths: gpd.GeoDataFrame, frame: gpd.GeoDataFrame, rcpt: Doc) -> Doc:
    """The radius-free scoring input of one storm date.

    Per report: the edge distance and the distance to each size class (null for an absent class).
    Per class: the swath area and the unverifiable area at every whole kilometre 0 to 20.
    The `id` of a report is its row position, as in the reports file. Classes that do not nest
    raise ValueError.
    """
    metric = score.metric_swaths(swaths)
    swath.require_nested(metric, score.NEST_TOLERANCE_M)
    edge = score.edge_m(frame).to_numpy(dtype=float)
    dist = score.distances(metric, frame)
    # shortcut: unverifiable_km2 is stored for whole-km radii only, upgrade when the UI needs a
    # fractional radius
    areas = [score.areas_km2(metric, frame, km) for km in range(score.MAX_RADIUS_KM + 1)]
    classes = [
        {
            "threshold_mm": float(mm),
            "threshold_in": _inches(mm),
            "label": swath.label(mm),
            "swath_km2": areas[0][index][0],
            "unverifiable_km2": [at_km[index][1] for at_km in areas],
        }
        for index, mm in enumerate(swath.SIZE_CLASSES_MM)
    ]
    columns = [score.dist_column(mm) for mm in swath.SIZE_CLASSES_MM]
    rows = zip(frame["size_in"], edge, dist[columns].to_numpy(dtype=float), strict=True)
    return {
        "receipt": rcpt,
        "radius_km_default": score.DEFAULT_RADIUS_KM,
        "radius_km_max": score.MAX_RADIUS_KM,
        "edge_margin_m": score.EDGE_M,
        "classes": classes,
        "reports": [
            {
                "id": index,
                "size_in": float(size_in),
                "edge_m": float(edge_m),
                "dist_m": [None if math.isnan(d) else float(d) for d in dist_m],
            }
            for index, (size_in, edge_m, dist_m) in enumerate(rows)
        ],
    }


def rescore(doc: Doc, radius_km: float) -> pd.DataFrame:
    """The score table of `score.score_day` for one whole radius, from the pairs document alone.

    A report is scored when its edge distance exceeds the radius plus the edge margin. A size
    class forecasts for it when its distance is not null and at most the radius.
    Raises ValueError for a radius that is not a whole number from 0 to `radius_km_max`, and for
    a document with a missing size class or a distance list of the wrong length.
    """
    top = doc["radius_km_max"]
    if not (math.isfinite(radius_km) and radius_km == int(radius_km) and 0 <= radius_km <= top):
        raise ValueError(f"radius_km must be a whole number from 0 to {top}: {radius_km}")
    by_mm = {c["threshold_mm"]: c for c in doc["classes"]}
    missing = [mm for mm in swath.SIZE_CLASSES_MM if mm not in by_mm]
    if missing:
        raise ValueError(f"pairs: missing size classes {missing}")
    order = [c["threshold_mm"] for c in doc["classes"]]
    scored = [r for r in doc["reports"] if r["edge_m"] > radius_km * 1000 + doc["edge_margin_m"]]
    if any(len(r["dist_m"]) != len(order) for r in scored):
        raise ValueError(f"pairs: a dist_m list does not hold {len(order)} entries")
    nan = math.nan
    columns = {"size_in": [r["size_in"] for r in scored]} | {
        score.dist_column(mm): [nan if r["dist_m"][i] is None else r["dist_m"][i] for r in scored]
        for i, mm in enumerate(order)
    }
    pairs = pd.DataFrame({name: pd.Series(values, dtype=float) for name, values in columns.items()})
    table = score.contingency(pairs, radius_km)
    table.insert(0, "storm_date", doc["receipt"]["storm_date"])
    table["radius_km"] = radius_km
    table["swath_km2"] = [by_mm[mm]["swath_km2"] for mm in swath.SIZE_CLASSES_MM]
    table["unverifiable_km2"] = [
        by_mm[mm]["unverifiable_km2"][int(radius_km)] for mm in swath.SIZE_CLASSES_MM
    ]
    return score.with_skill(table, score.SCORE_COLUMNS)


def zip_doc(zips: pd.DataFrame, rcpt: Doc) -> Doc:
    """Parcel counts per size class and per ZIP. Counts only: no parcel id, no geometry.

    The class count is the sum of its ZIP rows. A ZIP row counts the parcels of its ZIP that
    the class covers, so the lowest class count is the number of parcels hit.
    """
    rows = zips.sort_values(["threshold_mm", "zip"], kind="stable")
    classes = rows.drop_duplicates("threshold_mm")
    records: list[dict[str, Any]] = rows.to_dict("records")
    totals: dict[float, int] = {}
    for row in records:
        key = float(row["threshold_mm"])
        totals[key] = totals.get(key, 0) + int(row["parcel_count"])
    return {
        "receipt": rcpt,
        "classes": [
            {
                "threshold_mm": float(row["threshold_mm"]),
                "threshold_in": _inches(float(row["threshold_mm"])),
                "label": str(row["label"]),
                "parcel_count": totals[float(row["threshold_mm"])],
            }
            for row in classes.to_dict("records")
        ],
        "zips": [
            {
                "zip": str(row["zip"]),
                "threshold_mm": float(row["threshold_mm"]),
                "parcel_count": int(row["parcel_count"]),
            }
            for row in records
        ],
    }


def storms_doc(entries: list[Doc], run_time: datetime) -> Doc:
    """The storms index: the entries newest first, the confidence band, and the run time."""
    return {
        "confidence": swath.CONFIDENCE,
        "run_time": _utc_text(run_time),
        "package_version": version("hailprint"),
        "radius_km_default": score.DEFAULT_RADIUS_KM,
        "storms": sorted(entries, key=lambda entry: entry["storm_date"], reverse=True),
    }


def merge_entries(old: list[Doc], new: list[Doc], data_dir: Path) -> list[Doc]:
    """The old entries with the new entries over them by storm date.

    An entry stays only while its swath, reports, and pairs files exist under `data_dir`.
    """
    # shortcut: an entry stays until its directory vanishes, upgrade when a prune command is needed
    merged = {e["storm_date"]: e for e in old} | {e["storm_date"]: e for e in new}
    required = ("swath", "reports", "pairs")
    return [
        e for e in merged.values() if all((data_dir / e["files"][k]).exists() for k in required)
    ]


def swath_source(path: Path) -> tuple[Doc, float | None]:
    """The MRMS source entry and the largest MESH value, both from the metadata of a swath file.

    A file without the source, product, or confidence key raises ValueError that names the file.
    """
    metadata = pq.read_schema(path).metadata or {}
    values = {key: metadata.get(key.encode(), b"").decode() for key in METADATA_KEYS}
    missing = [key for key, value in values.items() if not value]
    if missing:
        raise ValueError(f"{path.name}: the metadata lacks {', '.join(missing)}")
    max_mesh = metadata.get(b"max_mesh_mm", b"").decode()
    entry = {"source": values["source"], "product": values["product"], "file": path.name}
    return entry, float(max_mesh) if max_mesh else None


def spc_source(storm_date: date) -> Doc:
    """The source entry of the SPC daily CSV of one storm date."""
    return {
        "source": score.REPORT_SOURCE,
        "product": SPC_PRODUCT,
        "file": f"{storm_date:%y%m%d}.csv",
    }


def hcad_source(zips_name: str) -> Doc:
    """The source entry of the HCAD parcel counts."""
    return {"source": "hcad", "product": HCAD_PRODUCT, "file": zips_name}


def _nullable(value: Any) -> float | None:
    return None if pd.isna(value) else float(value)


def _table_rows(table: pd.DataFrame) -> list[Doc]:
    counts = score.COUNT_COLUMNS
    return [
        {
            "threshold_mm": float(row["threshold_mm"]),
            "threshold_in": _inches(float(row["threshold_mm"])),
            "label": str(row["label"]),
            **{name: int(row[name]) for name in counts},
            **{name: _nullable(row[name]) for name in score.METRIC_COLUMNS},
            **{name: float(row[name]) for name in score.AREA_COLUMNS},
        }
        for row in table.to_dict("records")
    ]


def build_day(
    storm_date: date,
    swaths: gpd.GeoDataFrame,
    nearby: gpd.GeoDataFrame,
    *,
    mrms: Doc,
    max_mesh_mm: float | None,
    spc: Doc,
    zips: pd.DataFrame | None,
    hcad: Doc | None,
    facts: Doc | None,
    run_time: datetime,
) -> tuple[dict[str, str], Doc]:
    """The serialised files of one storm date, by file name, and its entry for the storms index.

    Every document passes its schema and `dumps` before this function returns. The pairs file
    must re-score to the table of `score.score_day` at the default radius, or ValueError names
    the pairs file. `facts` holds the report_count, max_size_in, and report_source of the
    candidate file, or None when the date is absent there. `zips` and `hcad` are both None
    when the date has no parcel counts.
    """
    day = score.score_day(swaths, nearby, storm_date, score.DEFAULT_RADIUS_KM)

    def stamp(*sources: Doc) -> Doc:
        return receipt(storm_date, list(sources), run_time)

    documents = {
        SWATH_FILE: ("swath", swath_doc(swaths, stamp(mrms))),
        REPORTS_FILE: ("reports", reports_doc(nearby, stamp(spc))),
        PAIRS_FILE: ("pairs", pairs_doc(swaths, nearby, stamp(mrms, spc))),
    }
    parcel_total = None
    if zips is not None and hcad is not None:
        zip_counts = zip_doc(zips, stamp(mrms, hcad))
        documents[ZIPS_FILE] = ("zip-counts", zip_counts)
        parcel_total = zip_counts["classes"][0]["parcel_count"] if zip_counts["classes"] else 0
    texts = {}
    for name, (kind, doc) in documents.items():
        validate(doc, kind)
        texts[name] = dumps(doc, kind)
    again = rescore(json.loads(texts[PAIRS_FILE]), score.DEFAULT_RADIUS_KM)
    try:
        pd.testing.assert_frame_equal(again, day.table, check_exact=False, rtol=0, atol=1e-9)
    except AssertionError as err:
        raise ValueError(f"pairs: the re-scorer differs from score_day: {err}") from err
    facts = facts or {}
    folder = f"{STORMS_DIR}/{storm_date}"
    entry = {
        "storm_date": storm_date.isoformat(),
        "report_count": facts.get("report_count"),
        "max_size_in": facts.get("max_size_in"),
        "report_source": facts.get("report_source"),
        "max_mesh_mm": max_mesh_mm,
        "scored_reports": len(day.pairs),
        "excluded_reports": day.excluded,
        "table": _table_rows(day.table),
        "parcel_total": parcel_total,
        "files": {
            "swath": f"{folder}/{SWATH_FILE}",
            "reports": f"{folder}/{REPORTS_FILE}",
            "pairs": f"{folder}/{PAIRS_FILE}",
            "zip_counts": f"{folder}/{ZIPS_FILE}" if ZIPS_FILE in texts else None,
        },
    }
    return texts, entry
