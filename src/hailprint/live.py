"""The live view: the rolling 24 h radar-estimated hail size over the Harris bbox, now.

`build` reads the newest `MESH_Max_1440min_00.50` key (the live window) and the newest
`MESH_Max_60min_00.50` key (the last hour), and returns the live files as documents.
`write` validates every document, then writes the layer files and `now.json` last.
A MESH failure raises before any write, so the old live files stay.
"""

import http.client
import re
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import geopandas as gpd
import pandas as pd
import xarray as xr

from hailprint import cloud, county, files, mesh, net, odin, power, publish, reports, sbw, swath
from hailprint.score import REPORT_SOURCE

DIR = "live"
NOW_FILE = "now.json"
HOUR_PRODUCT = "MESH_Max_60min_00.50"
WINDOW = timedelta(hours=24)
DAYS_BACK = 2  # the UTC day folders that newest_key lists: today and the previous day
SPC_URL = "https://www.spc.noaa.gov/climo/reports/{day}_hail.csv"
SPC_FILES = ("yesterday_hail.csv", "today_hail.csv")
SBW_FILE = "sbw_interval.geojson"
SHARE_DECIMALS = 4
# A failed optional source raises one of these; the source gets ok: false and the run goes on.
SOURCE_ERRORS = (RuntimeError, ValueError, OSError, http.client.HTTPException)
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


def _spc(day: str) -> Callable[[], str]:
    return lambda: net.get(SPC_URL.format(day=day), timeout=30).decode()


def _sbw(start: datetime, end: datetime) -> str:
    return net.get(sbw.URL.format(begin=start, end=end), timeout=30).decode()


@dataclass(frozen=True)
class Fetchers:
    """The network reads of the optional sources; tests replace them with fixed answers."""

    spc_today: Callable[[], str] = _spc("today")
    spc_yesterday: Callable[[], str] = _spc("yesterday")
    warnings: Callable[[datetime, datetime], str] = _sbw
    odin: Callable[[], str] = odin.fetch


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


def _source(
    source: str, product: str, ok: bool, valid: datetime | None, message: str | None
) -> Doc:
    """One row of now.json sources; a message longer than MESSAGE_CHARS is cut."""
    if message is not None and len(message) > publish.MESSAGE_CHARS:
        message = message[: publish.MESSAGE_CHARS - 3] + "..."
    return {
        "source": source,
        "product": product,
        "ok": ok,
        "fetched_at": publish._utc_text(datetime.now(UTC)),
        "valid_time": None if valid is None else publish._utc_text(valid),
        "message": message,
    }


def _failed(source: str, product: str, exc: Exception) -> Doc:
    return _source(source, product, False, None, f"{type(exc).__name__}: {exc}")


def _last_hour(client, now: datetime, raw_dir: Path) -> tuple[Doc | None, Doc]:
    """The last-hour block and its source row. A failure gives None and an `ok: false` row."""
    try:
        key = newest_key(client, HOUR_PRODUCT, now)
        valid = valid_time(key)
        max_mm = _max_mm(mesh.decode(_fetch(client, key, raw_dir)))
    except SOURCE_ERRORS as exc:
        return None, _failed(mesh.BUCKET, HOUR_PRODUCT, exc)
    block = {"key": key, "valid_time": publish._utc_text(valid), "max_mesh_mm": max_mm}
    return block, _source(mesh.BUCKET, HOUR_PRODUCT, True, valid, None)


def _report_times(frame: gpd.GeoDataFrame, day: date) -> pd.Series:
    """The UTC time of each row of the SPC file of convective day `day`.

    A time of 1200 or later falls on `day`, an earlier time on the next day. A time that is
    not four digits raises ValueError.
    """
    times = []
    for text in frame["time"]:
        if not re.fullmatch(r"\d{4}", text) or int(text[:2]) > 23 or int(text[2:]) > 59:
            raise ValueError(f"SPC hail CSV has a malformed time: {text[:8]!r}")
        moment = datetime(day.year, day.month, day.day, int(text[:2]), int(text[2:]), tzinfo=UTC)
        times.append(moment if text >= "1200" else moment + timedelta(days=1))
    return pd.Series(times, index=frame.index, dtype="datetime64[ns, UTC]")


def window_reports(
    today_text: str, yesterday_text: str, start: datetime, end: datetime, run_time: datetime
) -> gpd.GeoDataFrame:
    """The SPC rows of today and yesterday in the closed window [start, end] and the buffer.

    SPC flips `today` at 12Z, so today is the convective day of the run time. The rows sort
    by UTC time and location, and `id` follows that order.
    """
    # shortcut: only today and yesterday are read, so just after 12Z the first minutes of the
    # window (before 12Z two days ago) hold no row; upgrade to the dated CSV when that matters
    today = storm_date_of(run_time)
    frames = []
    for text, day in ((yesterday_text, today - timedelta(days=1)), (today_text, today)):
        frame = reports.nearby_reports(day, text)
        frames.append(frame.assign(utc=_report_times(frame, day)))
    rows = pd.concat(frames, ignore_index=True)
    rows = rows.loc[(rows["utc"] >= start) & (rows["utc"] <= end)]
    rows = rows.sort_values(["utc", "location"], kind="stable").reset_index(drop=True)
    return gpd.GeoDataFrame(rows[[*reports.COLUMNS, "geometry"]], geometry="geometry")


