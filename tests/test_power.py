"""EAGLE-I ingest: `read_eaglei` on CSV text, and the real 2024 file behind `needs_eaglei`."""

import io
from pathlib import Path

import pandas as pd
import pytest

from hailprint import power
from tests.conftest import EAGLEI_2024, needs_eaglei

FIXTURES = Path(__file__).parent / "fixtures"
FIVE = FIXTURES / "eaglei_5col.csv"
SIX = FIXTURES / "eaglei_6col.csv"

# Sorted by fips, then time. Fort Bend is blank in the CSV, Harris has an explicit 0 at the end.
EXPECTED = pd.DataFrame(
    {
        "fips": ["48039", "48157", "48201", "48201", "48201"],
        "time_utc": pd.to_datetime(
            [
                "2024-05-16 23:45",
                "2024-05-16 23:45",
                "2024-05-16 22:45",
                "2024-05-16 23:45",
                "2024-05-17 00:00",
            ],
            utc=True,
        ),
        "customers_out": pd.array([12, None, 452, 277975, 0], dtype="Int64"),
    }
)


class Trickle(io.RawIOBase):
    """A binary stream that gives at most 7 bytes per read, like a slow network."""

    def __init__(self, data: bytes):
        self._data = io.BytesIO(data)

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:
        return self._data.readinto(memoryview(buffer)[:7])


def _read(path: Path, year: int = 2024, **kwargs) -> pd.DataFrame:
    return power.read_eaglei(io.BytesIO(path.read_bytes()), year, **kwargs)


def test_read_eaglei_keeps_the_metro_rows_sorted_by_county_and_time():
    pd.testing.assert_frame_equal(_read(FIVE), EXPECTED)


def test_a_header_with_total_customers_gives_the_same_frame_as_one_without():
    pd.testing.assert_frame_equal(_read(SIX), _read(FIVE))


def test_a_blank_customers_out_is_null_and_an_explicit_zero_stays_zero():
    frame = _read(FIVE)

    assert frame.loc[frame["fips"] == "48157", "customers_out"].isna().all()
    assert frame["customers_out"].eq(0).sum() == 1


def test_a_county_outside_the_metro_drops():
    assert set(_read(FIVE)["fips"]) == {"48039", "48157", "48201"}


@pytest.mark.parametrize("chunk_rows", [1, 2, 3, 1000])
def test_a_chunk_edge_inside_a_row_loses_no_row(chunk_rows):
    stream = Trickle(FIVE.read_bytes())

    pd.testing.assert_frame_equal(power.read_eaglei(stream, 2024, chunk_rows=chunk_rows), EXPECTED)


def test_a_csv_without_customers_out_raises_one_line_that_names_the_year_and_the_column():
    text = "fips_code,county,state,run_start_time\n48201,Harris,Texas,2024-05-16 22:45:00\n"

    with pytest.raises(ValueError) as caught:
        power.read_eaglei(io.BytesIO(text.encode()), 2021)

    assert str(caught.value) == "EAGLE-I 2021: the CSV has no customers_out column"


def test_a_csv_without_a_metro_row_raises_with_the_year():
    text = "fips_code,customers_out,run_start_time\n48453,9,2024-05-16 22:45:00\n"

    with pytest.raises(ValueError) as caught:
        power.read_eaglei(io.BytesIO(text.encode()), 2024)

    assert str(caught.value) == "EAGLE-I 2024: the CSV has no metro row"


@pytest.mark.parametrize("value", ["12.5", "many"])
def test_a_customers_out_that_is_not_a_whole_count_raises_with_the_year(value):
    text = f"fips_code,customers_out,run_start_time\n48201,{value},2024-05-16 22:45:00\n"

    with pytest.raises(ValueError, match="EAGLE-I 2024: customers_out"):
        power.read_eaglei(io.BytesIO(text.encode()), 2024)


def test_a_run_start_time_that_is_not_a_time_raises_with_the_year():
    text = "fips_code,customers_out,run_start_time\n48201,12,not a time\n"

    with pytest.raises(ValueError, match="EAGLE-I 2024: run_start_time"):
        power.read_eaglei(io.BytesIO(text.encode()), 2024)


def test_the_file_name_holds_the_year():
    assert power.file_name(2024) == "eaglei-2024.parquet"


@needs_eaglei
def test_harris_goes_from_under_1000_to_over_200000_customers_out_on_2024_05_16():
    harris = pd.read_parquet(EAGLEI_2024).query("fips == '48201'").set_index("time_utc")

    assert harris.loc[pd.Timestamp("2024-05-16 22:45", tz="UTC"), "customers_out"] < 1_000
    assert harris.loc[pd.Timestamp("2024-05-16 23:45", tz="UTC"), "customers_out"] > 200_000
