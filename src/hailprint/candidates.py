"""Candidate days: Harris County hail days from the SPC WCM database, ranked by report count."""

import http.client
import os
import sys
import urllib.error
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pandas as pd

from hailprint import files, net, reports
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


def fetch_database(path: Path = WCM_PATH) -> Path:
    """Return the cached zip; download it once to a per-process .tmp name and rename."""
    path = Path(path)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        tmp.write_bytes(net.get(WCM_URL, timeout=60))
    except (OSError, http.client.HTTPException) as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"WCM download failed: {exc}") from exc
    if not zipfile.is_zipfile(tmp):
        tmp.unlink()
        raise RuntimeError(f"WCM download is not a zip archive: {WCM_URL}")
    tmp.replace(path)
    return path


def convective_day(day: date, clock: time) -> date:
    """SPC convective day of a WCM row; the shift is CST_TO_CONVECTIVE."""
    return (datetime.combine(day, clock) - CST_TO_CONVECTIVE).date()


def harris_days(path: Path) -> pd.DataFrame:
    """Harris County, TX rows grouped by convective day: report_count and max_size_in."""
    df = pd.read_csv(path, usecols=USECOLS)
    harris = (df[["f1", "f2", "f3", "f4"]] == HARRIS_FIPS).any(axis=1)
    df = df.loc[(df["st"] == "TX") & harris].copy()
    other = sorted(set(df["tz"]) - {CST_TZ})
    if other:
        raise ValueError(f"WCM tz code {other} for Harris rows, expected {CST_TZ} (CST)")
    stamps = pd.to_datetime(df["date"] + " " + df["time"]) - pd.Timedelta(CST_TO_CONVECTIVE)
    df["storm_date"] = stamps.dt.date
    grouped = df.groupby("storm_date").agg(report_count=("mag", "size"), max_size_in=("mag", "max"))
    return grouped.reset_index().assign(report_source="wcm")


def wcm_last_day(path: Path) -> date:
    """Last convective day of any row in the WCM database."""
    df = pd.read_csv(path, usecols=["date", "time"])
    return (
        (pd.to_datetime(df["date"] + " " + df["time"]) - pd.Timedelta(CST_TO_CONVECTIVE))
        .max()
        .date()
    )


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
            raise RuntimeError(
                f"SPC daily CSV cache write for {storm_date} failed: {exc.strerror}"
            ) from exc
    return text


def all_days(
    wcm_path: Path, index: pd.DataFrame, cache_dir: Path = DAILY_DIR, today: date | None = None
) -> pd.DataFrame:
    """WCM Harris days plus the Harris, TX days of the index after the WCM end from SPC daily CSVs.

    Columns: storm_date, report_count, max_size_in, report_source ("wcm" or "spc-daily").
    """
    # shortcut: the daily fill counts preliminary reports, upgrade when SPC publishes the 2026
    # WCM file; the WCM end is the day of its last row, so a quiet tail of the file is filled
    # from the daily CSVs too
    wcm = harris_days(wcm_path)
    today = date.today() if today is None else today
    wcm_end = wcm_last_day(wcm_path)
    later = sorted({d for d in index["storm_date"] if d > wcm_end})
    with ThreadPoolExecutor(FETCH_THREADS) as pool:
        texts = list(pool.map(lambda d: daily_csv(d, cache_dir, today), later))
    if later and all(text is None for text in texts):
        raise RuntimeError(
            f"SPC daily CSV not found for any of the {len(later)} days after the WCM"
        )
    rows = []
    for day, text in zip(later, texts, strict=True):
        harris = reports.harris_reports(day, text=text) if text is not None else None
        if harris is not None and len(harris):
            rows.append((day, len(harris), harris["size_in"].max(), "spc-daily"))
    filled = pd.DataFrame(rows, columns=list(wcm.columns))
    return wcm if filled.empty else pd.concat([wcm, filled], ignore_index=True)


def rank(days: pd.DataFrame, index: pd.DataFrame) -> pd.DataFrame:
    """Join the archive index; keep archive-era days; sort by count desc, size desc, date asc."""
    merged = days.merge(index[["storm_date", "has_12z"]], on="storm_date", how="left")
    merged = merged.loc[merged["storm_date"] >= index["storm_date"].min()]
    merged["has_12z"] = merged["has_12z"].fillna(False).astype(bool)
    merged = merged.sort_values(
        ["report_count", "max_size_in", "storm_date"], ascending=[False, False, True]
    )
    return merged.reset_index(drop=True).loc[:, COLUMNS]
