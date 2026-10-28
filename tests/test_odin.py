"""ODIN snapshot: the quarter-hour slot, the county rows, the day merge, and the fetch."""

import json
import urllib.error
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd
import pytest

from hailprint import county, odin
from tests.conftest import needs_network

FIXTURES = Path(__file__).parent / "fixtures"
# The live answer of the grouped query, cut from a real response: 7 metro counties, one utility.
LIVE = (FIXTURES / "odin_grouped.json").read_text(encoding="utf-8")
# The live shape with a non-metro county, a second utility, and a split utility id.
MIXED = (FIXTURES / "odin_mixed.json").read_text(encoding="utf-8")
SLOT = datetime(2024, 5, 28, 14, 0, tzinfo=UTC)
LIBERTY = "48291"


def _rows(frame: pd.DataFrame) -> list[tuple[str, str, int]]:
    return list(zip(frame["fips"], frame["utility"], frame["customers_out"], strict=True))


@pytest.mark.parametrize(
    ("moment", "slot"),
    [
        (datetime(2024, 5, 28, 14, 7, tzinfo=UTC), datetime(2024, 5, 28, 14, 0, tzinfo=UTC)),
        (datetime(2024, 5, 28, 14, 15, tzinfo=UTC), datetime(2024, 5, 28, 14, 15, tzinfo=UTC)),
        (
            datetime(2024, 5, 28, 14, 14, 59, 999999, tzinfo=UTC),
            datetime(2024, 5, 28, 14, 0, tzinfo=UTC),
        ),
        (datetime(2024, 5, 28, 23, 59, 59, tzinfo=UTC), datetime(2024, 5, 28, 23, 45, tzinfo=UTC)),
        (datetime(2024, 5, 28, 0, 0, tzinfo=UTC), datetime(2024, 5, 28, 0, 0, tzinfo=UTC)),
        # 09:07 at UTC-5 is 14:07 UTC
        (
            datetime(2024, 5, 28, 9, 7, tzinfo=timezone(timedelta(hours=-5))),
            datetime(2024, 5, 28, 14, 0, tzinfo=UTC),
        ),
    ],
)
def test_slot_of_floors_a_moment_to_the_quarter_hour_in_utc(moment, slot):
    assert odin.slot_of(moment) == slot
    assert odin.slot_of(moment).utcoffset() == timedelta(0)


def test_slot_of_rejects_a_naive_time_because_its_utc_day_is_unknown():
    with pytest.raises(ValueError, match="time zone"):
        odin.slot_of(datetime(2024, 5, 28, 14, 7))


def test_the_day_file_is_named_by_the_utc_day():
    assert odin.file_name(date(2024, 5, 28)) == "odin-2024-05-28.parquet"


def test_the_live_answer_gives_one_row_per_county_and_a_zero_row_for_the_empty_county():
    """O8: Liberty holds no open incident, so it gets one 0 row."""
    frame = odin.snapshot(LIVE, SLOT)

    assert _rows(frame) == [
        ("48039", "CENTERPOINT ENERGY", 13),
        ("48071", "CENTERPOINT ENERGY", 1),
        ("48157", "CENTERPOINT ENERGY", 1),
        ("48167", "CENTERPOINT ENERGY", 3),
        ("48201", "CENTERPOINT ENERGY", 714),
        (LIBERTY, "", 0),
        ("48339", "CENTERPOINT ENERGY", 1),
        ("48473", "CENTERPOINT ENERGY", 2),
    ]
    assert list(frame.columns) == ["slot_utc", "fips", "utility", "customers_out"]
    assert (frame["slot_utc"] == pd.Timestamp(SLOT)).all()
    assert str(frame["slot_utc"].dtype) == "datetime64[us, UTC]"
    assert str(frame["customers_out"].dtype) == "int64"


