"""The live view: the rolling 24 h radar-estimated hail size over the Harris bbox, now.

`build` reads the newest `MESH_Max_1440min_00.50` key (the live window) and the newest
`MESH_Max_60min_00.50` key (the last hour), and returns the live files as documents.
`write` validates every document, then writes the layer files and `now.json` last.
A MESH failure raises before any write, so the old live files stay.
"""

import re
import tempfile
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import geopandas as gpd
import xarray as xr

from hailprint import cloud, files, mesh, publish, swath

DIR = "live"
NOW_FILE = "now.json"
HOUR_PRODUCT = "MESH_Max_60min_00.50"
WINDOW = timedelta(hours=24)
DAYS_BACK = 2  # the UTC day folders that newest_key lists: today and the previous day
# The files that now.json names, then now.json, with their schema kinds, in write order.
KINDS = {
    publish.SWATH_FILE: "swath",
    publish.REPORTS_FILE: "reports",
    publish.WARNINGS_FILE: "warnings",
    NOW_FILE: "live",
}
_STAMP_RE = re.compile(r"_(\d{8}-\d{6})\.grib2\.gz$")

Doc = publish.Doc


@dataclass(frozen=True)
class LiveResult:
    """The four live documents by file name, in write order."""

    docs: dict[str, Doc]


def valid_time(key: str) -> datetime:
    """The UTC valid time in the stamp of a MESH key; ValueError when the key has no stamp."""
    match = _STAMP_RE.search(key)
    if match is None:
        raise ValueError(f"MESH key has no time stamp: {key!r}")
    return datetime.strptime(match.group(1), "%Y%m%d-%H%M%S").replace(tzinfo=UTC)


def storm_date_of(end: datetime) -> date:
    """The SPC convective day that holds the window end.

    The window closes at its end, so an end at exactly 12Z belongs to the day before:
    the 12Z key of D+1 gives the storm date D, as `mesh.key_for` names it.
    """
    return (end.astimezone(UTC) - timedelta(hours=12, microseconds=1)).date()


def newest_key(client, product: str, now: datetime) -> str:
    """The newest stamped key of the product in the UTC folder of `now` or the day before.

    RuntimeError when neither folder holds a stamped key.
    """
    today = now.astimezone(UTC).date()
    for back in range(DAYS_BACK):
        day = today - timedelta(days=back)
        prefix = f"CONUS/{product}/{day:%Y%m%d}/"
        keys = [k for k in cloud._list_keys(client, mesh.BUCKET, prefix) if _STAMP_RE.search(k)]
        if keys:
            return max(keys, key=valid_time)
    raise RuntimeError(f"no {product} key in the last {DAYS_BACK} UTC day folders")


def _max_mm(da: xr.DataArray) -> float | None:
    """The largest cell in mm, rounded as `ingest` rounds it, or None when no cell is valid."""
    return None if bool(da.isnull().all()) else round(float(da.max()), 2)


def build_swath(path: Path, storm_date: date) -> tuple[gpd.GeoDataFrame, float | None]:
    """The swath classes and the largest cell of one MESH file, as `ingest` builds them."""
    da = mesh.decode(path)
    return swath.build_swaths(da, storm_date), _max_mm(da)


def _fetch(client, key: str, raw_dir: Path) -> Path:
    return mesh.download_many([key], raw_dir, client=client)[0]


def _source(product: str, ok: bool, valid: datetime | None, message: str | None) -> Doc:
    if message is not None and len(message) > publish.MESSAGE_CHARS:
        message = message[: publish.MESSAGE_CHARS - 3] + "..."
    return {
        "source": mesh.BUCKET,
        "product": product,
        "ok": ok,
        "fetched_at": publish._utc_text(datetime.now(UTC)),
        "valid_time": None if valid is None else publish._utc_text(valid),
        "message": message,
    }


def _last_hour(client, now: datetime, raw_dir: Path) -> tuple[Doc | None, Doc]:
    """The last-hour block and its source row. A failure gives None and an `ok: false` row."""
    try:
        key = newest_key(client, HOUR_PRODUCT, now)
        valid = valid_time(key)
        max_mm = _max_mm(mesh.decode(_fetch(client, key, raw_dir)))
    except (RuntimeError, ValueError, OSError) as exc:
        return None, _source(HOUR_PRODUCT, False, None, str(exc))
    block = {"key": key, "valid_time": publish._utc_text(valid), "max_mesh_mm": max_mm}
    return block, _source(HOUR_PRODUCT, True, valid, None)


def build(now: datetime, client) -> LiveResult:
    """The live documents for `now`. A missing or broken 1440-minute file raises RuntimeError.

    The layer receipts carry the window end as their run time, so a rerun on the same inputs
    gives the same layer bytes.
    """
    with tempfile.TemporaryDirectory(prefix="hailprint-live-") as tmp:
        raw_dir = Path(tmp)
        key = newest_key(client, mesh.PRODUCT, now)
        end = valid_time(key)
        start = end - WINDOW
        storm_date = storm_date_of(end)
        try:
            swaths, max_mm = build_swath(_fetch(client, key, raw_dir), storm_date)
        except ValueError as exc:
            raise RuntimeError(f"{key}: {exc}") from exc
        last_hour, hour_source = _last_hour(client, now, raw_dir)
    name = key.rsplit("/", 1)[1]
    rcpt = publish.receipt(
        storm_date, [{"source": mesh.BUCKET, "product": mesh.PRODUCT, "file": name}], end
    )
    empty = {"type": "FeatureCollection", "receipt": rcpt, "features": []}
    now_doc = {
        "kind": "live",
        "run_time": publish._utc_text(now),
        "window": {"start": publish._utc_text(start), "end": publish._utc_text(end)},
        "mesh": {
            "key": key,
            "valid_time": publish._utc_text(end),
            "max_mesh_mm": max_mm,
            "class_count": len(swaths),
        },
        "last_hour": last_hour,
        "reports": {"count": 0, "max_size_in": None},
        "warnings": {"count": 0, "active": 0},
        "power": None,
        "sources": [_source(mesh.PRODUCT, True, end, None), hour_source],
        "files": {
            "swath": publish.SWATH_FILE,
            "reports": publish.REPORTS_FILE,
            "warnings": publish.WARNINGS_FILE,
        },
        "confidence": swath.CONFIDENCE,
    }
    return LiveResult(
        {
            publish.SWATH_FILE: publish.swath_doc(swaths, rcpt),
            publish.REPORTS_FILE: empty,
            publish.WARNINGS_FILE: empty,
            NOW_FILE: now_doc,
        }
    )


def write(result: LiveResult, out_dir: Path) -> list[Path]:
    """Validate and serialise every document first, then write them in order, now.json last."""
    texts = []
    for name, kind in KINDS.items():
        doc = result.docs[name]
        publish.validate(doc, kind)
        texts.append((name, publish.dumps(doc, kind)))
    return [files.write_text_atomic(text, Path(out_dir) / name) for name, text in texts]
