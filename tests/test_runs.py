"""The settled rules, the window test, and the run loop of the `--missing` commands."""

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pyproj.exceptions
import pytest
import shapely.errors

from hailprint import candidates, files, impact, internet, odin, power, runs, sbw

NOW = datetime(2024, 6, 1, 12, 0, tzinfo=UTC)
STORM_DATE = date(2024, 5, 28)


def _warnings(directory: Path, storm_date: date, rows: int) -> Path:
    frame = pd.DataFrame({"eventid": pd.Series(range(rows), dtype="int64")})
    return files.write_atomic(frame, directory / sbw.file_name(storm_date), sbw.METADATA)


def _internet(directory: Path, storm_date: date, *, ratio: bool) -> Path:
    frame = pd.DataFrame({"ratio": [1.0]}) if ratio else pd.DataFrame({"ratio": [float("nan")] * 3})
    return files.write_atomic(frame, directory / internet.file_name(storm_date), internet.METADATA)


def _eaglei(directory: Path, storm_date: date) -> None:
    for year in power.years_of(storm_date):
        files.write_atomic(
            pd.DataFrame({"fips": ["48201"]}), directory / power.file_name(year), power.METADATA
        )


def _power(directory: Path, storm_date: date, metadata: dict[str, str]) -> Path:
    path = directory / power.day_file_name(storm_date)
    return files.write_atomic(pd.DataFrame({"fips": ["48201"]}), path, metadata)


UNREADABLE = [
    OSError("x"),
    ValueError("x"),
    KeyError("x"),
    TypeError("x"),
    AttributeError("x"),
    pa.ArrowException("x"),
    shapely.errors.ShapelyError("x"),
    pyproj.exceptions.ProjError("x"),
]


def test_a_file_with_content_is_settled_and_a_covered_eaglei_file_needs_no_power_run(tmp_path):
    _warnings(tmp_path / "warnings", STORM_DATE, 1)
    _internet(tmp_path / "internet", STORM_DATE, ratio=True)
    _eaglei(tmp_path / "eaglei", STORM_DATE)
    _power(tmp_path / "power", STORM_DATE, power.METADATA)

    assert (
        runs.warnings_settled(tmp_path / "warnings", STORM_DATE, NOW),
        runs.internet_settled(tmp_path / "internet", STORM_DATE, NOW),
        runs.needs_power(STORM_DATE, tmp_path / "power", tmp_path / "eaglei"),
        runs.window_closed(STORM_DATE, NOW),
    ) == (True, True, False, True)


@pytest.mark.parametrize(
    ("age_days", "settled"), [(candidates.FRESH_DAYS, False), (candidates.FRESH_DAYS + 1, True)]
)
def test_an_empty_file_settles_only_after_fresh_days(tmp_path, age_days, settled):
    storm_date = NOW.date() - timedelta(days=age_days)
    _warnings(tmp_path / "warnings", storm_date, 0)
    _internet(tmp_path / "internet", storm_date, ratio=False)

    assert runs.warnings_settled(tmp_path / "warnings", storm_date, NOW) is settled
    assert runs.internet_settled(tmp_path / "internet", storm_date, NOW) is settled


def test_a_window_is_closed_at_its_end_and_open_one_microsecond_before():
    _, end = impact.window(STORM_DATE)

    assert runs.window_closed(STORM_DATE, end) is True
    assert runs.window_closed(STORM_DATE, end - timedelta(microseconds=1)) is False


@pytest.mark.parametrize("state", ["absent", "not parquet"])
def test_an_absent_or_unreadable_file_has_no_rows_and_is_not_settled(tmp_path, state):
    path = tmp_path / sbw.file_name(STORM_DATE)
    if state == "not parquet":
        path.write_bytes(b"junk")
    internet_path = tmp_path / internet.file_name(STORM_DATE)
    if state == "not parquet":
        internet_path.write_bytes(b"junk")

    assert runs.rows(path) is None
    assert runs.warnings_settled(tmp_path, STORM_DATE, NOW) is False
    assert runs.internet_settled(tmp_path, STORM_DATE, NOW) is False


def test_a_power_file_without_source_metadata_needs_a_power_run(tmp_path):
    _eaglei(tmp_path / "eaglei", STORM_DATE)
    (tmp_path / "power").mkdir()
    pd.DataFrame({"fips": ["48201"]}).to_parquet(
        tmp_path / "power" / power.day_file_name(STORM_DATE)
    )

    assert runs.needs_power(STORM_DATE, tmp_path / "power", tmp_path / "eaglei") is True


@pytest.mark.parametrize("error", UNREADABLE, ids=lambda error: type(error).__name__)
def test_a_metadata_read_that_raises_makes_rows_none_and_a_power_file_rebuilt(
    tmp_path, monkeypatch, error
):
    def fail(path):
        raise error

    path = _warnings(tmp_path / "warnings", STORM_DATE, 1)
    _eaglei(tmp_path / "eaglei", STORM_DATE)
    _power(tmp_path / "power", STORM_DATE, power.METADATA)
    monkeypatch.setattr(pq, "read_metadata", fail)
    monkeypatch.setattr(power, "file_source", fail)

    assert runs.rows(path) is None
    assert runs.needs_power(STORM_DATE, tmp_path / "power", tmp_path / "eaglei") is True


def test_an_odin_power_file_is_replaced_only_when_eaglei_covers_the_window(tmp_path):
    _power(tmp_path / "power", STORM_DATE, odin.METADATA)

    assert runs.needs_power(STORM_DATE, tmp_path / "power", tmp_path / "eaglei") is False
    _eaglei(tmp_path / "eaglei", STORM_DATE)
    assert runs.needs_power(STORM_DATE, tmp_path / "power", tmp_path / "eaglei") is True
