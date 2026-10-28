"""The `--missing` rules: which storm dates need a fetch or a build.

A settled file needs no new fetch. An absent or unreadable file is never settled.
"""

from datetime import date, datetime
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pyproj.exceptions
import shapely.errors

from hailprint import candidates, impact, internet, odin, power, sbw

# What a derived Parquet that cannot serve its layer raises: a bad file, a missing column or
# metadata key, a column of the wrong type (`ArrowTypeError` is a TypeError; `.dt` raises an
# AttributeError). A geometry column with invalid WKB raises a GEOSException, a ShapelyError.
# A `crs` entry that pyproj cannot parse raises a CRSError, a ProjError (and a RuntimeError).
UNREADABLE = (
    OSError,
    ValueError,
    KeyError,
    TypeError,
    AttributeError,
    pa.ArrowException,
    shapely.errors.ShapelyError,
    pyproj.exceptions.ProjError,
)


def rows(path: Path) -> int | None:
    """The row count of a Parquet file, or None when the file is unreadable."""
    try:
        return pq.read_metadata(path).num_rows
    except UNREADABLE:
        return None


def window_closed(storm_date: date, now: datetime) -> bool:
    """True when `now` is at or past the end of the impact window of the storm date."""
    _, end = impact.window(storm_date)
    return end <= now


def warnings_settled(directory: Path, storm_date: date, now: datetime) -> bool:
    """True when the warnings file holds a row, or holds none for a date older than FRESH_DAYS.

    An unreadable file is not settled: the date is fetched again and the file is rewritten.
    """
    path = directory / sbw.file_name(storm_date)
    if not path.exists():
        return False
    count = rows(path)
    if count is None:
        return False
    # a gap is never zero: an empty file of a fresh date may be a late IEM feed
    return count > 0 or (now.date() - storm_date).days > candidates.FRESH_DAYS


def internet_settled(directory: Path, storm_date: date, now: datetime) -> bool:
    """True when the internet file holds a ratio, or holds none for a date older than FRESH_DAYS."""
    path = directory / internet.file_name(storm_date)
    if not path.exists():
        return False
    try:
        has_ratio = bool(pd.read_parquet(path, columns=["ratio"])["ratio"].notna().any())
    except UNREADABLE:  # an unreadable file is fetched again and rewritten
        return False
    # a gap is never zero: an all-null file of a fresh date may be a late IODA feed
    return has_ratio or (now.date() - storm_date).days > candidates.FRESH_DAYS


def needs_power(storm_date: date, power_dir: Path, eaglei_dir: Path) -> bool:
    """True when the date has no power file, or has an ODIN file that EAGLE-I now replaces."""
    path = power_dir / power.day_file_name(storm_date)
    if not path.exists():
        return True
    try:
        source = power.file_source(path)
    except UNREADABLE:
        return True  # an unreadable file is rebuilt
    if source is None:
        return True  # a file with no source metadata is rebuilt
    covered = all((eaglei_dir / power.file_name(y)).exists() for y in power.years_of(storm_date))
    return covered and source == odin.METADATA["source"]
