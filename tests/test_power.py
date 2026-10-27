"""EAGLE-I ingest and the power window: `read_eaglei`, `derive`, and the real 2024 file."""

import io
from datetime import date
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import pytest

from hailprint import files, odin, power
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


# The MCC 2022 customers per county, copied from the table in docs/plans/plan-v6.md section 3.
MCC_TABLE = {
    "48201": 1_827_686,  # Harris
    "48157": 694_780,  # Fort Bend
    "48339": 230_040,  # Montgomery
    "48039": 144_164,  # Brazoria
    "48167": 144_421,  # Galveston
    "48473": 18_532,  # Waller
    "48291": 44_189,  # Liberty
    "48071": 26_381,  # Chambers
}
STORM = date(2024, 5, 28)  # window: 2024-05-28 12:00 UTC up to 2024-05-30 12:00 UTC


def _rows(*rows: tuple[str, str, int | None]) -> pd.DataFrame:
    """An EAGLE-I frame: `fips`, `time_utc`, nullable `customers_out`."""
    return pd.DataFrame(
        {
            "fips": [fips for fips, _, _ in rows],
            "time_utc": pd.to_datetime([time for _, time, _ in rows], utc=True),
            "customers_out": pd.array([out for _, _, out in rows], dtype="Int64"),
        }
    )


def _harris(day: pd.DataFrame) -> pd.Series:
    return day.loc[day["fips"] == "48201"].set_index("step_utc")["customers_out"]


def test_the_mcc_constants_match_the_plan_table_and_cover_the_metro_counties():
    assert power.MCC == MCC_TABLE
    assert set(power.MCC) == power.METRO_FIPS


def test_the_window_holds_192_steps_per_county_from_12z_d_to_12z_d_plus_2():
    day = power.derive(_rows(("48201", "2024-05-28 20:00", 5)), STORM)

    assert list(day.columns) == ["fips", "step_utc", "customers_out"]
    assert day["fips"].nunique() == 8
    assert day.groupby("fips").size().eq(192).all()
    steps = _harris(day).index
    assert steps[0] == pd.Timestamp("2024-05-28 12:00", tz="UTC")
    assert steps[-1] == pd.Timestamp("2024-05-30 11:45", tz="UTC")
    assert steps.to_series().diff().dropna().eq(pd.Timedelta(minutes=15)).all()


def test_an_absent_step_is_null_and_an_explicit_zero_stays_zero():
    day = power.derive(
        _rows(
            ("48201", "2024-05-28 13:00", 5),
            ("48201", "2024-05-28 13:15", 0),
            ("48201", "2024-05-28 13:45", 7),
        ),
        STORM,
    )

    harris = _harris(day)
    assert harris.loc[pd.Timestamp("2024-05-28 13:00", tz="UTC")] == 5
    assert harris.loc[pd.Timestamp("2024-05-28 13:15", tz="UTC")] == 0
    assert pd.isna(harris.loc[pd.Timestamp("2024-05-28 13:30", tz="UTC")])
    assert harris.loc[pd.Timestamp("2024-05-28 13:45", tz="UTC")] == 7
    assert harris.notna().sum() == 3
    assert day.loc[day["fips"] == "48039", "customers_out"].isna().all()
    assert day["customers_out"].dtype == "Int64"


def test_a_row_outside_the_window_drops():
    day = power.derive(
        _rows(
            ("48201", "2024-05-28 11:45", 1),
            ("48201", "2024-05-28 12:00", 2),
            ("48201", "2024-05-30 11:45", 3),
            ("48201", "2024-05-30 12:00", 4),
        ),
        STORM,
    )

    assert _harris(day).dropna().tolist() == [2, 3]


def test_two_rows_for_one_county_step_raise_with_the_date_and_the_count():
    frame = _rows(("48201", "2024-05-28 13:00", 5), ("48201", "2024-05-28 13:00", 6))

    with pytest.raises(ValueError, match="EAGLE-I 2024-05-28: duplicate county steps: 1"):
        power.derive(frame, STORM)


def test_a_window_across_new_year_takes_its_rows_from_both_year_frames():
    storm = date(2024, 12, 31)
    frame = pd.concat(
        [
            _rows(("48201", "2024-12-31 23:45", 7)),
            _rows(("48201", "2025-01-01 00:00", 9)),
        ],
        ignore_index=True,
    )

    assert power.years_of(storm) == [2024, 2025]
    assert power.years_of(STORM) == [2024]
    assert _harris(power.derive(frame, storm)).dropna().tolist() == [7, 9]