def test_a_snapshot_sums_per_fips_and_utility_drops_a_non_metro_fips_and_zero_fills_the_rest():
    frame = odin.snapshot(MIXED, SLOT)

    assert _rows(frame) == [
        ("48039", "", 0),
        ("48071", "", 0),
        ("48157", "SECOND TEST UTILITY", 40),
        ("48167", "", 0),
        # the two ids of one utility sum to one row: 700 + 14
        ("48201", "CENTERPOINT ENERGY", 714),
        ("48201", "SECOND TEST UTILITY", 6),
        (LIBERTY, "", 0),
        ("48339", "", 0),
        ("48473", "", 0),
    ]
    assert "04019" not in set(frame["fips"])
    assert not frame.duplicated(["fips", "utility"]).any()


def test_an_answer_with_no_open_incident_gives_one_zero_row_for_each_metro_county():
    """A successful fetch with zero results is a real "checked, none", not a gap."""
    frame = odin.snapshot('{"total_count": 0, "results": []}', SLOT)

    assert sorted(frame["fips"]) == sorted(county.METRO_NAMES)
    assert (frame["utility"] == "").all()
    assert (frame["customers_out"] == 0).all()


def test_the_query_sums_every_cause_for_the_eight_metro_fips_in_one_request():
    """Planned outages count: the grouped answer holds no cause, so the query must not filter."""
    query = parse_qs(urlparse(odin.URL).query)

    assert query["group_by"] == ["communitydescriptor,name"]
    assert query["select"] == ["communitydescriptor,name,sum(metersaffected) as customers_out"]
    assert "cause" not in odin.URL
    assert all(fips in query["where"][0] for fips in county.METRO_NAMES)
    assert query["limit"] == ["100"]


@pytest.mark.parametrize("text", ["not json", "", '{"results": [', "[]", "null", '{"total": 1}'])
def test_a_body_that_is_not_an_odin_answer_raises_value_error(text):
    with pytest.raises(ValueError, match="ODIN"):
        odin.snapshot(text, SLOT)


def test_a_body_given_as_bytes_parses_like_text():
    assert odin.snapshot(LIVE.encode(), SLOT).equals(odin.snapshot(LIVE, SLOT))


def _answer(*records: dict, total: int | None = None) -> str:
    return json.dumps({"total_count": len(records) if total is None else total, "results": records})


def _record(**changes) -> dict:
    record = {"communitydescriptor": "48201", "name": "CENTERPOINT ENERGY,8901", "customers_out": 5}
    record.update(changes)
    return record


@pytest.mark.parametrize(
    "bad",
    [
        {"customers_out": None},
        {"customers_out": -1},
        {"customers_out": "5"},
        {"customers_out": 5.5},
        {"customers_out": True},
        {"name": None},
        {"name": ",8901"},
        {"name": ""},
        {"communitydescriptor": None},
        {"communitydescriptor": 48201},
    ],
)
def test_a_record_with_a_bad_value_fails_the_whole_snapshot(bad):
    """A bad value makes the slot a gap. A partial slot would show a smaller total."""
    with pytest.raises(ValueError, match="ODIN record 1"):
        odin.snapshot(_answer(_record(), _record(**bad)), SLOT)


def test_a_record_without_a_field_fails_the_whole_snapshot():
    record = _record()
    del record["customers_out"]

    with pytest.raises(ValueError, match="ODIN record 0"):
        odin.snapshot(_answer(record), SLOT)


def test_a_truncated_answer_fails_the_snapshot_instead_of_summing_part_of_the_counties():
    with pytest.raises(ValueError, match="truncated"):
        odin.snapshot(_answer(_record(), total=101), SLOT)


def test_a_full_page_with_no_total_count_fails_the_snapshot():
    records = [_record(name=f"UTILITY {i},{i}") for i in range(odin.LIMIT)]
    body = json.dumps({"results": records})

    with pytest.raises(ValueError, match="no total_count"):
        odin.snapshot(body, SLOT)


@pytest.mark.parametrize("total", ['"150"', "150.0", "true", "[]"])
def test_a_total_count_that_is_not_a_whole_number_fails_the_snapshot(total):
    body = f'{{"total_count": {total}, "results": []}}'

    with pytest.raises(ValueError, match="total_count is not a whole number"):
        odin.snapshot(body, SLOT)


