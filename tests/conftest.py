import os
import shutil
from datetime import date
from pathlib import Path

import pytest

from hailprint import paths

STORM_DATE = date(2024, 5, 28)
RAW_DIR = paths.RAW_DIR / "mesh"
WCM_PATH = paths.RAW_DIR / "spc" / "1955-2025_hail.csv.zip"
RAW_12Z = RAW_DIR / "20240529" / "MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz"

needs_raw_mesh = pytest.mark.skipif(
    not RAW_12Z.exists(), reason=f"needs the 12Z MESH file at {RAW_12Z}"
)
HCAD_GDB = paths.RAW_DIR / "hcad" / "extracted" / "Parcels.gdb"
SWATHS_0528 = paths.DERIVED_DIR / "swaths" / "swaths-2024-05-28.parquet"

needs_hcad = pytest.mark.skipif(
    not (HCAD_GDB.exists() and SWATHS_0528.exists()),
    reason=f"needs the HCAD gdb at {HCAD_GDB} and the swath file at {SWATHS_0528}",
)
needs_wcm = pytest.mark.skipif(not WCM_PATH.exists(), reason=f"needs the WCM zip at {WCM_PATH}")
# A live check runs only when the caller opts in: HAILPRINT_NETWORK=1 uv run pytest
needs_network = pytest.mark.skipif(
    os.environ.get("HAILPRINT_NETWORK") != "1", reason="needs the network: set HAILPRINT_NETWORK=1"
)
# Git Bash first: the System32 bash.exe on Windows is the WSL launcher
GIT_BASH = Path(r"C:\Program Files\Git\bin\bash.exe")
BASH = str(GIT_BASH) if GIT_BASH.exists() else shutil.which("bash")
needs_bash = pytest.mark.skipif(BASH is None, reason="needs bash on PATH or Git Bash")
