from datetime import date

import numpy as np
import pytest
import xarray as xr

from hailprint import mesh
from tests.conftest import RAW_DIR, STORM_DATE, needs_raw_mesh

PREFIX = "CONUS/MESH_Max_1440min_00.50/20240528/"


def _grid(values):
    return xr.DataArray(
        np.array(values, dtype=np.float32),
        dims=("latitude", "longitude"),
        coords={"latitude": [30.0], "longitude": [-95.0, -94.99, -94.98]},
    )


def test_daily_max_masks_sentinels_before_max(tmp_path, monkeypatch):
    # cell 0: -3 in every file; cell 1: -1, -1, 30.0; cell 2: 0.0 in every file
    stack = {
        "a.grib2.gz": _grid([[-3.0, -1.0, 0.0]]),
        "b.grib2.gz": _grid([[-3.0, -1.0, 0.0]]),
        "c.grib2.gz": _grid([[-3.0, 30.0, 0.0]]),
    }
    day_dir = tmp_path / "20240528"
    day_dir.mkdir()
    for name in stack:
        (day_dir / name).write_bytes(b"")
    monkeypatch.setattr(mesh, "decode", lambda path: stack[path.name])

    da, file_count = mesh.daily_max(STORM_DATE, tmp_path)

    assert file_count == 3
    assert da.shape == (1, 3)
    assert list(da.longitude.values) == [-95.0, -94.99, -94.98]
    assert np.isnan(da.values[0, 0])
    assert da.values[0, 1] == 30.0
    assert da.values[0, 2] == 0.0


def test_daily_max_empty_dir_raises(tmp_path):
    with pytest.raises(FileNotFoundError, match="20240528"):
        mesh.daily_max(STORM_DATE, tmp_path)


class FakeS3:
    def __init__(self, keys):
        self.keys = keys
        self.downloaded = []

    def list_objects_v2(self, Bucket, Prefix):
        assert Bucket == "noaa-mrms-pds"
        assert Prefix == PREFIX
        return {"Contents": [{"Key": k} for k in self.keys]} if self.keys else {}

    def download_file(self, Bucket, Key, Filename):
        self.downloaded.append(Key)
        open(Filename, "wb").write(b"new")


def test_download_skips_existing_file_by_name(tmp_path):
    keys = [PREFIX + "x-000000.grib2.gz", PREFIX + "x-003000.grib2.gz"]
    existing = tmp_path / "20240528" / "x-000000.grib2.gz"
    existing.parent.mkdir()
    existing.write_bytes(b"already here")
    client = FakeS3(keys)

    paths = mesh.download(STORM_DATE, tmp_path, client=client)

    assert client.downloaded == [keys[1]]
    assert existing.read_bytes() == b"already here"
    assert [p.name for p in paths] == ["x-000000.grib2.gz", "x-003000.grib2.gz"]


def test_download_empty_listing_raises(tmp_path):
    with pytest.raises(RuntimeError, match=PREFIX):
        mesh.download(STORM_DATE, tmp_path, client=FakeS3([]))
    assert not (tmp_path / "20240528").exists()


@needs_raw_mesh
def test_daily_max_real_day():
    da, file_count = mesh.daily_max(date(2024, 5, 28), RAW_DIR)
    lon = da.longitude.values
    lat = da.latitude.values
    assert file_count == 48
    assert da.dtype == np.float32
    assert np.allclose(np.diff(lon), 0.01, atol=1e-6)
    assert lon.min() >= -180 and lon.max() <= 180
    assert np.all(np.diff(lat) < 0)
    assert float(da.min()) >= 0
    assert float(da.max()) > 25.4
    assert da.attrs["units"] == "mm"
