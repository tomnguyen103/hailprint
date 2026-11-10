"""Candidate days: Harris County hail days from the SPC WCM database, ranked by report count."""

import http.client
import io
import sys
import urllib.error
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from hailprint import files, net, reports, swath
from hailprint.paths import DERIVED_DIR, RAW_DIR

# shortcut: the 1955-2025 file holds no 2026 day, so all_days fills later days from the SPC daily
# CSVs, upgrade when SPC publishes the 2026 file
WCM_URL = "https://www.spc.noaa.gov/wcm/data/1955-2025_hail.csv.zip"
WCM_PATH = RAW_DIR / "spc" / "1955-2025_hail.csv.zip"
HARRIS_FIPS = 201
CANDIDATES_PATH = DERIVED_DIR / "index" / "candidate-days.csv"
DAILY_DIR = RAW_DIR / "spc" / "daily"
COLUMNS = ["storm_date", "report_count", "max_size_in", "has_12z", "report_source"]
FRESH_DAYS = 3  # SPC may still change a day this young, so it never lands in the cache
FETCH_THREADS = 8
USECOLS = ["date", "time", "tz", "st", "mag", "f1", "f2", "f3", "f4"]
CST_TZ = 3  # WCM tz code for CST
# WCM times are CST (UTC-6); the SPC day starts at 12 UTC; the net shift from local clock is -6 h
CST_TO_CONVECTIVE = timedelta(hours=6)
MAX_WCM_UNCOMPRESSED_BYTES = 512 * 1024 * 1024


def _utc_today() -> date:
    return datetime.now(UTC).date()


def _check_wcm_zip(source: Path | io.BytesIO, label: Path | str | None = None) -> None:
    name = source if label is None else label
    if not zipfile.is_zipfile(source):
        return
    if isinstance(source, io.BytesIO):
        source.seek(0)
    with zipfile.ZipFile(source) as zf:
        infos = zf.infolist()
        if not infos:
            raise RuntimeError(f"{name}: empty zip archive")
        if sum(info.file_size for info in infos) > MAX_WCM_UNCOMPRESSED_BYTES:
            raise RuntimeError(
                f"{name}: zip uncompressed size exceeds {MAX_WCM_UNCOMPRESSED_BYTES} bytes"
            )


WCM_CHUNK_ROWS = 25_000
_ISO_DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


def _latest_row_index(chunk: pd.DataFrame) -> Any | None:
    """Return the index label of the latest valid dated row in `chunk`, or None."""
    valid = chunk["date"].notna() & chunk["time"].notna()
    if not bool(valid.any()):
        return None
    dates = chunk.loc[valid, "date"].astype("string")
    if bool(dates.str.fullmatch(_ISO_DATE_RE).all()):
        max_date = dates.max()
        top = chunk.loc[dates.index[dates == max_date]]
        stamps = pd.to_datetime(top["date"] + " " + top["time"], errors="coerce") - pd.Timedelta(
            CST_TO_CONVECTIVE
        )
        if bool(stamps.notna().any()) and bool(stamps.notna().all()):
            return stamps.idxmax()
    stamps = pd.to_datetime(chunk["date"] + " " + chunk["time"]) - pd.Timedelta(CST_TO_CONVECTIVE)
    return stamps.idxmax() if bool(stamps.notna().any()) else None


def _filter_wcm_chunk(chunk: pd.DataFrame) -> pd.DataFrame:
    """Keep Harris County rows and the latest dated row in a WCM chunk."""
    if chunk.empty:
        return chunk
    if "st" in chunk.columns and {"f1", "f2", "f3", "f4"}.issubset(chunk.columns):
        harris = (chunk[["f1", "f2", "f3", "f4"]] == HARRIS_FIPS).any(axis=1)
        keep = (chunk["st"] == "TX") & harris
        if {"date", "time"}.issubset(chunk.columns):
            latest = _latest_row_index(chunk)
            if latest is not None:
                keep.loc[latest] = True
        return chunk.loc[keep]
    if {"date", "time"}.issubset(chunk.columns):
        latest = _latest_row_index(chunk)
        if latest is not None:
            return chunk.loc[[latest]]
        return chunk.iloc[0:0]
    return chunk


