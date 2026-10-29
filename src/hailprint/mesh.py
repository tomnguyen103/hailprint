"""MESH download, GRIB2 decode, and the daily max for one storm date."""

import gzip
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from typing import cast

import boto3
import eccodes
import numpy as np
import xarray as xr
from botocore import UNSIGNED
from botocore.config import Config

from hailprint.county import bbox

BUCKET = "noaa-mrms-pds"
PRODUCT = "MESH_Max_1440min_00.50"
UNITS_SOURCE = "NSSL MRMS GRIB2 table; the GRIB2 file carries no unit string"
MAX_DECODE_BYTES = 64 * 1024 * 1024


def prefix(storm_date: date) -> str:
    return f"CONUS/{PRODUCT}/{storm_date:%Y%m%d}/"


def key_for(storm_date: date) -> str:
    """Key of the one file that holds the storm date.

    The 1440-minute product stamped T is the max over [T-24h, T]. The file stamped
    D+1 12:00 UTC therefore equals the SPC convective day D (12Z to 12Z).
    """
    d = storm_date + timedelta(days=1)
    return f"CONUS/{PRODUCT}/{d:%Y%m%d}/MRMS_{PRODUCT}_{d:%Y%m%d}-120000.grib2.gz"


def local_path(key: str, raw_dir: Path) -> Path:
    """raw_dir / <folder date> / <file name>."""
    parts = key.split("/")
    if len(parts) != 4 or not re.fullmatch(r"\d{8}", parts[2]):
        raise ValueError(f"unsafe MESH key: {key!r}")
    filename = parts[3]
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError(f"unsafe MESH key: {key!r}")
    base = Path(raw_dir)
    dest = base / parts[2] / filename
    if not dest.resolve().is_relative_to(base.resolve()):
        raise ValueError(f"unsafe MESH key: {key!r}")
    return dest


def s3_client():
    config = Config(signature_version=UNSIGNED, retries={"mode": "standard", "max_attempts": 5})
    return boto3.client("s3", region_name="us-east-1", config=config)


def download_many(keys: list[str], raw_dir: Path, client=None, workers: int = 8) -> list[Path]:
    """Fetch every key into raw_dir in a bounded pool; skip files present by name.

    Every failed key is collected, and one RuntimeError names them all after the pool drains.
    """
    paths = [local_path(k, raw_dir) for k in keys]
    # a dict: a repeated key downloads once
    todo = {k: p for k, p in zip(keys, paths, strict=True) if not p.exists()}
    if not todo:
        return paths
    client = client or s3_client()
    for p in todo.values():
        p.parent.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {k: pool.submit(client.download_file, BUCKET, k, str(p)) for k, p in todo.items()}
    failed = [k for k, f in futures.items() if f.exception() is not None]
    if failed:
        raise RuntimeError(f"missing MESH file(s): {', '.join(failed)}")
    return paths


def mask_sentinels(da: xr.DataArray) -> xr.DataArray:
    """Replace every sentinel (-3 no coverage, -1 no data) with NaN."""
    return da.where(da >= 0)


def decode(path: Path, max_bytes: int = MAX_DECODE_BYTES) -> xr.DataArray:
    """Read one MESH file: mask sentinels, shift longitude to -180..180, crop to the Harris bbox."""
    path = Path(path)
    opener = gzip.open if path.suffix == ".gz" else open
    # eccodes keys, not cfgrib.open_dataset: cfgrib spends 7 s per file on the
    # 24.5 M-point coordinate build and eccodes reads the grid in 0.2 s
    with opener(path, "rb") as fh:
        raw = fh.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise RuntimeError(f"MESH file {path.name} exceeds {max_bytes} bytes")
    codes_err = getattr(eccodes, "CodesInternalError", Exception)
    try:
        handle = eccodes.codes_new_from_message(raw)
    except codes_err as exc:
        raise RuntimeError(f"bad GRIB2 message in {path}: {exc}") from exc
    try:
        # eccodes has no precise return types; these keys hold numbers in a MESH GRIB2 file
        ni = cast(int, eccodes.codes_get(handle, "Ni"))
        nj = cast(int, eccodes.codes_get(handle, "Nj"))
        lon0 = cast(float, eccodes.codes_get(handle, "longitudeOfFirstGridPointInDegrees"))
        lat0 = cast(float, eccodes.codes_get(handle, "latitudeOfFirstGridPointInDegrees"))
        dlon = cast(float, eccodes.codes_get(handle, "iDirectionIncrementInDegrees"))
        dlat = cast(float, eccodes.codes_get(handle, "jDirectionIncrementInDegrees"))
        if eccodes.codes_get(handle, "jScansPositively"):
            raise ValueError(f"{path.name}: expected latitude descending")
        # a bitmap hides cells; values would hold fill numbers instead of sizes
        if eccodes.codes_get(handle, "bitmapPresent"):
            raise ValueError(f"{path.name}: bitmapPresent is 1, expected 0")
        values = eccodes.codes_get_values(handle).reshape(nj, ni)
    except codes_err as exc:
        raise RuntimeError(f"bad GRIB2 message in {path}: {exc}") from exc
    finally:
        eccodes.codes_release(handle)
    lon = ((lon0 + dlon * np.arange(ni) + 180) % 360) - 180
    lat = lat0 - dlat * np.arange(nj)
    da = xr.DataArray(
        values, dims=("latitude", "longitude"), coords={"latitude": lat, "longitude": lon}
    )
    min_lon, min_lat, max_lon, max_lat = bbox()
    # latitude is stored descending, so the slice runs from max to min
    da = da.sortby("longitude").sel(
        longitude=slice(min_lon, max_lon), latitude=slice(max_lat, min_lat)
    )
    da = mask_sentinels(da).astype(np.float32)
    da.attrs.update(units="mm", units_source=UNITS_SOURCE, product=PRODUCT)
    return da


def daily_max(storm_date: date, raw_dir: Path) -> xr.DataArray:
    """Decode the one 12Z file for the storm date; the exact name skips boto3 partial files."""
    path = local_path(key_for(storm_date), raw_dir)
    if not path.exists():
        raise FileNotFoundError(f"no MESH file at {path}")
    da = decode(path)
    da.attrs["file_count"] = 1
    return da
