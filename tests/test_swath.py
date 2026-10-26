from datetime import date

import geopandas as gpd
import numpy as np
import pyarrow.parquet as pq
import pytest
import shapely
import xarray as xr

from hailprint.swath import COLUMNS, build_swaths, write_swaths

STORM_DATE = date(2024, 5, 28)
CELL_AREA = 0.01 * 0.01


def _raster(values):
    return xr.DataArray(
        np.array(values, dtype=np.float32),
        dims=("latitude", "longitude"),
        coords={
            "latitude": [30.035, 30.025, 30.015, 30.005],
            "longitude": [-95.035, -95.025, -95.015, -95.005],
        },
    )


def _four_by_four():
    grid = np.full((4, 4), np.nan)
    grid[0, 0] = 19.05
    grid[1, 1] = 19.04
    grid[3, 3] = 63.5
    return _raster(grid)


def _metadata(path):
    return {k.decode(): v.decode() for k, v in pq.read_metadata(path).metadata.items()}


def test_class_areas_on_synthetic_raster():
    gdf = build_swaths(_four_by_four(), STORM_DATE)

    area = dict(zip(gdf["threshold_mm"], shapely.area(gdf.geometry.values), strict=True))
    assert set(area) == {19.05, 25.4, 31.75, 38.1, 44.45, 50.8, 63.5}
    assert abs(area[19.05] - 2 * CELL_AREA) < 1e-9
    for threshold in (25.4, 31.75, 38.1, 44.45, 50.8, 63.5):
        assert abs(area[threshold] - CELL_AREA) < 1e-9
    assert list(gdf.columns) == COLUMNS
    assert gdf.crs.to_epsg() == 4326
    assert gdf["storm_date"].eq("2024-05-28").all()
    assert gdf["label"].iloc[0] == "radar-estimated hail size >= 0.75 in"
    assert abs(gdf["threshold_in"].iloc[0] - 0.75) < 1e-9


def test_all_nan_raster_writes_empty_frame(tmp_path):
    gdf = build_swaths(_raster(np.full((4, 4), np.nan)), STORM_DATE)
    assert len(gdf) == 0
    assert list(gdf.columns) == COLUMNS

    path = write_swaths(gdf, tmp_path / "swaths.parquet", file_count=3, max_mesh_mm=None)

    meta = _metadata(path)
    assert meta["max_mesh_mm"] == ""
    assert meta["file_count"] == "3"
    assert meta["source"] == "noaa-mrms-pds"
    assert meta["product"] == "MESH_Max_1440min_00.50"
    assert "radar-estimated hail size" in meta["confidence"]
    assert len(gpd.read_parquet(path)) == 0


def test_write_overwrites_and_reads_back(tmp_path):
    gdf = build_swaths(_four_by_four(), STORM_DATE)
    path = tmp_path / "swaths.parquet"
    write_swaths(gdf, path, file_count=48, max_mesh_mm=63.5)
    write_swaths(gdf, path, file_count=48, max_mesh_mm=63.5)

    back = gpd.read_parquet(path)
    assert len(back) == 7
    assert back.crs.to_epsg() == 4326
    assert _metadata(path)["max_mesh_mm"] == "63.5"


def test_forbidden_label_raises_before_write(tmp_path):
    gdf = build_swaths(_four_by_four(), STORM_DATE)
    gdf.loc[0, "label"] = "Damage class"
    path = tmp_path / "swaths.parquet"
    with pytest.raises(ValueError):
        write_swaths(gdf, path, file_count=1, max_mesh_mm=1.0)
    assert not path.exists()


def test_write_swaths_failure_keeps_the_old_file_and_leaves_no_tmp(tmp_path, monkeypatch):
    gdf = build_swaths(_four_by_four(), STORM_DATE)
    path = tmp_path / "swaths.parquet"
    write_swaths(gdf, path, file_count=1, max_mesh_mm=63.5)
    before = path.read_bytes()

    real = pq.write_table
    calls = []

    def fail_on_the_metadata_write(table, where, *args, **kwargs):
        calls.append(where)
        if len(calls) == 2:
            raise OSError("disk full")
        return real(table, where, *args, **kwargs)

    monkeypatch.setattr(pq, "write_table", fail_on_the_metadata_write)
    with pytest.raises(OSError):
        write_swaths(gdf, path, file_count=2, max_mesh_mm=1.0)

    assert len(calls) == 2

    assert path.read_bytes() == before
    assert list(tmp_path.glob("*.tmp")) == []


def test_write_swaths_leaves_no_tmp_after_success_or_a_forbidden_label(tmp_path):
    gdf = build_swaths(_four_by_four(), STORM_DATE)
    path = tmp_path / "swaths.parquet"
    write_swaths(gdf, path, file_count=1, max_mesh_mm=63.5)
    gdf.loc[0, "label"] = "Damage class"
    with pytest.raises(ValueError):
        write_swaths(gdf, path, file_count=1, max_mesh_mm=63.5)

    assert list(tmp_path.glob("*.tmp")) == []


def test_write_swaths_metadata_holds_the_five_keys(tmp_path):
    path = write_swaths(build_swaths(_four_by_four(), STORM_DATE), tmp_path / "s.parquet", 4, 63.5)

    meta = pq.read_schema(path).metadata
    for key in (b"source", b"product", b"confidence", b"file_count", b"max_mesh_mm"):
        assert key in meta
