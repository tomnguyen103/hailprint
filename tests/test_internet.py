"""IODA internet reachability: `parse`, `ratio`, `drop`, `derive`, and `build`."""

import json
import re
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from hailprint import county, impact, internet
from tests.conftest import needs_network

FIXTURES = Path(__file__).parent / "fixtures"
PLAN = Path(__file__).parent.parent / "docs" / "plans" / "plan-v6.md"
STORM = date(2024, 5, 17)
FIRST = int(impact.window(STORM)[0].timestamp())  # 12:00 UTC on the storm date
BASE_FIRST = FIRST - 7 * 86400
LAST = FIRST + 192 * 900
HARRIS = "48201"


def _points(first: int, last: int, value: float, step: int = 600) -> dict[int, float]:
    return {epoch: value for epoch in range(first, last, step)}


def _harris(day: pd.DataFrame) -> pd.DataFrame:
    return day.loc[day["fips"] == HARRIS].set_index("step_utc")


def _body(values: list, step: int = 600, error=None) -> bytes:
    entry = {"from": FIRST, "until": FIRST + 600 * len(values), "step": step, "values": values}
    return json.dumps({"error": error, "data": [[entry]]}).encode()


def _plan_table() -> dict[str, tuple[str, str]]:
    rows = re.findall(r"^\| (48\d{3}) \| ([A-Za-z ]+) \| (\d+) \|", PLAN.read_text("utf-8"), re.M)
    return {fips: (name, code) for fips, name, code in rows}


def test_the_ioda_codes_match_the_plan_table_and_cover_the_metro_counties():
    table = _plan_table()

    assert len(table) == 8
    assert internet.IODA_CODES == {fips: code for fips, (_, code) in table.items()}
    assert set(internet.IODA_CODES) == set(county.METRO_NAMES)
    assert {fips: name for fips, (name, _) in table.items()} == county.METRO_NAMES


def test_parse_reads_a_real_ioda_response():
    points = internet.parse((FIXTURES / "ioda_harris.json").read_bytes())

    assert points == {
        1715900400: 8696,
        1715901000: 8516,
        1715901600: 8187,
        1715902200: 7839,
        1715902800: 7590,
    }


def test_parse_gives_no_points_for_a_window_with_no_signal():
    assert internet.parse((FIXTURES / "ioda_empty.json").read_bytes()) == {}


def test_parse_skips_a_null_value_and_keeps_the_epoch_of_the_others():
    assert internet.parse(_body([5, None, 7])) == {FIRST: 5, FIRST + 1200: 7}


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        json.dumps({"error": None}).encode(),
        json.dumps({"error": None, "data": [[]]}).encode().replace(b"[[]]", b"[[1]]"),
        _body([1], error="rate limited"),
        _body([1], step=300),
        _body([1]).replace(b'"values": [1]', b'"values": ["x"]'),
        _body([1]).replace(b'"values": [1]', b'"values": [NaN]'),
        _body([1]).replace(b'"values": [1]', b'"values": [-4]'),
        _body([1]).replace(b'"values": [1]', b'"values": [1' + b"0" * 400 + b"]"),
        _body([1]).replace(f'"from": {FIRST}'.encode(), b'"from": true'),
        _body([1]).replace(b'"values": [1]', b'"values": [1e308]'),
        _body([1]).replace(b'"values": [1]', f'"values": [{internet.MAX_COUNT + 1}]'.encode()),
    ],
)
def test_parse_rejects_a_response_that_is_not_the_signal_shape(body):
    with pytest.raises(ValueError, match="IODA"):
        internet.parse(body)


def test_ratio_is_the_value_over_the_baseline_to_3_decimals():
    assert internet.ratio(900, 1000) == 0.9
    assert internet.ratio(1, 3) == 0.333
    assert internet.ratio(1200, 1000) == 1.2


@pytest.mark.parametrize(("value", "baseline"), [(None, 1000), (900, None), (900, 0), (None, None)])
def test_ratio_is_null_without_a_value_or_a_positive_baseline(value, baseline):
    assert internet.ratio(value, baseline) is None


def test_drop_is_one_minus_the_ratio_and_never_below_zero():
    assert internet.drop(0.9) == 0.1
    assert internet.drop(0.0) == 1.0
    assert internet.drop(1.0) == 0.0
    assert internet.drop(1.2) == 0.0
    assert internet.drop(None) is None


def test_the_window_holds_192_steps_per_county_with_the_parquet_columns():
    day = internet.derive(STORM, {HARRIS: _points(BASE_FIRST, LAST, 1000)})

    assert list(day.columns) == ["fips", "step_utc", "value", "baseline", "ratio"]
    assert day["fips"].nunique() == 8
    assert day.groupby("fips").size().eq(192).all()
    steps = _harris(day).index
    assert steps[0] == pd.Timestamp("2024-05-17 12:00", tz="UTC")
    assert steps[-1] == pd.Timestamp("2024-05-19 11:45", tz="UTC")
    assert steps.to_series().diff().dropna().eq(pd.Timedelta(minutes=15)).all()


