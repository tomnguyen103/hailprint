import pandas as pd
import pyarrow.parquet as pq

from hailprint import files


def test_write_atomic_writes_csv_and_leaves_no_tmp_sibling(tmp_path):
    path = tmp_path / "a" / "x.csv"

    files.write_atomic(pd.DataFrame({"n": [1, 2]}), path)

    assert pd.read_csv(path)["n"].tolist() == [1, 2]
    assert not path.with_name(path.name + ".tmp").exists()


def test_write_atomic_parquet_carries_source_product_and_confidence(tmp_path):
    path = tmp_path / "x.parquet"

    files.write_atomic(pd.DataFrame({"n": [1]}), path)

    meta = pq.read_table(path).schema.metadata
    assert meta[b"source"] == b"noaa-mrms-pds"
    assert meta[b"product"] == b"MESH_Max_1440min_00.50"
    assert meta[b"confidence"].decode().startswith("radar-estimated hail size")