def window_warnings(text: str, start: datetime, run_time: datetime) -> gpd.GeoDataFrame:
    """The HGX SV, TO, and FF warnings (significance W) that overlap [start, run_time].

    `sbw.parse` keeps the polygons of one impact window (48 h from 12Z). The two impact
    windows from the storm date of the start cover [start, run_time], and the overlap rule
    of `sbw.parse` (begin before the end, end after the start) then applies to the live window.
    """
    first = storm_date_of(start)
    frame = pd.concat(
        [sbw.parse(text, first), sbw.parse(text, first + timedelta(days=1))], ignore_index=True
    )
    frame = frame.drop_duplicates(subset=list(sbw.ALLOWED))
    keep = (frame["polygon_begin"] < run_time) & (frame["polygon_end"] > start)
    return gpd.GeoDataFrame(frame.loc[keep].reset_index(drop=True), geometry="geometry")


def power_now(text: str, run_time: datetime) -> tuple[Doc, datetime]:
    """The ODIN customers out per metro county now, with the share out, and the slot time."""
    slot = odin.slot_of(run_time)
    frame = odin.snapshot(text, slot)
    sums = {fips: 0 for fips in county.METRO_NAMES}
    for fips, count in zip(frame["fips"], frame["customers_out"], strict=True):
        sums[fips] += int(count)
    rows = pd.DataFrame({"fips": list(sums), "customers_out": list(sums.values())})
    shares = power.share_out(rows).tolist()
    counties = [
        {
            "fips": fips,
            "name": county.METRO_NAMES[fips],
            "customers_out": out,
            "share_out": round(float(share), SHARE_DECIMALS),
        }
        for (fips, out), share in zip(sums.items(), shares, strict=True)
    ]
    return {"customers_out": sum(sums.values()), "counties": counties}, slot


def build(now: datetime, client, fetchers: Fetchers) -> LiveResult:
    """The live documents for `now`. A missing or broken 1440-minute file raises RuntimeError.

    The reports, warnings, and power sources are optional: a failure gives `ok: false`, an
    empty layer or a null `power`, and the other sources stay. The layer receipts carry the
    window end as their run time, so a rerun on the same inputs gives the same layer bytes.
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
    sources = [_source(mesh.BUCKET, mesh.PRODUCT, True, end, None), hour_source]

    def rcpt(origins: list[dict[str, str]]) -> Doc:
        return publish.receipt(storm_date, origins, end)

    spc_origins = [
        {"source": REPORT_SOURCE, "product": publish.SPC_PRODUCT, "file": f} for f in SPC_FILES
    ]
    try:
        report_rows = window_reports(
            fetchers.spc_today(), fetchers.spc_yesterday(), start, end, now
        )
        sources.append(_source(REPORT_SOURCE, publish.SPC_PRODUCT, True, None, None))
    except SOURCE_ERRORS as exc:
        report_rows = None
        sources.append(_failed(REPORT_SOURCE, publish.SPC_PRODUCT, exc))
    sbw_origin = {**sbw.METADATA, "file": SBW_FILE}
    try:
        warning_rows = window_warnings(fetchers.warnings(start, now), start, now)
        sources.append(_source(sbw_origin["source"], sbw_origin["product"], True, None, None))
    except SOURCE_ERRORS as exc:
        warning_rows = None
        sources.append(_failed(sbw_origin["source"], sbw_origin["product"], exc))
    try:
        power_block, slot = power_now(fetchers.odin(), now)
        sources.append(_source(odin.METADATA["source"], odin.METADATA["product"], True, slot, None))
    except SOURCE_ERRORS as exc:
        power_block = None
        sources.append(_failed(odin.METADATA["source"], odin.METADATA["product"], exc))

    def empty(origins: list[dict[str, str]]) -> Doc:
        return {"type": "FeatureCollection", "receipt": rcpt(origins), "features": []}

    sizes = [] if report_rows is None else report_rows["size_in"].tolist()
    ends = [] if warning_rows is None else warning_rows["polygon_end"].tolist()
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
        "reports": {"count": len(sizes), "max_size_in": max(sizes) if sizes else None},
        "warnings": {"count": len(ends), "active": sum(1 for end_ in ends if end_ > now)},
        "power": power_block,
        "sources": sources,
        "files": {
            "swath": publish.SWATH_FILE,
            "reports": publish.REPORTS_FILE,
            "warnings": publish.WARNINGS_FILE,
        },
        "confidence": swath.CONFIDENCE,
    }
    swath_origin = {"source": mesh.BUCKET, "product": mesh.PRODUCT, "file": name}
    return LiveResult(
        {
            publish.SWATH_FILE: publish.swath_doc(swaths, rcpt([swath_origin])),
            publish.REPORTS_FILE: empty(spc_origins)
            if report_rows is None
            else publish.reports_doc(report_rows, rcpt(spc_origins)),
            publish.WARNINGS_FILE: empty([sbw_origin])
            if warning_rows is None
            else publish.warnings_doc(warning_rows, rcpt([sbw_origin])),
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
