from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyarrow.parquet as pq
import pytest
import xarray as xr

import hailprint.__main__ as cli
from hailprint import reports, swath
from hailprint.__main__ import main
from tests.conftest import needs_raw_mesh


@pytest.mark.parametrize("bad", ["2024-5-28", "20240528", "yesterday", "2024-13-01"])
def test_malformed_date_exits_2(bad, capsys):
    with pytest.raises(SystemExit) as exc:
        main(["spike", bad])
    assert exc.value.code == 2
    assert "usage" in capsys.readouterr().err


def test_spike_writes_png_when_spc_fetch_fails(tmp_path, monkeypatch, capsys):
    grid = np.full((4, 4), np.nan, dtype=np.float32)
    grid[1, 1] = 30.0
    da = xr.DataArray(
        grid,
        dims=("latitude", "longitude"),
        coords={
            "latitude": [30.035, 30.025, 30.015, 30.005],
            "longitude": [-95.535, -95.525, -95.515, -95.505],
        },
    )
    monkeypatch.setattr(cli.mesh, "download", lambda storm_date, raw_dir: [])
    monkeypatch.setattr(cli.mesh, "daily_max", lambda storm_date, raw_dir: (da, 3))
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "derived")
    monkeypatch.setattr(cli, "OUT_DIR", tmp_path / "out")

    def boom(storm_date):
        raise OSError("network down")

    monkeypatch.setattr(reports, "fetch_hail_csv", boom)

    assert main(["spike", "2024-05-28"]) == 0

    captured = capsys.readouterr()
    lines = captured.out.splitlines()
    assert lines[0] == "max MESH in bbox: 30.0 mm"
    assert lines[1] == "SPC hail reports in Harris County: unknown (fetch failed)"
    assert Path(lines[2]) == tmp_path / "out" / "spike-2024-05-28.png"
    assert lines[3] == f"confidence: {swath.CONFIDENCE}"
    assert "SPC fetch failed: OSError('network down')" in captured.err
    assert (tmp_path / "out" / "spike-2024-05-28.png").stat().st_size > 0
    assert (tmp_path / "derived" / "swaths-2024-05-28.parquet").exists()


@needs_raw_mesh
def test_spike_on_the_real_day_matches_spc_reports(capsys, monkeypatch):
    # the bucket listing is skipped here: all 48 files are present by name
    monkeypatch.setattr(cli.mesh, "download", lambda storm_date, raw_dir: [])
    assert main(["spike", "2024-05-28"]) == 0
    out = capsys.readouterr().out
    assert "damage" not in out.lower()
    assert "SPC hail reports in Harris County: 10" in out
    assert Path("out/spike-2024-05-28.png").exists()

    path = "data/derived/swaths/swaths-2024-05-28.parquet"
    swaths = gpd.read_parquet(path)
    assert list(swaths.columns) == swath.COLUMNS
    assert swaths.crs.to_epsg() == 4326
    meta = {k.decode() for k in pq.read_metadata(path).metadata}
    assert meta >= {"source", "product", "file_count", "max_mesh_mm", "confidence"}

    # EPSG:32615 (UTM 15N) is in metres; EPSG:2278 is in US survey feet
    class_19 = swaths[swaths["threshold_mm"] == 19.05].to_crs("EPSG:32615")
    assert len(class_19) == 1
    buffered = class_19.geometry.iloc[0].buffer(5000)

    points = reports.harris_reports(date(2024, 5, 28)).to_crs("EPSG:32615")
    assert len(points) == 10
    inside = int(points.geometry.within(buffered).sum())
    assert inside >= 7, f"{inside} of 10 reports inside the 19.05 mm swath"