def _read_wcm(path: Path, usecols: list[str] = USECOLS) -> pd.DataFrame:
    _check_wcm_zip(path)
    chunks = [
        _filter_wcm_chunk(c) for c in pd.read_csv(path, usecols=usecols, chunksize=WCM_CHUNK_ROWS)
    ]
    if not chunks:
        return pd.DataFrame(columns=usecols)
    return pd.concat(chunks, ignore_index=True)


def fetch_database(path: Path | None = None) -> Path:
    """Return the cached zip; download it once to a per-process .tmp name and rename."""
    path = Path(WCM_PATH if path is None else path)
    if path.exists():
        return path
    try:
        raw = net.get(WCM_URL, timeout=60)
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"WCM download failed: {exc}") from exc
    buf = io.BytesIO(raw)
    if not zipfile.is_zipfile(buf):
        raise RuntimeError(f"WCM download is not a zip archive: {WCM_URL}")
    _check_wcm_zip(buf, label=path)
    try:
        files.write_bytes_atomic(raw, path)
    except OSError as exc:
        raise RuntimeError(f"WCM download failed: {exc}") from exc
    return path


def convective_day(day: date, clock: time) -> date:
    """SPC convective day of a WCM row; the shift is CST_TO_CONVECTIVE."""
    return (datetime.combine(day, clock) - CST_TO_CONVECTIVE).date()


def _harris_days_from_df(df: pd.DataFrame) -> pd.DataFrame:
    harris = (df[["f1", "f2", "f3", "f4"]] == HARRIS_FIPS).any(axis=1)
    df = df.loc[(df["st"] == "TX") & harris].copy()
    other = sorted(set(df["tz"]) - {CST_TZ})
    if other:
        raise ValueError(f"WCM tz code {other} for Harris rows, expected {CST_TZ} (CST)")
    stamps = pd.to_datetime(df["date"] + " " + df["time"]) - pd.Timedelta(CST_TO_CONVECTIVE)
    df["storm_date"] = stamps.dt.date
    grouped = df.groupby("storm_date").agg(report_count=("mag", "size"), max_size_in=("mag", "max"))
    return grouped.reset_index().assign(report_source="wcm")


def harris_days(path: Path) -> pd.DataFrame:
    """Harris County, TX rows grouped by convective day: report_count and max_size_in."""
    return _harris_days_from_df(_read_wcm(path, USECOLS))


def _wcm_last_day_from_df(df: pd.DataFrame) -> date:
    return (
        (pd.to_datetime(df["date"] + " " + df["time"]) - pd.Timedelta(CST_TO_CONVECTIVE))
        .max()
        .date()
    )


def wcm_last_day(path: Path) -> date:
    """Last convective day of any row in the WCM database."""
    return _wcm_last_day_from_df(_read_wcm(path, ["date", "time"]))


def daily_csv(storm_date: date, cache_dir: Path, today: date) -> str | None:
    """SPC daily hail CSV text; None for an HTTP 404. A day older than FRESH_DAYS is cached.

    Only text that parses is cached. A cache file that no longer parses is fetched again.
    """
    cache = cache_dir / f"{storm_date:%y%m%d}.csv"
    if cache.exists():
        try:
            cached = cache.read_text(encoding="utf-8")
            reports.parse(cached)
            return cached
        except (OSError, ValueError):
            print(f"SPC daily CSV cache {cache.name} is invalid, fetched again", file=sys.stderr)
    try:
        text = reports.fetch_hail_csv(storm_date)
        reports.parse(text)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise RuntimeError(f"SPC daily CSV for {storm_date} failed: {exc}") from exc
        print(f"SPC daily CSV for {storm_date} not found (HTTP 404), skipped", file=sys.stderr)
        return None
    except (OSError, http.client.HTTPException, ValueError) as exc:
        raise RuntimeError(f"SPC daily CSV for {storm_date} failed: {exc}") from exc
    if (today - storm_date).days > FRESH_DAYS:
        try:
            files.write_text_atomic(text, cache)
        except OSError as exc:
            reason = exc.strerror or type(exc).__name__
            raise RuntimeError(
                f"SPC daily CSV cache write for {storm_date} failed: {reason}"
            ) from exc
    return text


