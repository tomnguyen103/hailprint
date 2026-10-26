import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
import pytest
from shapely.geometry import Point

from hailprint import files, mesh


def test_write_atomic_writes_csv_and_leaves_no_tmp_sibling(tmp_path):
    path = tmp_path / "a" / "x.csv"

    files.write_atomic(pd.DataFrame({"n": [1, 2]}), path)

    assert pd.read_csv(path)["n"].tolist() == [1, 2]
    assert list(path.parent.glob("*.tmp")) == []


def test_write_atomic_parquet_carries_source_product_and_confidence(tmp_path):
    path = tmp_path / "x.parquet"

    files.write_atomic(pd.DataFrame({"n": [1]}), path)

    meta = pq.read_table(path).schema.metadata
    assert meta[b"source"] == b"noaa-mrms-pds"
    assert meta[b"product"] == b"MESH_Max_1440min_00.50"
    assert meta[b"confidence"].decode().startswith("radar-estimated hail size")


def test_write_atomic_writes_a_geodataframe_with_extra_metadata(tmp_path):
    path = tmp_path / "g.parquet"
    gdf = gpd.GeoDataFrame({"n": [1]}, geometry=[Point(0, 0)], crs="EPSG:4326")

    files.write_atomic(gdf, path, metadata={"file_count": "1"})

    assert len(gpd.read_parquet(path)) == 1
    meta = pq.read_schema(path).metadata
    assert meta[b"source"] == b"noaa-mrms-pds"
    assert meta[b"file_count"] == b"1"
    assert b"geo" in meta


def test_write_atomic_ignores_a_stale_tmp_file_from_another_run(tmp_path):
    path = tmp_path / "x.parquet"
    stale = tmp_path / "x.parquet.tmp"
    stale.write_bytes(b"another run is writing here")

    files.write_atomic(pd.DataFrame({"n": [1]}), path)

    assert pq.read_table(path)["n"].to_pylist() == [1]
    assert stale.read_bytes() == b"another run is writing here"


def test_write_atomic_rejects_the_forbidden_word_in_caller_metadata(tmp_path):
    path = tmp_path / "x.parquet"

    with pytest.raises(ValueError):
        files.write_atomic(pd.DataFrame({"n": [1]}), path, {"confidence": "Hail Damage score"})

    assert not path.exists()
    assert list(tmp_path.glob("*.tmp")) == []


def test_provenance_constants_match_the_mesh_module():
    assert files.PRODUCT == mesh.PRODUCT
    assert files.SOURCE == mesh.BUCKET


def test_write_atomic_failure_keeps_the_old_file_and_leaves_no_tmp(tmp_path, monkeypatch):
    path = tmp_path / "g.parquet"
    gdf = gpd.GeoDataFrame({"n": [1]}, geometry=[Point(0, 0)], crs="EPSG:4326")
    files.write_atomic(gdf, path)
    before = path.read_bytes()

    def boom(self, *args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(gpd.GeoDataFrame, "to_parquet", boom)
    with pytest.raises(OSError):
        files.write_atomic(gdf, path)

    assert path.read_bytes() == before
    assert list(tmp_path.glob("*.tmp")) == []
