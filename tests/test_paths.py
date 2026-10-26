import re
from pathlib import Path

import pandas as pd

from hailprint import archive, candidates, files, paths

SRC = Path(__file__).resolve().parents[1] / "src" / "hailprint"


def test_root_is_the_folder_that_holds_pyproject():
    assert (paths.ROOT / "pyproject.toml").is_file()
    assert paths.ROOT == Path(__file__).resolve().parents[1]


def test_data_paths_are_absolute_under_root_from_any_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    for path in (paths.RAW_DIR, paths.DERIVED_DIR, paths.OUT_DIR):
        assert path.is_absolute()
        assert path.is_relative_to(paths.ROOT)


def test_module_constants_do_not_follow_the_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    assert archive.INDEX_PATH == paths.DERIVED_DIR / "index" / "mesh-archive.parquet"
    assert candidates.CANDIDATES_PATH == paths.DERIVED_DIR / "index" / "candidate-days.csv"
    assert candidates.WCM_PATH == paths.RAW_DIR / "spc" / "1955-2025_hail.csv.zip"


def test_no_module_holds_a_relative_data_path():
    pattern = re.compile(r"""Path\(\s*["'](data|out)\b""")
    offenders = [p.name for p in SRC.glob("*.py") if pattern.search(p.read_text(encoding="utf-8"))]
    assert offenders == []


def test_write_atomic_creates_missing_parent_folders(tmp_path):
    path = tmp_path / "data" / "derived" / "x.csv"

    files.write_atomic(pd.DataFrame({"n": [1]}), path)

    assert path.is_file()
