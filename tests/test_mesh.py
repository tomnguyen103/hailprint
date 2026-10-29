import gzip
from datetime import date

import numpy as np
import pytest
import xarray as xr
from botocore.exceptions import ClientError

from hailprint import mesh
from tests.conftest import RAW_12Z, RAW_DIR, STORM_DATE, needs_raw_mesh

PRODUCT = "CONUS/MESH_Max_1440min_00.50"
KEY_12Z = f"{PRODUCT}/20240529/MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz"


def _grid(values):
    return xr.DataArray(
        np.array(values, dtype=np.float32),
        dims=("latitude", "longitude"),
        coords={"latitude": [30.0], "longitude": [-95.0, -94.99, -94.98]},
    )


class FakeS3:
    def __init__(self, missing=()):
        self.missing = set(missing)
        self.downloaded = []

    def download_file(self, Bucket, Key, Filename):
        assert Bucket == "noaa-mrms-pds"
        self.downloaded.append(Key)
        if Key in self.missing:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")
        open(Filename, "wb").write(b"new")


def _key(folder, stamp):
    return f"{PRODUCT}/{folder}/MRMS_MESH_Max_1440min_00.50_{folder}-{stamp}.grib2.gz"


@pytest.mark.parametrize(
    ("storm_date", "folder"),
    [(date(2020, 10, 13), "20201014"), (date(2024, 12, 31), "20250101"), (STORM_DATE, "20240529")],
)
def test_key_for_names_the_12z_file_of_the_next_folder(storm_date, folder):
    assert mesh.key_for(storm_date) == _key(folder, "120000")


def test_key_for_the_storm_date_is_the_cached_12z_path():
    assert mesh.local_path(mesh.key_for(STORM_DATE), RAW_DIR) == RAW_12Z


@pytest.mark.parametrize(
    "bad_key",
    [
        "CONUS/MESH_Max_1440min_00.50/../evil.grib2.gz",
        "CONUS/MESH_Max_1440min_00.50/20240529/../../evil.grib2.gz",
        "CONUS/MESH_Max_1440min_00.50/notadate/file.grib2.gz",
    ],
)
def test_local_path_rejects_traversal_and_non_date_folders(tmp_path, bad_key):
    with pytest.raises(ValueError, match="unsafe MESH key"):
        mesh.local_path(bad_key, tmp_path)


def test_decode_wraps_eccodes_error_as_runtime_error(tmp_path, monkeypatch):
    grib = tmp_path / "corrupt.grib2"
    grib.write_bytes(b"corrupt")

    class FakeCodesError(Exception):
        pass

    monkeypatch.setattr(mesh.eccodes, "CodesInternalError", FakeCodesError, raising=False)

    def raise_corrupt(raw):
        raise FakeCodesError("corrupt message")

    monkeypatch.setattr(mesh.eccodes, "codes_new_from_message", raise_corrupt)
    with pytest.raises(RuntimeError, match="bad GRIB2 message"):
        mesh.decode(grib)


def test_download_many_empty_returns_empty_without_a_client(tmp_path, monkeypatch):
    def no_client():
        raise AssertionError("client built")

    monkeypatch.setattr(mesh, "s3_client", no_client)
    assert mesh.download_many([], tmp_path) == []


def test_download_many_lands_files_in_key_order(tmp_path):
    keys = [_key("20240529", "120000"), _key("20240530", "120000"), _key("20240531", "120000")]
    client = FakeS3()

    paths = mesh.download_many(keys, tmp_path, client=client)

    assert [p.relative_to(tmp_path).as_posix() for p in paths] == [
        "20240529/MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz",
        "20240530/MRMS_MESH_Max_1440min_00.50_20240530-120000.grib2.gz",
        "20240531/MRMS_MESH_Max_1440min_00.50_20240531-120000.grib2.gz",
    ]
    assert all(p.read_bytes() == b"new" for p in paths)
    assert sorted(client.downloaded) == keys


def test_download_many_404_on_one_key_lands_the_others_then_raises(tmp_path):
    keys = [_key("20240529", "120000"), _key("20240530", "120000"), _key("20240531", "120000")]
    client = FakeS3(missing=[keys[1]])

    with pytest.raises(RuntimeError, match="missing MESH file") as exc:
        mesh.download_many(keys, tmp_path, client=client)

    assert keys[1] in str(exc.value)
    assert keys[0] not in str(exc.value)
    assert (tmp_path / "20240529" / "MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz").exists()
    assert (tmp_path / "20240531" / "MRMS_MESH_Max_1440min_00.50_20240531-120000.grib2.gz").exists()
    assert sorted(client.downloaded) == keys


