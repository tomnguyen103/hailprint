from datetime import date
from pathlib import Path

import pytest

STORM_DATE = date(2024, 5, 28)
RAW_DIR = Path("data/raw/mesh")
RAW_FILES = sorted((RAW_DIR / "20240528").glob("*.grib2.gz"))

needs_raw_mesh = pytest.mark.skipif(
    len(RAW_FILES) != 48, reason="needs the 48 MESH files under data/raw/mesh/20240528"
)