def test_share_out_is_customers_out_over_the_mcc_customers_and_null_stays_null():
    day = power.derive(
        _rows(("48201", "2024-05-28 13:00", 913_843), ("48071", "2024-05-28 13:00", 0)), STORM
    )

    share = power.share_out(day)

    at = day["step_utc"] == pd.Timestamp("2024-05-28 13:00", tz="UTC")
    assert share[at & (day["fips"] == "48201")].item() == pytest.approx(913_843 / 1_827_686)
    assert share[at & (day["fips"] == "48071")].item() == 0
    assert share[at & (day["fips"] == "48039")].isna().item()


def test_the_day_file_name_holds_the_storm_date():
    assert power.day_file_name(STORM) == "power-2024-05-28.parquet"


CENTERPOINT = "CENTERPOINT ENERGY"
HARRIS = "48201"
LIBERTY = "48291"


def _write_eaglei(directory: Path, year: int, *rows: tuple[str, str, int | None]) -> Path:
    return files.write_atomic(_rows(*rows), directory / power.file_name(year), power.METADATA)


def _write_odin(directory: Path, day: str, *rows: tuple[str, str, str, int]) -> Path:
    """An ODIN day file from (slot, fips, utility, customers_out) rows."""
    frame = pd.DataFrame(
        {
            "slot_utc": pd.to_datetime([slot for slot, *_ in rows], utc=True).as_unit("us"),
            "fips": [fips for _, fips, _, _ in rows],
            "utility": [utility for _, _, utility, _ in rows],
            "customers_out": [out for _, _, _, out in rows],
        }
    )
    path = directory / odin.file_name(date.fromisoformat(day))
    return files.write_atomic(frame, path, odin.METADATA)


def _at(stamp: str) -> pd.Timestamp:
    return pd.Timestamp(stamp, tz="UTC")


def test_a_window_in_a_year_with_an_eaglei_file_reads_eaglei_and_sets_the_eaglei_metadata(tmp_path):
    _write_eaglei(tmp_path / "e", 2024, (HARRIS, "2024-05-28 20:00", 251_830))
    _write_odin(tmp_path / "o", "2024-05-28", ("2024-05-28 20:00", HARRIS, CENTERPOINT, 5))

    frame, metadata = power.build(STORM, tmp_path / "e", tmp_path / "o")

    assert metadata == {"source": "eaglei", "product": "customers-out"}
    assert _harris(frame).dropna().tolist() == [251_830]


def test_a_window_without_an_eaglei_file_reads_the_odin_day_files_and_lists_the_utilities(tmp_path):
    _write_odin(
        tmp_path / "o",
        "2024-05-28",
        ("2024-05-28 14:00", HARRIS, CENTERPOINT, 714),
        ("2024-05-28 14:15", HARRIS, odin.NO_INCIDENT, 0),
    )

    frame, metadata = power.build(STORM, tmp_path / "e", tmp_path / "o")

    assert metadata == {
        "source": "odin",
        "product": "odin-real-time-outages-county",
        "utilities": '["CENTERPOINT ENERGY"]',
    }
    assert list(frame.columns) == ["fips", "step_utc", "customers_out"]
    assert len(frame) == 8 * 192
    assert frame["customers_out"].dtype == "Int64"
    harris = _harris(frame)
    assert harris.loc[_at("2024-05-28 14:00")] == 714
    assert harris.loc[_at("2024-05-28 14:15")] == 0
    assert harris.notna().sum() == 2


def test_a_county_with_no_incident_in_the_window_is_null_at_all_192_steps(tmp_path):
    _write_odin(
        tmp_path / "o",
        "2024-05-28",
        ("2024-05-28 14:00", HARRIS, CENTERPOINT, 714),
        ("2024-05-28 14:00", LIBERTY, odin.NO_INCIDENT, 0),
        ("2024-05-28 14:15", LIBERTY, odin.NO_INCIDENT, 0),
    )

    frame, _ = power.build(STORM, tmp_path / "e", tmp_path / "o")

    liberty = frame.loc[frame["fips"] == LIBERTY, "customers_out"]
    assert len(liberty) == 192 and liberty.isna().all()


def test_odin_sums_the_utilities_of_a_county_at_one_slot(tmp_path):
    _write_odin(
        tmp_path / "o",
        "2024-05-28",
        ("2024-05-28 14:00", HARRIS, CENTERPOINT, 714),
        ("2024-05-28 14:00", HARRIS, "ENTERGY TEXAS", 6),
    )

    frame, metadata = power.build(STORM, tmp_path / "e", tmp_path / "o")

    assert _harris(frame).loc[_at("2024-05-28 14:00")] == 720
    assert metadata["utilities"] == '["CENTERPOINT ENERGY", "ENTERGY TEXAS"]'