def read_facts(path: Path) -> dict[str, dict]:
    """The report facts of the candidate file by storm date. A blank cell becomes None."""
    frame = pd.read_csv(path, dtype={"storm_date": str})
    return {
        row["storm_date"]: {
            "report_count": None if pd.isna(row["report_count"]) else int(row["report_count"]),
            "max_size_in": None if pd.isna(row["max_size_in"]) else float(row["max_size_in"]),
            "report_source": None if pd.isna(row["report_source"]) else str(row["report_source"]),
        }
        for row in frame.to_dict("records")
    }


def all_days(
    wcm_path: Path,
    index: pd.DataFrame,
    cache_dir: Path | None = None,
    today: date | None = None,
) -> pd.DataFrame:
    """WCM Harris days plus the Harris, TX days of the index after the WCM end from SPC daily CSVs.

    Columns: storm_date, report_count, max_size_in, report_source ("wcm" or "spc-daily").
    """
    # shortcut: the daily fill counts preliminary reports, upgrade when SPC publishes the 2026
    # WCM file; the WCM end is the day of the last row of any county, and d >= wcm_end is
    # merged with the daily CSV so a partial end day takes the larger report count
    raw_wcm = _read_wcm(wcm_path, USECOLS)
    wcm = _harris_days_from_df(raw_wcm)
    resolved_cache_dir = DAILY_DIR if cache_dir is None else cache_dir
    today = _utc_today() if today is None else today
    wcm_end = _wcm_last_day_from_df(raw_wcm)
    later = sorted({d for d in index["storm_date"] if d >= wcm_end})
    with ThreadPoolExecutor(FETCH_THREADS) as pool:
        texts = list(pool.map(lambda d: daily_csv(d, resolved_cache_dir, today), later))
    # one 404 day is a normal skip; a run of them means the URL scheme changed
    after = [t for d, t in zip(later, texts, strict=True) if d > wcm_end]
    if len(after) > 1 and all(text is None for text in after):
        raise RuntimeError(
            f"SPC daily CSV not found for any of the {len(after)} days after the WCM"
        )
    rows = []
    for day, text in zip(later, texts, strict=True):
        harris = reports.harris_reports(day, text=text) if text is not None else None
        if harris is not None and len(harris):
            rows.append((day, len(harris), harris["size_in"].max(), "spc-daily"))
    filled = pd.DataFrame(rows, columns=list(wcm.columns))
    if filled.empty:
        return wcm
    combined = pd.concat([wcm, filled], ignore_index=True)
    # Sort by report_count desc, max_size_in desc, and prefer "wcm" on ties so the winning row's
    # report_source matches the row that supplies the larger report count.
    source_rank = [0 if s == "wcm" else 1 for s in combined["report_source"]]
    ordered = combined.assign(_src_rank=source_rank).sort_values(
        ["storm_date", "report_count", "max_size_in", "_src_rank"],
        ascending=[True, False, False, True],
        kind="mergesort",
    )
    return (
        ordered.groupby("storm_date", as_index=False, sort=False)
        .agg(
            report_count=("report_count", "max"),
            max_size_in=("max_size_in", "first"),
            report_source=("report_source", "first"),
        )
        .loc[:, list(wcm.columns)]
    )


def rank(days: pd.DataFrame, index: pd.DataFrame) -> pd.DataFrame:
    """Join the archive index; keep archive-era days; sort by count desc, size desc, date asc."""
    merged = days.merge(index[["storm_date", "has_12z"]], on="storm_date", how="left")
    merged = merged.loc[merged["storm_date"] >= index["storm_date"].min()]
    merged["has_12z"] = merged["has_12z"].fillna(False).astype(bool)
    merged = merged.sort_values(
        ["report_count", "max_size_in", "storm_date"], ascending=[False, False, True]
    )
    return merged.reset_index(drop=True).loc[:, COLUMNS]


def missing_days(ranked: pd.DataFrame, swath_dir: Path) -> list[date]:
    """Storm dates with a 12Z file and no swath file under `swath_dir`, newest first."""
    rows = ranked.loc[ranked["has_12z"].astype(bool), "storm_date"]
    return sorted((d for d in rows if not (swath_dir / swath.file_name(d)).exists()), reverse=True)
