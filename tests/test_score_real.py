"""Real-data checks for the scorer: golden counts and a raster oracle.

The fixtures are the swath file and the SPC daily CSV of two storm dates, copied from a real run.
The golden JSON holds the counts of that run, and each day was also counted by hand.
"""

import json
from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
from pyproj import Transformer

from hailprint import mesh, paths, reports, swath
from hailprint.score import COUNT_COLUMNS, ScoredDay, dist_column, score_day

FIXTURES = Path(__file__).parent / "fixtures"
GOLDEN = json.loads((FIXTURES / "score_golden.json").read_text(encoding="utf-8"))
DAYS = [date(2024, 5, 28), date(2023, 6, 23)]
RADIUS_KM = 5
HALF_DIAGONAL_M = 800  # half of the 0.01 degree cell diagonal at Harris is about 730 m
RAW_DIR = paths.RAW_DIR / "mesh"


def _fixture_day(storm_date: date) -> tuple[ScoredDay, gpd.GeoDataFrame]:
    swaths = gpd.read_parquet(FIXTURES / f"score_swaths_{storm_date}.parquet")
    text = (FIXTURES / f"score_spc_{storm_date:%y%m%d}.csv").read_text(encoding="utf-8")
    return score_day(
        swaths, reports.nearby_reports(storm_date, text), storm_date, RADIUS_KM
    ), swaths


@pytest.mark.parametrize("storm_date", DAYS, ids=str)
def test_golden_counts_match_the_real_run(storm_date):
    day, _ = _fixture_day(storm_date)

    golden = GOLDEN[str(storm_date)]
    got = {
        f"{mm:g}": row for mm, row in day.table.set_index("threshold_mm")[COUNT_COLUMNS].iterrows()
    }
    assert {key: list(map(int, row)) for key, row in got.items()} == golden["counts"]
    assert day.excluded == golden["excluded"]
    assert day.table["report_count"].eq(golden["report_count"]).all()
    assert day.table["radius_km"].eq(golden["radius_km"]).all()


@pytest.mark.parametrize("storm_date", DAYS, ids=str)
def test_fixture_swaths_hold_the_confidence_and_no_forbidden_word(storm_date):
    _, swaths = _fixture_day(storm_date)

    assert not swaths["label"].str.contains(swath.FORBIDDEN_WORD, case=False).any()
    assert swaths["label"].str.startswith("radar-estimated hail size").all()


def _raw_file(storm_date: date) -> Path:
    return mesh.local_path(mesh.key_for(storm_date), RAW_DIR)


def _raster_distances_m(storm_date: date, pairs: gpd.GeoDataFrame, mm: float) -> np.ndarray:
    """Metres from each report to the nearest cell centre at or above mm. Shares no polygon code."""
    da = mesh.daily_max(storm_date, RAW_DIR)
    to_metres = Transformer.from_crs("EPSG:4326", "EPSG:32615", always_xy=True)
    lon, lat = np.meshgrid(da["longitude"].to_numpy(), da["latitude"].to_numpy())
    cell_x, cell_y = to_metres.transform(lon, lat)
    hot = np.nan_to_num(da.to_numpy(), nan=-1) >= np.float32(mm)
    if not hot.any():
        return np.full(len(pairs), np.nan)
    report_x, report_y = to_metres.transform(
        pairs.geometry.x.to_numpy(), pairs.geometry.y.to_numpy()
    )
    return np.array(
        [
            np.hypot(cell_x[hot] - x, cell_y[hot] - y).min()
            for x, y in zip(report_x, report_y, strict=True)
        ]
    )


@pytest.mark.parametrize("storm_date", DAYS, ids=str)
def test_raster_oracle_agrees_with_the_polygon_distance(storm_date):
    if not _raw_file(storm_date).exists():
        pytest.skip(f"needs the 12Z MESH file at {_raw_file(storm_date)}")
    day, _ = _fixture_day(storm_date)
    radius_m = RADIUS_KM * 1000

    checked = 0
    for mm in swath.SIZE_CLASSES_MM:
        polygon = day.pairs[dist_column(mm)].to_numpy(dtype=float)
        centre = _raster_distances_m(storm_date, day.pairs, mm)
        assert np.array_equal(np.isnan(polygon), np.isnan(centre))
        seen = ~np.isnan(polygon)
        # the polygon is the union of whole cells, so its edge lies up to a half-diagonal
        # nearer than the nearest cell centre
        assert (polygon[seen] <= centre[seen] + 1).all(), mm
        assert (polygon[seen] >= centre[seen] - HALF_DIAGONAL_M).all(), mm
        # a report with a hot cell centre inside the radius disc is a forecast on both sides
        disc = centre[seen] <= radius_m
        assert (polygon[seen][disc] <= radius_m).all(), mm
        # a polygon forecast without a hot centre in the disc lies in the half-diagonal band
        edge = (polygon[seen] <= radius_m) & ~disc
        assert (centre[seen][edge] <= radius_m + HALF_DIAGONAL_M).all(), mm
        checked += int(seen.sum())
    assert checked > 0