def test_a_steady_signal_gives_a_ratio_of_one_at_every_step():
    harris = _harris(internet.derive(STORM, {HARRIS: _points(BASE_FIRST, LAST, 1000)}))

    assert harris["baseline"].eq(1000).all()
    assert harris["ratio"].eq(1.0).all()


def test_a_step_is_the_median_of_the_points_inside_it():
    points = _points(BASE_FIRST, LAST, 1000)
    points[FIRST] = 800  # step 0 holds the points at :00 and :10
    points[FIRST + 600] = 900
    points[FIRST + 1200] = 700  # step 1 holds the point at :20 only

    harris = _harris(internet.derive(STORM, {HARRIS: points}))

    assert harris["value"].iloc[0] == 850
    assert harris["ratio"].iloc[0] == 0.85
    assert harris["value"].iloc[1] == 700
    assert harris["ratio"].iloc[1] == 0.7


def test_a_step_with_no_point_is_null_and_never_zero():
    points = _points(BASE_FIRST, LAST, 1000)
    del points[FIRST + 3000]  # step 3 holds the point at :50 only

    harris = _harris(internet.derive(STORM, {HARRIS: points}))

    assert np.isnan(harris["value"].iloc[3])
    assert np.isnan(harris["ratio"].iloc[3])
    assert harris["baseline"].iloc[3] == 1000
    assert harris["value"].iloc[2] == 1000


def test_the_baseline_is_the_median_of_the_7_days_before_the_window():
    points = _points(BASE_FIRST, FIRST, 1000)
    for epoch in range(BASE_FIRST, BASE_FIRST + 100 * 600, 600):
        points[epoch] = 1_000_000  # an outlier burst that a mean would feel
    points.update(_points(FIRST, LAST, 500))

    harris = _harris(internet.derive(STORM, {HARRIS: points}))

    assert harris["baseline"].eq(1000).all()
    assert harris["ratio"].eq(0.5).all()


def test_a_baseline_of_exactly_half_its_points_is_valid_and_one_fewer_is_null():
    window = _points(FIRST, LAST, 500)
    half = {**_points(BASE_FIRST, BASE_FIRST + 504 * 600, 1000), **window}
    short = {**_points(BASE_FIRST, BASE_FIRST + 503 * 600, 1000), **window}

    valid = _harris(internet.derive(STORM, {HARRIS: half}))
    null = _harris(internet.derive(STORM, {HARRIS: short}))

    assert valid["baseline"].eq(1000).all()
    assert valid["ratio"].eq(0.5).all()
    assert null["baseline"].isna().all()
    assert null["ratio"].isna().all()
    assert null["value"].eq(500).all()


def test_a_county_with_no_point_is_null_at_every_step():
    day = internet.derive(STORM, {HARRIS: _points(BASE_FIRST, LAST, 1000)})
    fort_bend = day.loc[day["fips"] == "48157"]

    assert len(fort_bend) == 192
    assert fort_bend[["value", "baseline", "ratio"]].isna().all().all()


def test_a_zero_baseline_gives_null_ratios():
    harris = _harris(internet.derive(STORM, {HARRIS: _points(BASE_FIRST, LAST, 0)}))

    assert harris["baseline"].eq(0).all()
    assert harris["ratio"].isna().all()


def test_build_asks_each_county_once_for_the_baseline_and_the_window(ioda):
    ioda.add(HARRIS, BASE_FIRST, LAST, 1000)

    day = internet.build(STORM)

    assert len(ioda.urls) == 8
    harris_url = next(url for url in ioda.urls if f"/county/{internet.IODA_CODES[HARRIS]}?" in url)
    assert f"from={BASE_FIRST}&until={LAST}&datasource=ping-slash24" in harris_url
    assert _harris(day)["ratio"].eq(1.0).all()
    assert day.loc[day["fips"] != HARRIS, "ratio"].isna().all()


def test_build_raises_a_runtime_error_when_the_network_fails(ioda):
    ioda.error = TimeoutError("timed out")

    with pytest.raises(RuntimeError, match=r"IODA 48\d{3}.*timed out"):
        internet.build(STORM)


@needs_network
def test_harris_reachability_fell_below_baseline_during_the_may_2024_derecho():
    day = internet.build(date(2024, 5, 16))  # storm date D; 01:00 UTC on D+1 is step 52

    harris = _harris(day)
    assert harris.index[52] == pd.Timestamp("2024-05-17 01:00", tz="UTC")
    assert harris["ratio"].iloc[52] < 0.9
