import os

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

    for bad in ({"confidence": "Hail Damage score"}, {"damage_score": "1"}):
        with pytest.raises(ValueError):
            files.write_atomic(pd.DataFrame({"n": [1]}), path, bad)

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


def test_write_text_atomic_writes_utf8_and_keeps_the_old_file_on_failure(tmp_path, monkeypatch):
    path = tmp_path / "a" / "x.csv"

    files.write_text_atomic("one\r\n", path)
    assert path.read_bytes() == b"one\r\n"

    def boom(self, *args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(type(path), "write_bytes", boom)
    with pytest.raises(OSError):
        files.write_text_atomic("two\n", path)

    monkeypatch.undo()
    assert path.read_bytes() == b"one\r\n"
    assert list(path.parent.glob("*.tmp")) == []


def test_lock_refuses_a_second_holder_and_is_gone_after_an_exception(tmp_path):
    path = tmp_path / "a" / "publish.lock"

    with pytest.raises(OSError, match="disk full"):
        with files.lock(path):
            assert path.read_text(encoding="utf-8") == str(os.getpid())
            with pytest.raises(RuntimeError, match="another run"):
                with files.lock(path):
                    pass
            assert path.exists()
            raise OSError("disk full")

    assert not path.exists()


def test_write_atomic_rejects_owner_columns_and_forbidden_word_in_metadata(tmp_path):
    path = tmp_path / "x.parquet"
    with pytest.raises(ValueError, match="owner"):
        files.write_atomic(pd.DataFrame({"CurrOwner": ["A"]}), path)
    with pytest.raises(ValueError, match="damage"):
        files.write_atomic(pd.DataFrame({"n": [1]}), path, metadata={"note": "hail damage"})
    with pytest.raises(ValueError, match="damage"):
        files.write_atomic(pd.DataFrame({"note": ["hail damage"]}), path)
    assert not path.exists()


def test_write_bytes_atomic_writes_bytes_and_leaves_no_tmp_sibling(tmp_path):
    """Verify write_bytes_atomic writes payload atomically and leaves no .tmp file."""
    path = tmp_path / "b" / "raw.bin"
    files.write_bytes_atomic(b"payload", path)
    assert path.read_bytes() == b"payload"
    assert list(path.parent.glob("*.tmp")) == []


def test_lock_evicts_stale_dead_pid_and_acquires_lock(tmp_path, monkeypatch):
    """Verify files.lock evicts a dead PID lock and acquires the lock for the current process."""
    path = tmp_path / "a" / "publish.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("99999999", encoding="utf-8")
    monkeypatch.setattr(files, "_pid_alive", lambda pid: pid == os.getpid())

    with files.lock(path):
        assert path.read_text(encoding="utf-8") == str(os.getpid())
    assert not path.exists()


def test_evict_stale_lock_restores_lock_when_racing_process_writes_live_pid(tmp_path, monkeypatch):
    """Verify stale lock claim restores live locks and never overwrites a third-process lock."""
    path = tmp_path / "a" / "publish.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("99999999", encoding="utf-8")
    monkeypatch.setattr(files, "_pid_alive", lambda pid: pid in (os.getpid(), 424242))
    orig_replace = os.replace

    def racing_replace(src, dst):
        if src == path:
            path.write_text(str(os.getpid()), encoding="utf-8")
        return orig_replace(src, dst)

    monkeypatch.setattr(files.os, "replace", racing_replace)
    with pytest.raises(RuntimeError, match="another run holds it"):
        with files.lock(path):
            pass
    assert path.read_text(encoding="utf-8") == str(os.getpid())

    # Second race: a third process (424242) creates `path` right before `os.link(claim, path)`.
    path.write_text("99999999", encoding="utf-8")
    orig_link = os.link

    def racing_link(src, dst):
        path.write_text("424242", encoding="utf-8")
        return orig_link(src, dst)

    monkeypatch.setattr(files.os, "link", racing_link)
    with pytest.raises(RuntimeError, match="another run holds it"):
        with files.lock(path):
            pass
    assert path.read_text(encoding="utf-8") == "424242"
    assert list(path.parent.glob("*.stale.*")) == []

    # Third case: filesystem rejects os.link with OSError; fallback O_EXCL write restores claim.
    path.write_text("99999999", encoding="utf-8")
    monkeypatch.setattr(
        files.os,
        "link",
        lambda src, dst: (_ for _ in ()).throw(OSError("hard links unsupported")),
    )
    with pytest.raises(RuntimeError, match="another run holds it"):
        with files.lock(path):
            pass
    assert path.read_text(encoding="utf-8") == str(os.getpid())
    assert list(path.parent.glob("*.stale.*")) == []

    # Fourth case: os.link fails AND a third process (424242) creates path before O_EXCL restore.
    path.write_text("99999999", encoding="utf-8")

    def racing_failing_link(src, dst):
        path.write_text("424242", encoding="utf-8")
        raise OSError("hard links unsupported")

    monkeypatch.setattr(files.os, "link", racing_failing_link)
    with pytest.raises(RuntimeError, match="another run holds it"):
        with files.lock(path):
            pass
    assert path.read_text(encoding="utf-8") == "424242"
    assert list(path.parent.glob("*.stale.*")) == []
