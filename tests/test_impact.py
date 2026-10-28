"""The impact window: its bounds, its step grid, and its constants."""

from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest

from hailprint import county, impact


def test_window_runs_48_hours_from_12z_of_the_storm_date():
    assert impact.window(date(2024, 5, 28)) == (
        datetime(2024, 5, 28, 12, tzinfo=UTC),
        datetime(2024, 5, 30, 12, tzinfo=UTC),
    )


@pytest.mark.parametrize("storm_date", [date(2024, 12, 31), date(2024, 2, 29)])
def test_steps_equal_the_pandas_range_of_192_steps_of_15_minutes_from_12z(storm_date):
    start = datetime(storm_date.year, storm_date.month, storm_date.day, 12, tzinfo=UTC)

    steps = impact.steps(storm_date)

    expected = pd.date_range(start, periods=192, freq=timedelta(minutes=15))
    pd.testing.assert_index_equal(steps, expected, exact=True)
    assert len(steps) == 192
    assert steps[0] == start
    assert steps[-1] == start + 191 * timedelta(minutes=15)
    assert (steps.tz, steps.freq, steps.unit) == (expected.tz, expected.freq, expected.unit)


def test_the_constants_agree_with_each_other_and_with_the_metro_counties():
    assert impact.STEP * impact.STEPS == impact.WINDOW
    assert impact.METRO_FIPS == frozenset(county.METRO_NAMES)
