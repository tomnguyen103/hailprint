from datetime import date
from pathlib import Path

import pytest

STORM_DATE = date(2024, 5, 28)
RAW_DIR = Path("data/raw/mesh")
WCM_PATH = Path("data/raw/spc/1955-2025_hail.csv.zip")
RAW_12Z = RAW_DIR / "20240529" / "MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz"

needs_raw_mesh = pytest.mark.skipif(
    not RAW_12Z.exists(), reason=f"needs the 12Z MESH file at {RAW_12Z}"
)
needs_wcm = pytest.mark.skipif(not WCM_PATH.exists(), reason=f"needs the WCM zip at {WCM_PATH}")
