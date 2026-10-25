from datetime import date
from pathlib import Path

import pytest

STORM_DATE = date(2024, 5, 28)
RAW_DIR = Path("data/raw/mesh")
RAW_12Z = RAW_DIR / "20240529" / "MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz"

needs_raw_mesh = pytest.mark.skipif(
    not RAW_12Z.exists(), reason=f"needs the 12Z MESH file at {RAW_12Z}"
)
