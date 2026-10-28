import io
import json
import os
import shutil
import urllib.request
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from hailprint import internet, paths

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
EAGLEI_2024 = paths.DERIVED_DIR / "eaglei" / "eaglei-2024.parquet"
needs_eaglei = pytest.mark.skipif(
    not EAGLEI_2024.exists(),
    reason=f"needs the EAGLE-I 2024 file at {EAGLEI_2024}: run `hailprint eaglei 2024`",
)
# A live check runs only when the caller opts in: HAILPRINT_NETWORK=1 uv run pytest
needs_network = pytest.mark.skipif(
    os.environ.get("HAILPRINT_NETWORK") != "1", reason="needs the network: set HAILPRINT_NETWORK=1"
)
# Git Bash first: the System32 bash.exe on Windows is the WSL launcher
GIT_BASH = Path(r"C:\Program Files\Git\bin\bash.exe")
BASH = str(GIT_BASH) if GIT_BASH.exists() else shutil.which("bash")
needs_bash = pytest.mark.skipif(BASH is None, reason="needs bash on PATH or Git Bash")


class Ioda:
    """The IODA boundary: urlopen answers each county request from a table of points."""

    def __init__(self):
        self.points: dict[str, dict[int, float]] = {}
        self.urls: list[str] = []
        self.error: Exception | None = None

    def add(self, fips: str, first: int, last: int, value: float, step: int = 600) -> None:
        """Set one value every `step` seconds from `first` up to `last` (epoch seconds)."""
        table = self.points.setdefault(internet.IODA_CODES[fips], {})
        for epoch in range(first, last, step):
            table[epoch] = value

    def body(self, url: str) -> bytes:
        parts = urlsplit(url)
        query = parse_qs(parts.query)
        first, last = int(query["from"][0]), int(query["until"][0])
        table = self.points.get(parts.path.rsplit("/", 1)[1], {})
        if not any(first <= epoch < last for epoch in table):
            data: list = [[]]
        else:
            values = [table.get(epoch) for epoch in range(first, last, 600)]
            data = [[{"from": first, "until": last, "step": 600, "values": values}]]
        return json.dumps({"type": "signals", "error": None, "data": data}).encode()


@pytest.fixture
def ioda(monkeypatch):
    ioda = Ioda()

    @contextmanager
    def urlopen(url, timeout=None):
        ioda.urls.append(url)
        if ioda.error is not None:
            raise ioda.error
        yield io.BytesIO(ioda.body(url))

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(internet.net.time, "sleep", lambda s: None)
    return ioda
