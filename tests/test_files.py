import pandas as pd

from hailprint import files


def test_write_atomic_writes_csv_and_leaves_no_tmp_sibling(tmp_path):
    path = tmp_path / "a" / "x.csv"

    files.write_atomic(pd.DataFrame({"n": [1, 2]}), path)

    assert pd.read_csv(path)["n"].tolist() == [1, 2]
    assert not path.with_name(path.name + ".tmp").exists()
