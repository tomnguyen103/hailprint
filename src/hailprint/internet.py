"""IODA internet reachability: the county ping-slash24 signal, as a ratio to its own baseline."""

import http.client
import json
import math
import statistics
from collections import defaultdict
from datetime import date

import pandas as pd

from hailprint import net, sbw
from hailprint.power import METRO_FIPS, STEP, STEPS

BASE_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/county/"
DATASOURCE = "ping-slash24"
METADATA = {"source": "ioda", "product": DATASOURCE}
SIGNAL_STEP_S = 600  # IODA answers ping-slash24 every 10 minutes
STEP_S = int(STEP.total_seconds())
BASELINE_DAYS = 7
# A baseline needs at least half of its points: 504 of the 1008 in 7 days.
BASELINE_MIN_POINTS = BASELINE_DAYS * 86400 // SIGNAL_STEP_S // 2
# IODA county codes. The "Harris" name search also returns Harrison, so the codes stay constants.
# A test checks them against the table in docs/plans/plan-v6.md.
IODA_CODES = {
    "48201": "3082",  # Harris
    "48157": "3081",  # Fort Bend
    "48339": "3027",  # Montgomery
    "48039": "3094",  # Brazoria
    "48167": "3100",  # Galveston
    "48473": "3052",  # Waller
    "48291": "3041",  # Liberty
    "48071": "3085",  # Chambers
}


def file_name(storm_date: date) -> str:
    return f"internet-{storm_date}.parquet"


def url(fips: str, first: int, last: int) -> str:
    """Return the request URL of one county signal from `first` up to `last` (epoch seconds)."""
    return f"{BASE_URL}{IODA_CODES[fips]}?from={first}&until={last}&datasource={DATASOURCE}"


def _count(value: object) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value) and value >= 0
    except OverflowError:  # an int too large for a float
        return False


def parse(body: bytes) -> dict[int, float]:
    """Return the non-null points of an IODA signal response as {epoch seconds: value}.

    A window with no signal answers `"data": [[]]` and gives no point. A null value is a gap and
    gives no point. Any other shape raises ValueError.
    """
    try:
        doc = json.loads(body)
        error, series = doc["error"], doc["data"][0]
    except (ValueError, TypeError, KeyError, IndexError) as exc:
        raise ValueError("IODA: the response is not a signal document") from exc
    if error is not None:
        raise ValueError(f"IODA: the response holds an error: {error!r}")
    if not isinstance(series, list) or len(series) > 1:
        raise ValueError("IODA: the response does not hold one signal")
    if not series:
        return {}
    try:
        first, step, values = series[0]["from"], series[0]["step"], series[0]["values"]
    except (TypeError, KeyError) as exc:
        raise ValueError("IODA: the signal has no from, step, or values") from exc
    if (
        not isinstance(first, int)
        or isinstance(first, bool)
        or step != SIGNAL_STEP_S
        or not isinstance(values, list)
    ):
        raise ValueError(f"IODA: the signal does not step {SIGNAL_STEP_S} s from a whole epoch")
    points: dict[int, float] = {}
    for n, value in enumerate(values):
        if value is None:
            continue
        if not _count(value):
            raise ValueError(f"IODA: a signal value is not a non-negative number: {value!r}")
        points[first + n * SIGNAL_STEP_S] = value
    return points


def fetch(fips: str, first: int, last: int) -> dict[int, float]:
    """Return the points of one county signal from `first` up to `last` (epoch seconds)."""
    try:
        body = net.get(url(fips, first, last))
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"IODA {fips}: the request failed: {exc!r}") from exc
    try:
        return parse(body)
    except ValueError as exc:
        raise ValueError(f"{exc} (county {fips})") from exc


def ratio(value: float | None, baseline: float | None) -> float | None:
    """Return the value over the baseline to 3 decimals; null without both or at a baseline of 0."""
    if value is None or baseline is None or baseline <= 0:
        return None
    return round(value / baseline, 3)


def drop(reachability: float | None) -> float | None:
    """Return the drop below the baseline, 1 minus the ratio and never below 0; null stays null."""
    if reachability is None:
        return None
    return round(max(0.0, 1 - reachability), 3)


def derive(storm_date: date, series: dict[str, dict[int, float]]) -> pd.DataFrame:
    """Return the impact window of the storm date: one row per metro county and 15-minute step.

    `series` maps a FIPS code to its points ({epoch seconds: value}) from 7 days before the window
    to its end. A step is the median of the points inside it; a step with no point is null, never
    zero. The baseline is the median of the 7 days before the window; a baseline with fewer than
    half its points is null, and so are the ratios of that county.
    """
    # shortcut: the baseline is one flat 7-day median, upgrade to a time-of-day baseline when a
    # quiet day shows a drop above 5 percent
    start, _ = sbw.window(storm_date)
    first = int(start.timestamp())
    baseline_from = first - BASELINE_DAYS * 86400
    fips_list = sorted(METRO_FIPS)
    values: list[float | None] = []
    baselines: list[float | None] = []
    ratios: list[float | None] = []
    for fips in fips_list:
        before: list[float] = []
        steps: defaultdict[int, list[float]] = defaultdict(list)
        for epoch, value in series.get(fips, {}).items():
            if baseline_from <= epoch < first:
                before.append(value)
            elif first <= epoch < first + STEPS * STEP_S:
                steps[(epoch - first) // STEP_S].append(value)
        baseline = float(statistics.median(before)) if len(before) >= BASELINE_MIN_POINTS else None
        for n in range(STEPS):
            value = float(statistics.median(steps[n])) if steps[n] else None
            values.append(value)
            baselines.append(baseline)
            ratios.append(ratio(value, baseline))
    grid = pd.MultiIndex.from_product(
        [fips_list, pd.date_range(start, periods=STEPS, freq=STEP)], names=["fips", "step_utc"]
    ).to_frame(index=False)
    return grid.assign(
        value=pd.Series(values, dtype="float64"),
        baseline=pd.Series(baselines, dtype="float64"),
        ratio=pd.Series(ratios, dtype="float64"),
    )


def build(storm_date: date) -> pd.DataFrame:
    """Fetch the baseline and the window of each metro county and return the derived frame."""
    start, end = sbw.window(storm_date)
    first = int(start.timestamp()) - BASELINE_DAYS * 86400
    last = int(end.timestamp())
    series = {fips: fetch(fips, first, last) for fips in sorted(METRO_FIPS)}
    return derive(storm_date, series)