def test_an_odin_window_reads_the_three_utc_day_files_and_drops_a_slot_outside_it(tmp_path):
    directory = tmp_path / "o"
    _write_odin(
        directory,
        "2024-05-28",
        ("2024-05-28 11:45", HARRIS, CENTERPOINT, 1),
        ("2024-05-28 23:45", HARRIS, CENTERPOINT, 2),
    )
    _write_odin(directory, "2024-05-29", ("2024-05-29 12:00", HARRIS, CENTERPOINT, 3))
    _write_odin(
        directory,
        "2024-05-30",
        ("2024-05-30 11:45", HARRIS, CENTERPOINT, 4),
        ("2024-05-30 12:00", HARRIS, CENTERPOINT, 5),
    )

    frame, _ = power.build(STORM, tmp_path / "e", directory)

    assert _harris(frame).dropna().tolist() == [2, 3, 4]


def test_an_absent_odin_day_file_gives_null_steps_for_that_day(tmp_path):
    directory = tmp_path / "o"
    _write_odin(directory, "2024-05-28", ("2024-05-28 14:00", HARRIS, CENTERPOINT, 8))
    _write_odin(directory, "2024-05-30", ("2024-05-30 09:00", HARRIS, CENTERPOINT, 9))

    frame, _ = power.build(STORM, tmp_path / "e", directory)

    harris = _harris(frame)
    middle = (harris.index >= _at("2024-05-29 00:00")) & (harris.index < _at("2024-05-30 00:00"))
    assert middle.sum() == 96 and harris[middle].isna().all()
    assert harris.dropna().tolist() == [8, 9]


def test_a_window_with_no_eaglei_file_and_no_odin_slot_has_no_source(tmp_path):
    assert power.build(STORM, tmp_path / "e", tmp_path / "o") is None
    _write_odin(tmp_path / "o", "2024-05-30", ("2024-05-30 12:00", HARRIS, CENTERPOINT, 5))

    assert power.build(STORM, tmp_path / "e", tmp_path / "o") is None


def test_a_window_across_new_year_reads_both_eaglei_files(tmp_path):
    storm = date(2024, 12, 31)
    _write_eaglei(tmp_path / "e", 2024, (HARRIS, "2024-12-31 23:45", 7))
    _write_eaglei(tmp_path / "e", 2025, (HARRIS, "2025-01-01 00:00", 9))

    frame, metadata = power.build(storm, tmp_path / "e", tmp_path / "o")

    assert metadata["source"] == "eaglei"
    assert _harris(frame).dropna().tolist() == [7, 9]


def test_one_eaglei_file_of_two_never_mixes_with_odin(tmp_path):
    storm = date(2024, 12, 31)
    _write_eaglei(tmp_path / "e", 2024, (HARRIS, "2024-12-31 23:45", 7))
    _write_odin(tmp_path / "o", "2024-12-31", ("2024-12-31 14:00", HARRIS, CENTERPOINT, 3))

    frame, metadata = power.build(storm, tmp_path / "e", tmp_path / "o")

    assert metadata["source"] == "odin"
    assert _harris(frame).dropna().tolist() == [3]


def test_file_source_reads_the_source_key_of_a_power_file(tmp_path):
    eaglei_path = files.write_atomic(
        pd.DataFrame({"fips": [HARRIS]}), tmp_path / "a.parquet", power.METADATA
    )
    odin_path = files.write_atomic(
        pd.DataFrame({"fips": [HARRIS]}), tmp_path / "b.parquet", {**odin.METADATA}
    )

    assert power.file_source(eaglei_path) == "eaglei"
    assert power.file_source(odin_path) == "odin"
    assert pq.read_schema(odin_path).metadata[b"source"] == b"odin"


@needs_eaglei
def test_the_harris_peak_of_2024_05_28_is_251830_at_2024_05_28_20_00_utc():
    day = power.derive(pd.read_parquet(EAGLEI_2024), STORM)

    harris = _harris(day)
    assert harris.max() == 251_830
    assert harris.idxmax() == pd.Timestamp("2024-05-28 20:00", tz="UTC")


@needs_eaglei
def test_the_harris_peak_of_beryl_is_1660703_at_19_15_utc_and_no_share_out_passes_1():
    day = power.derive(pd.read_parquet(EAGLEI_2024), date(2024, 7, 8))

    harris = _harris(day)
    assert harris.max() == 1_660_703
    assert harris.idxmax() == pd.Timestamp("2024-07-08 19:15", tz="UTC")
    assert power.share_out(day).max() <= 1.0
