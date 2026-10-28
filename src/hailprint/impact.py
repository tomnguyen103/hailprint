"""The impact window: 12:00 UTC on the storm date up to 12:00 UTC two days later.

The window holds 192 steps of 15 minutes.
"""

from datetime import UTC, date, datetime, timedelta

import pandas as pd

from hailprint import county

WINDOW = timedelta(hours=48)
STEP = timedelta(minutes=15)
STEPS = 192
METRO_FIPS = frozenset(county.METRO_NAMES)

assert STEP * STEPS == WINDOW


def window(storm_date: date) -> tuple[datetime, datetime]:
    """The impact window of the storm date: 12:00 UTC on D up to 12:00 UTC on D+2."""
    start = datetime(storm_date.year, storm_date.month, storm_date.day, 12, tzinfo=UTC)
    return start, start + WINDOW


def steps(storm_date: date) -> pd.DatetimeIndex:
    """The 192 step starts of the impact window of the storm date."""
    start, _ = window(storm_date)
    return pd.date_range(start, periods=STEPS, freq=STEP)
