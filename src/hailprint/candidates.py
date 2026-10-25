"""Candidate days: Harris County hail days from the SPC WCM database, ranked by report count."""

import urllib.request
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pandas as pd

# shortcut: the 1955-2025 file holds no 2026 day, upgrade when SPC publishes the 2026 file
# or when the backtest needs 2026 days
WCM_URL = "https://www.spc.noaa.gov/wcm/data/1955-2025_hail.csv.zip"
WCM_PATH = Path("data/raw/spc/1955-2025_hail.csv.zip")
HARRIS_FIPS = 201
CANDIDATES_PATH = Path("data/derived/index/candidate-days.csv")
COLUMNS = ["storm_date", "report_count", "max_size_in", "has_12z"]
USECOLS = ["date", "time", "st", "mag", "f1", "f2", "f3", "f4"]


def fetch_database(path: Path = WCM_PATH) -> Path:
    """Return the cached zip; download it once to a .tmp name and rename."""
    path = Path(path)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    urllib.request.urlretrieve(WCM_URL, tmp)
    tmp.replace(path)
    return path


def convective_day(day: date, clock: time) -> date:
    """SPC convective day of a WCM row.

    WCM times are CST (tz=3): UTC = CST + 6 h. The SPC day starts at 12 UTC, so the
    shift is UTC - 12 h, a net 6 h back from the local clock.
    """
    return (datetime.combine(day, clock) - timedelta(hours=6)).date()


def harris_days(path: Path) -> pd.DataFrame:
    """Harris County, TX rows grouped by convective day: report_count and max_size_in."""
    df = pd.read_csv(path, usecols=USECOLS)
    harris = (df[["f1", "f2", "f3", "f4"]] == HARRIS_FIPS).any(axis=1)
    df = df[(df["st"] == "TX") & harris].copy()
    stamps = pd.to_datetime(df["date"] + " " + df["time"]) - pd.Timedelta(hours=6)
    df["storm_date"] = stamps.dt.date
    grouped = df.groupby("storm_date").agg(report_count=("mag", "size"), max_size_in=("mag", "max"))
    return grouped.reset_index()


def rank(days: pd.DataFrame, index: pd.DataFrame) -> pd.DataFrame:
    """Join the archive index; keep archive-era days; sort by count desc, size desc, date asc."""
    merged = days.merge(index[["storm_date", "has_12z"]], on="storm_date", how="left")
    merged = merged[merged["storm_date"] >= index["storm_date"].min()]
    merged["has_12z"] = merged["has_12z"].fillna(False).astype(bool)
    merged = merged.sort_values(
        ["report_count", "max_size_in", "storm_date"], ascending=[False, False, True]
    )
    return merged.reset_index(drop=True)[COLUMNS]
