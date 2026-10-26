"""Verification scorer: one 2x2 table per size class from SPC reports and the swath."""

import math
from typing import cast

import numpy as np
import pandas as pd

from hailprint import swath

DEFAULT_RADIUS_KM = 5
MAX_RADIUS_KM = 20
COUNT_COLUMNS = ["hits", "misses", "false_alarms", "correct_negatives"]
METRIC_COLUMNS = ["pod", "far", "csi", "hss"]
AREA_COLUMNS = ["swath_km2", "unverifiable_km2"]
CLASS_COLUMNS = ["threshold_mm", "threshold_in", "label"]


def dist_column(threshold_mm: float) -> str:
    """The pairs column that holds the distance in metres from a report to one size class."""
    return f"dist_m_{threshold_mm}"


def _ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator > 0 else math.nan


def skill(hits: int, misses: int, false_alarms: int, correct_negatives: int) -> dict[str, float]:
    """POD, FAR, CSI, and HSS from the four counts. A zero denominator gives NaN."""
    a, c, b, d = hits, misses, false_alarms, correct_negatives
    if min(a, b, c, d) < 0:
        raise ValueError(f"negative count in {(a, c, b, d)}")
    return {
        "pod": _ratio(a, a + c),
        "far": _ratio(b, a + b),
        "csi": _ratio(a, a + b + c),
        "hss": _ratio(2 * (a * d - b * c), (a + c) * (c + d) + (a + b) * (b + d)),
    }


def contingency(pairs: pd.DataFrame, radius_km: float) -> pd.DataFrame:
    """One row per size class with the four counts over the scored reports.

    An event is a report of at least the class size, compared in whole hundredths of an inch.
    A forecast is a swath at or within the radius; a NaN distance (absent class) is no forecast.
    """
    sizes = np.round(pairs["size_in"].to_numpy(dtype=float) * 100)
    rows = []
    for threshold_mm in swath.SIZE_CLASSES_MM:
        threshold_in = threshold_mm / 25.4
        event = sizes >= round(threshold_in * 100)
        forecast = pairs[dist_column(threshold_mm)].to_numpy(dtype=float) <= radius_km * 1000
        rows.append(
            {
                "threshold_mm": threshold_mm,
                "threshold_in": threshold_in,
                "label": swath.label(threshold_mm),
                "report_count": len(pairs),
                "hits": int((event & forecast).sum()),
                "misses": int((event & ~forecast).sum()),
                "false_alarms": int((~event & forecast).sum()),
                "correct_negatives": int((~event & ~forecast).sum()),
            }
        )
    return pd.DataFrame(rows)


def with_skill(table: pd.DataFrame) -> pd.DataFrame:
    """The table with the four metric columns computed from its four count columns."""
    metrics = [skill(*row) for row in table[COUNT_COLUMNS].itertuples(index=False, name=None)]
    return pd.concat(
        [table.reset_index(drop=True), pd.DataFrame(metrics, columns=METRIC_COLUMNS)], axis=1
    )


def pool(tables: list[pd.DataFrame]) -> pd.DataFrame:
    """Sum the counts and areas per size class over storm dates, then recompute the metrics."""
    if not tables:
        raise ValueError("no tables to pool")
    stacked = pd.concat(tables, ignore_index=True)
    radii = sorted(set(stacked["radius_km"]))
    if len(radii) > 1:
        raise ValueError(f"cannot pool tables with mixed radius_km {radii}")
    sums = ["report_count", *COUNT_COLUMNS, *AREA_COLUMNS]
    pooled = cast(pd.DataFrame, stacked.groupby(CLASS_COLUMNS, as_index=False)[sums].sum())
    pooled.insert(3, "radius_km", radii[0])
    return with_skill(pooled.sort_values("threshold_mm"))
