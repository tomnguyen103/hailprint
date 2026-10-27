"""EAGLE-I customers out: the ORNL year CSV from Figshare, cut to the metro counties."""

import http.client
import json
from typing import IO

import pandas as pd

from hailprint import county, net

ARTICLE_ID = 24237376
LISTING_URL = f"https://api.figshare.com/v2/articles/{ARTICLE_ID}/files?page_size=100"
DOWNLOAD_URL = "https://ndownloader.figshare.com/files/"
METRO_FIPS = frozenset(county.METRO_NAMES)
# The header drifts by year (a total_customers column in 2024, none in 2020 and 2025): read by name.
COLUMNS = ("fips_code", "customers_out", "run_start_time")
CHUNK_ROWS = 500_000  # rows per pandas chunk: the whole year CSV never sits in memory
METADATA = {"source": "eaglei", "product": "customers-out"}


def file_name(year: int) -> str:
    return f"eaglei-{year}.parquet"


def _metro_rows(chunk: pd.DataFrame, year: int) -> pd.DataFrame:
    """Return the metro rows of one chunk as `fips`, `time_utc`, `customers_out`."""
    for name in COLUMNS:
        if name not in chunk.columns:
            raise ValueError(f"EAGLE-I {year}: the CSV has no {name} column")
    metro = chunk.loc[chunk["fips_code"].isin(list(METRO_FIPS))]
    try:
        # a blank value is null, never zero; an explicit 0 stays 0
        customers_out = metro["customers_out"].astype("Int64")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"EAGLE-I {year}: customers_out is not a whole count") from exc
    try:
        time_utc = pd.to_datetime(metro["run_start_time"], utc=True)
    except ValueError as exc:
        raise ValueError(f"EAGLE-I {year}: run_start_time is not a time") from exc
    return pd.DataFrame(
        {"fips": metro["fips_code"], "time_utc": time_utc, "customers_out": customers_out}
    )


def read_eaglei(stream: IO[bytes], year: int, chunk_rows: int = CHUNK_ROWS) -> pd.DataFrame:
    """Read the year CSV in chunks and return the metro rows, sorted by county and time.

    A stream error propagates, so the caller never holds a partial year.
    """
    reader = pd.read_csv(
        stream,
        usecols=lambda name: name in COLUMNS,
        dtype={"fips_code": str},
        encoding="utf-8-sig",
        chunksize=chunk_rows,
    )
    parts = [_metro_rows(chunk, year) for chunk in reader]
    frame = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    if frame.empty:
        raise ValueError(f"EAGLE-I {year}: the CSV has no metro row")
    return frame.sort_values(["fips", "time_utc"], kind="stable").reset_index(drop=True)


def file_url(year: int) -> str:
    """Return the Figshare download URL of the year CSV, found in the article listing."""
    # shortcut: the Figshare file ids come from the article listing on each run, upgrade to a
    # pinned table if Figshare reorders files
    # shortcut: the listing reads one page of 100 files, upgrade to a paged read past 100 files
    name = f"eaglei_outages_{year}.csv"
    for entry in json.loads(net.get(LISTING_URL)):
        if entry["name"] == name:
            return f"{DOWNLOAD_URL}{entry['id']}"
    raise ValueError(f"EAGLE-I {year}: no file {name} in Figshare")


def fetch_year(year: int) -> pd.DataFrame:
    """Stream the year CSV from Figshare and return its metro rows."""
    url = file_url(year)
    try:
        with net.open_stream(url) as stream:
            return read_eaglei(stream, year)
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"EAGLE-I {year} stream failed: {exc!r}") from exc