def test_download_many_skips_an_existing_file_by_name(tmp_path):
    keys = [_key("20240529", "120000"), _key("20240529", "130000")]
    existing = tmp_path / "20240529" / "MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz"
    existing.parent.mkdir()
    existing.write_bytes(b"already here")
    client = FakeS3()

    paths = mesh.download_many(keys, tmp_path, client=client, workers=1)

    assert client.downloaded == [keys[1]]
    assert existing.read_bytes() == b"already here"
    assert paths[0] == existing


def test_download_many_transport_error_names_the_key(tmp_path):
    class Dropping:
        def download_file(self, Bucket, Key, Filename):
            raise ConnectionResetError("transport")

    key = _key("20240529", "120000")
    with pytest.raises(RuntimeError, match="20240529-120000"):
        mesh.download_many([key], tmp_path, client=Dropping())


def test_daily_max_masks_sentinels_and_reads_the_one_12z_file(tmp_path, monkeypatch):
    local = mesh.local_path(KEY_12Z, tmp_path)
    local.parent.mkdir(parents=True)
    local.write_bytes(b"")
    monkeypatch.setattr(
        mesh, "decode", lambda path: mesh.mask_sentinels(_grid([[-3.0, 30.0, 0.0]]))
    )

    da = mesh.daily_max(STORM_DATE, tmp_path)

    assert da.attrs["file_count"] == 1
    assert np.isnan(da.values[0, 0])
    assert da.values[0, 1] == 30.0
    assert da.values[0, 2] == 0.0


def test_daily_max_missing_file_names_the_path(tmp_path):
    with pytest.raises(FileNotFoundError, match="20240529-120000"):
        mesh.daily_max(STORM_DATE, tmp_path)


def test_mask_sentinels():
    da = mesh.mask_sentinels(_grid([[-3.0, -1.0, 0.0]]))
    assert np.isnan(da.values[0, 0]) and np.isnan(da.values[0, 1]) and da.values[0, 2] == 0.0


@needs_raw_mesh
def test_daily_max_real_day():
    da = mesh.daily_max(date(2024, 5, 28), RAW_DIR)
    lon = da.longitude.values
    lat = da.latitude.values
    assert da.attrs["file_count"] == 1
    assert da.dtype == np.float32
    assert np.allclose(np.diff(lon), 0.01, atol=1e-6)
    assert lon.min() >= -180 and lon.max() <= 180
    assert np.all(np.diff(lat) < 0)
    assert float(da.min()) >= 0
    assert float(da.max()) > 25.4
    assert da.attrs["units"] == "mm"


def _fake_eccodes(monkeypatch, bitmap):
    keys = {
        "Ni": 4,
        "Nj": 4,
        "longitudeOfFirstGridPointInDegrees": 263.5,
        "latitudeOfFirstGridPointInDegrees": 30.5,
        "iDirectionIncrementInDegrees": 0.5,
        "jDirectionIncrementInDegrees": 0.5,
        "jScansPositively": 0,
        "bitmapPresent": bitmap,
    }
    monkeypatch.setattr(mesh.eccodes, "codes_new_from_message", lambda raw: object())
    monkeypatch.setattr(mesh.eccodes, "codes_get", lambda handle, key: keys[key])
    monkeypatch.setattr(
        mesh.eccodes, "codes_get_values", lambda handle: np.full(16, 30.0, dtype=np.float64)
    )
    monkeypatch.setattr(mesh.eccodes, "codes_release", lambda handle: None)


def test_decode_rejects_a_bitmap_and_names_the_file_and_the_key(tmp_path, monkeypatch):
    _fake_eccodes(monkeypatch, bitmap=1)
    grib = tmp_path / "MRMS_test.grib2"
    grib.write_bytes(b"x")

    with pytest.raises(ValueError, match="MRMS_test.grib2.*bitmapPresent"):
        mesh.decode(grib)


def test_decode_accepts_a_message_without_a_bitmap(tmp_path, monkeypatch):
    _fake_eccodes(monkeypatch, bitmap=0)
    grib = tmp_path / "MRMS_test.grib2"
    grib.write_bytes(b"x")

    da = mesh.decode(grib)

    assert da.size > 0
    assert float(da.max()) == 30.0
    assert da.attrs["units"] == "mm"


def test_daily_max_attrs_hold_the_decode_keys_and_the_file_count(tmp_path, monkeypatch):
    _fake_eccodes(monkeypatch, bitmap=0)
    local = mesh.local_path(KEY_12Z, tmp_path)
    local.parent.mkdir(parents=True)
    local.write_bytes(gzip.compress(b"x"))

    da = mesh.daily_max(STORM_DATE, tmp_path)

    assert da.attrs == {
        "units": "mm",
        "units_source": mesh.UNITS_SOURCE,
        "product": mesh.PRODUCT,
        "file_count": 1,
    }


def test_s3_client_retries_with_the_standard_mode_and_five_attempts():
    retries = mesh.s3_client().meta.config.retries

    # botocore stores max_attempts=5 (retries) as total_max_attempts=6 (tries)
    assert retries == {"mode": "standard", "total_max_attempts": 6}
