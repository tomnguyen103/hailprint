"""Verification scorer: one 2x2 table per size class from SPC reports and the swath."""

import math
from datetime import date
from typing import NamedTuple, cast

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from hailprint import county, swath

# shortcut: the scorer reads the preliminary SPC daily CSV, not the WCM final record, upgrade
# when PR scope adds the final-record scorecard
REPORT_SOURCE = "spc-daily"
DEFAULT_RADIUS_KM = 5
MAX_RADIUS_KM = 20
METRIC_CRS = "EPSG:32615"
SEGMENT_DEG = 0.01  # one MESH cell: segmentize keeps the bend of a straight edge in metres
EDGE_M = 1000  # one 0.01 degree cell: the swath crop is only known to within a cell
NEST_TOLERANCE_M = 1.0
PAIR_COLUMNS = ["time", "location", "county", "state", "size_in"]
COUNT_COLUMNS = ["hits", "misses", "false_alarms", "correct_negatives"]
METRIC_COLUMNS = ["pod", "far", "csi", "hss"]
AREA_COLUMNS = ["swath_km2", "unverifiable_km2"]
CLASS_COLUMNS = ["threshold_mm", "threshold_in", "label"]
POOL_COLUMNS = [
    *CLASS_COLUMNS,
    "radius_km",
    "report_count",
    *COUNT_COLUMNS,
    *METRIC_COLUMNS,
    *AREA_COLUMNS,
]
SCORE_COLUMNS = ["storm_date", *POOL_COLUMNS]


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
    # shortcut: the sample holds reports only, so correct negatives count smaller reports and
    # not empty ground, upgrade when NCEI Storm Events add no-hail reports
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


def with_skill(table: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """The table with the four metric columns computed from its count columns, in column order."""
    metrics = [skill(*row) for row in table[COUNT_COLUMNS].itertuples(index=False, name=None)]
    joined = pd.concat(
        [table.reset_index(drop=True), pd.DataFrame(metrics, columns=METRIC_COLUMNS)], axis=1
    )
    return cast(pd.DataFrame, joined[columns])


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
    pooled.insert(len(CLASS_COLUMNS), "radius_km", radii[0])
    return with_skill(pooled.sort_values("threshold_mm"), POOL_COLUMNS)


class ScoredDay(NamedTuple):
    pairs: gpd.GeoDataFrame
    table: pd.DataFrame
    excluded: int


def metric_swaths(swaths: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """The classes in EPSG:32615 metres, sorted by size. A degree frame is segmentized first."""
    if swaths.crs is None:
        raise ValueError("swaths have no CRS")
    if swaths.crs.is_geographic:
        swaths = swaths.set_geometry(swaths.geometry.segmentize(SEGMENT_DEG))
    metric = swaths.loc[:, ["threshold_mm", "geometry"]].to_crs(METRIC_CRS)
    return cast(gpd.GeoDataFrame, metric.sort_values("threshold_mm").reset_index(drop=True))


def distances(swaths: gpd.GeoDataFrame, reports: gpd.GeoDataFrame) -> pd.DataFrame:
    """One column of metres per size class: report to swath, 0 inside, NaN for an absent class."""
    by_class = dict(zip(swaths["threshold_mm"], swaths.geometry, strict=True))
    points = reports.geometry.to_crs(METRIC_CRS).to_numpy()
    return pd.DataFrame(
        {
            dist_column(mm): shapely.distance(points, by_class.get(mm))
            for mm in swath.SIZE_CLASSES_MM
        }
    )


def in_domain(reports: gpd.GeoDataFrame, radius_km: float) -> pd.Series:
    """True for a report whose radius disc lies inside the swath crop, shrunk by one cell."""
    crop = shapely.segmentize(shapely.box(*county.bbox()), SEGMENT_DEG)
    crop_m = gpd.GeoSeries([crop], crs="EPSG:4326").to_crs(METRIC_CRS).iloc[0]
    inner = crop_m.buffer(-(radius_km * 1000 + EDGE_M))
    return reports.geometry.to_crs(METRIC_CRS).within(inner)


def _areas_km2(
    swaths: gpd.GeoDataFrame, reports: gpd.GeoDataFrame, radius_km: float
) -> list[tuple[float, float]]:
    """Per size class: swath area, and the part of it farther than the radius from every report."""
    # shortcut: observers are present where any SPC report exists, upgrade to a
    # population-weighted report density when a density layer lands
    observers = reports.geometry.to_crs(METRIC_CRS).buffer(radius_km * 1000).union_all()
    by_class = dict(zip(swaths["threshold_mm"], swaths.geometry, strict=True))
    areas = []
    for mm in swath.SIZE_CLASSES_MM:
        geom = by_class.get(mm)
        if geom is None:
            areas.append((0.0, 0.0))
            continue
        total = geom.area
        unverifiable = max(0.0, total - geom.intersection(observers).area)
        areas.append((total / 1e6, unverifiable / 1e6))
    return areas


def score_day(
    swaths: gpd.GeoDataFrame, reports: gpd.GeoDataFrame, storm_date: date, radius_km: float
) -> ScoredDay:
    """Score one storm date: pairs of the in-domain reports, seven class rows, excluded count.

    Raises ValueError for a radius outside 0 to MAX_RADIUS_KM km or classes that do not nest.
    The unverifiable area counts every report, in the domain or not, as an observer.
    """
    if not (math.isfinite(radius_km) and 0 <= radius_km <= MAX_RADIUS_KM):
        raise ValueError(f"radius_km must be finite and between 0 and {MAX_RADIUS_KM}: {radius_km}")
    metric = metric_swaths(swaths)
    swath.require_nested(metric, NEST_TOLERANCE_M)
    keep = in_domain(reports, radius_km).to_numpy(dtype=bool)
    scored = reports.loc[keep, [*PAIR_COLUMNS, "geometry"]].reset_index(drop=True)
    dist = distances(metric, scored)
    pairs = gpd.GeoDataFrame(
        scored.drop(columns="geometry").join(dist),
        geometry=scored.geometry.to_crs("EPSG:4326").to_numpy(),
        crs="EPSG:4326",
    )
    table = contingency(pairs, radius_km)
    table.insert(0, "storm_date", storm_date.isoformat())
    table["radius_km"] = radius_km
    areas = _areas_km2(metric, reports, radius_km)
    table["swath_km2"] = [swath_km2 for swath_km2, _ in areas]
    table["unverifiable_km2"] = [unverifiable_km2 for _, unverifiable_km2 in areas]
    return ScoredDay(pairs, with_skill(table, SCORE_COLUMNS), int((~keep).sum()))