def test_a_null_total_count_is_read_as_no_total_count():
    records = [_record(name=f"UTILITY {i},{i}") for i in range(odin.LIMIT - 1)]

    frame = odin.snapshot(json.dumps({"total_count": None, "results": records}), SLOT)

    assert len(_rows(frame)) == odin.LIMIT - 1 + len(county.METRO_NAMES) - 1


def test_a_short_page_with_no_total_count_is_a_whole_answer():
    records = [_record(name=f"UTILITY {i},{i}") for i in range(odin.LIMIT - 1)]

    frame = odin.snapshot(json.dumps({"results": records}), SLOT)

    assert len(_rows(frame)) == odin.LIMIT - 1 + len(county.METRO_NAMES) - 1


def test_a_name_without_a_comma_is_the_whole_utility():
    frame = odin.snapshot(_answer(_record(name="SOLO UTILITY")), SLOT)

    assert ("48201", "SOLO UTILITY", 5) in _rows(frame)


def _frame(slot: datetime, *rows: tuple[str, str, int]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "slot_utc": pd.Series([pd.Timestamp(slot)] * len(rows)).dt.as_unit("us"),
            "fips": [r[0] for r in rows],
            "utility": [r[1] for r in rows],
            "customers_out": pd.Series([r[2] for r in rows], dtype="int64"),
        }
    )


def test_merge_without_a_day_file_returns_the_fresh_rows():
    fresh = _frame(SLOT, ("48201", "A", 1))

    assert odin.merge(None, fresh).equals(fresh)


def test_merge_replaces_the_rows_of_its_slot_and_keeps_the_other_slots_sorted():
    later = SLOT + timedelta(minutes=15)
    before = _frame(SLOT, ("48201", "A", 1), ("48201", "B", 2))
    middle = _frame(later, ("48201", "A", 9), ("48157", "A", 9))
    fresh = _frame(later, ("48201", "A", 4), ("48157", "A", 3))

    merged = odin.merge(pd.concat([middle, before], ignore_index=True), fresh)

    assert merged["slot_utc"].tolist() == [pd.Timestamp(SLOT)] * 2 + [pd.Timestamp(later)] * 2
    assert _rows(merged) == [
        ("48201", "A", 1),
        ("48201", "B", 2),
        ("48157", "A", 3),
        ("48201", "A", 4),
    ]
    assert not merged.duplicated(["slot_utc", "fips", "utility"]).any()
    assert str(merged["slot_utc"].dtype) == "datetime64[us, UTC]"


def test_merge_reads_a_day_file_whose_time_unit_differs():
    stored = _frame(SLOT, ("48201", "A", 1))
    stored["slot_utc"] = stored["slot_utc"].dt.as_unit("ns")

    merged = odin.merge(stored, _frame(SLOT + timedelta(minutes=15), ("48201", "A", 2)))

    assert str(merged["slot_utc"].dtype) == "datetime64[us, UTC]"
    assert len(merged) == 2


def test_fetch_returns_the_answer_text(monkeypatch):
    seen = []

    def get(url, timeout):
        seen.append(url)
        return LIVE.encode()

    monkeypatch.setattr(odin.net, "get", get)

    assert odin.fetch() == LIVE
    assert seen == [odin.URL]


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError("u", 503, "Service Unavailable", {}, None),
        urllib.error.URLError("no route"),
        TimeoutError("timed out"),
    ],
)
def test_fetch_turns_a_network_error_into_one_runtime_error(monkeypatch, error):
    def get(url, timeout):
        raise error

    monkeypatch.setattr(odin.net, "get", get)

    with pytest.raises(RuntimeError, match="ODIN fetch failed"):
        odin.fetch()


@needs_network
def test_the_live_answer_parses_and_covers_the_eight_metro_counties():
    """Live contract: the real grouped query gives a snapshot with all 8 FIPS and no gap."""
    frame = odin.snapshot(odin.fetch(), SLOT)

    assert set(frame["fips"]) == set(county.METRO_NAMES)
    assert (frame["customers_out"] >= 0).all()
