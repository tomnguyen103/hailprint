"""MESH download, GRIB2 decode, and the daily max for one storm date."""

import gzip
from datetime import date
from pathlib import Path

import boto3
import eccodes
import numpy as np
import xarray as xr
from botocore import UNSIGNED
from botocore.config import Config

from hailprint.county import bbox

BUCKET = "noaa-mrms-pds"
PRODUCT = "MESH_Max_1440min_00.50"
UNITS_SOURCE = "NSSL MRMS GRIB2 table; cfgrib reports unknown"


def prefix(storm_date: date) -> str:
    return f"CONUS/{PRODUCT}/{storm_date:%Y%m%d}/"


def _client():
    return boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))


def download(storm_date: date, raw_dir: Path, client=None) -> list[Path]:
    """Fetch every file for the date into raw_dir/YYYYMMDD; skip files present by name."""
    client = client or _client()
    key_prefix = prefix(storm_date)
    # shortcut: one list call; 48 keys per day fit under the 1000-key page,
    # upgrade to a paginator when a product with more files per day is added
    keys = [
        o["Key"]
        for o in client.list_objects_v2(Bucket=BUCKET, Prefix=key_prefix).get("Contents", [])
    ]
    if not keys:
        raise RuntimeError(f"no objects under s3://{BUCKET}/{key_prefix}")
    day_dir = Path(raw_dir) / f"{storm_date:%Y%m%d}"
    day_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    # shortcut: files download sequentially, upgrade to concurrent downloads at M5 backtest scale
    for key in sorted(keys):
        local = day_dir / Path(key).name
        if not local.exists():
            client.download_file(BUCKET, key, str(local))
        paths.append(local)
    return paths


def mask_sentinels(da: xr.DataArray) -> xr.DataArray:
    """Replace every sentinel (-3 no coverage, -1 no data) with NaN."""
    return da.where(da >= 0)


def decode(path: Path) -> xr.DataArray:
    """Read one MESH file: mask sentinels, shift longitude to -180..180, crop to the Harris bbox."""
    path = Path(path)
    opener = gzip.open if path.suffix == ".gz" else open
    # eccodes keys, not cfgrib.open_dataset: cfgrib spends 7 s per file on the
    # 24.5 M-point coordinate build and eccodes reads the grid in 0.2 s
    with opener(path, "rb") as fh:
        handle = eccodes.codes_new_from_message(fh.read())
    try:
        ni, nj = eccodes.codes_get(handle, "Ni"), eccodes.codes_get(handle, "Nj")
        lon0 = eccodes.codes_get(handle, "longitudeOfFirstGridPointInDegrees")
        lat0 = eccodes.codes_get(handle, "latitudeOfFirstGridPointInDegrees")
        dlon = eccodes.codes_get(handle, "iDirectionIncrementInDegrees")
        dlat = eccodes.codes_get(handle, "jDirectionIncrementInDegrees")
        if eccodes.codes_get(handle, "jScansPositively"):
            raise ValueError(f"{path.name}: expected latitude descending")
        values = eccodes.codes_get_values(handle).reshape(nj, ni)
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


def reduce_stack(arrays: list[xr.DataArray]) -> xr.DataArray:
    """Cell-wise max over the stack; sentinels and NaN never win."""
    stack = xr.concat([mask_sentinels(a) for a in arrays], dim="file")
    return stack.max("file", skipna=True).astype(np.float32)


def daily_max(storm_date: date, raw_dir: Path) -> tuple[xr.DataArray, int]:
    """Decode every file for the date and return (cell-wise max, file_count)."""
    day_dir = Path(raw_dir) / f"{storm_date:%Y%m%d}"
    paths = sorted(day_dir.glob("*.grib2*"))
    if not paths:
        raise FileNotFoundError(f"no MESH files under {day_dir}")
    da = reduce_stack([decode(p) for p in paths])
    da.attrs.update(units="mm", units_source=UNITS_SOURCE, product=PRODUCT, file_count=len(paths))
    return da, len(paths)
