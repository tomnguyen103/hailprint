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
from tests.test_mesh import KEY_12Z, FakeS3


@pytest.mark.parametrize("bad", ["2024-5-28", "20240528", "yesterday", "2024-13-01"])
def test_malformed_date_exits_2(bad, capsys):
    with pytest.raises(SystemExit) as exc:
        main(["ingest", bad])
    assert exc.value.code == 2
    assert "usage" in capsys.readouterr().err


def test_spike_command_is_gone(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["spike", "2024-05-28"])
    assert exc.value.code == 2


def test_ingest_writes_png_when_spc_fetch_fails(tmp_path, monkeypatch, capsys):
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
    monkeypatch.setattr(cli.mesh, "download_many", lambda keys, raw_dir: [])
    monkeypatch.setattr(cli.mesh, "daily_max", lambda storm_date, raw_dir: da)
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "derived")
    monkeypatch.setattr(cli, "OUT_DIR", tmp_path / "out")

    def boom(storm_date):
        raise OSError("network down")

    monkeypatch.setattr(reports, "fetch_hail_csv", boom)

    assert main(["ingest", "2024-05-28"]) == 0

    captured = capsys.readouterr()
    lines = captured.out.splitlines()
    assert lines[0] == "storm date: 2024-05-28"
    assert lines[1] == "max MESH in bbox: 30.0 mm"
    assert lines[2] == "SPC hail reports in Harris County: unknown (fetch failed)"
    assert Path(lines[3]) == tmp_path / "out" / "ingest-2024-05-28.png"
    assert lines[4] == f"confidence: {swath.CONFIDENCE}"
    assert "SPC fetch failed: OSError('network down')" in captured.err
    assert (tmp_path / "out" / "ingest-2024-05-28.png").stat().st_size > 0
    path = tmp_path / "derived" / "swaths-2024-05-28.parquet"
    assert pq.read_metadata(path).metadata[b"file_count"] == b"1"


def _stub_ingest(monkeypatch, tmp_path):
    monkeypatch.setattr(cli.mesh, "download_many", lambda keys, raw_dir: [])
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "derived")
    monkeypatch.setattr(cli, "OUT_DIR", tmp_path / "out")


def test_ingest_value_error_prints_one_line_and_exits_1(tmp_path, monkeypatch, capsys):
    _stub_ingest(monkeypatch, tmp_path)

    def bad_layout(storm_date, raw_dir):
        raise ValueError("MRMS_x.grib2: bitmapPresent is 1, expected 0")

    monkeypatch.setattr(cli.mesh, "daily_max", bad_layout)

    assert main(["ingest", "2024-05-28"]) == 1

    captured = capsys.readouterr()
    assert captured.err.splitlines() == ["MRMS_x.grib2: bitmapPresent is 1, expected 0"]
    assert captured.out == ""
    assert not (tmp_path / "derived").exists()


def test_ingest_file_not_found_still_prints_one_line_and_exits_1(tmp_path, monkeypatch, capsys):
    _stub_ingest(monkeypatch, tmp_path)

    def missing(storm_date, raw_dir):
        raise FileNotFoundError("no MESH file at somewhere")

    monkeypatch.setattr(cli.mesh, "daily_max", missing)

    assert main(["ingest", "2024-05-28"]) == 1
    assert capsys.readouterr().err.splitlines() == ["no MESH file at somewhere"]


def test_ingest_missing_12z_file_exits_1_and_writes_nothing(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli.mesh, "s3_client", lambda: FakeS3(missing=[KEY_12Z]))
    monkeypatch.setattr(cli, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "derived")
    monkeypatch.setattr(cli, "OUT_DIR", tmp_path / "out")

    assert main(["ingest", "2024-05-28"]) == 1

    assert KEY_12Z in capsys.readouterr().err
    assert not (tmp_path / "derived").exists()
    assert not (tmp_path / "out").exists()


@needs_raw_mesh
def test_ingest_on_the_real_day_matches_spc_reports(capsys):
    assert main(["ingest", "2024-05-28"]) == 0
    out = capsys.readouterr().out
    assert "damage" not in out.lower()
    assert "SPC hail reports in Harris County: 10" in out
    assert Path("out/ingest-2024-05-28.png").exists()

    path = "data/derived/swaths/swaths-2024-05-28.parquet"
    swaths = gpd.read_parquet(path)
    assert list(swaths.columns) == swath.COLUMNS
    assert swaths.crs.to_epsg() == 4326
    meta = {k.decode(): v.decode() for k, v in pq.read_metadata(path).metadata.items()}
    assert meta["file_count"] == "1"
    # week-1 measured 52.8 mm over a 47-hour superset window
    assert 38.1 < float(meta["max_mesh_mm"]) <= 52.8

    # EPSG:32615 (UTM 15N) is in metres; EPSG:2278 is in US survey feet
    class_19 = swaths[swaths["threshold_mm"] == 19.05].to_crs("EPSG:32615")
    assert len(class_19) == 1
    buffered = class_19.geometry.iloc[0].buffer(5000)

    points = reports.harris_reports(date(2024, 5, 28)).to_crs("EPSG:32615")
    assert len(points) == 10
    inside = int(points.geometry.within(buffered).sum())
    assert inside >= 7, f"{inside} of 10 reports inside the 19.05 mm swath"
