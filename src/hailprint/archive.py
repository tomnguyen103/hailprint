"""Archive index: one row per MESH archive day from one bucket listing."""

from collections.abc import Iterator
from datetime import datetime, timedelta

import pandas as pd

from hailprint.mesh import BUCKET, PRODUCT, s3_client
from hailprint.paths import DERIVED_DIR

INDEX_PATH = DERIVED_DIR / "index" / "mesh-archive.parquet"
COLUMNS = ["storm_date", "file_count", "bytes", "has_12z"]
PREFIX = f"CONUS/{PRODUCT}/"


def list_objects(client) -> Iterator[tuple[str, int]]:
    """Yield (key, size) for every object under the product prefix."""
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX):
        for obj in page.get("Contents", []):
            yield obj["Key"], obj["Size"]


def build_index(client=None) -> pd.DataFrame:
    """Group the listing by folder date; storm_date is the folder date minus one day."""
    objects = pd.DataFrame(list(list_objects(client or s3_client())), columns=["key", "size"])
    if objects.empty:
        raise RuntimeError(f"no objects under s3://{BUCKET}/{PREFIX}")
    objects["folder"] = objects["key"].str.split("/").str[2]
    objects["is_12z"] = objects["key"].str.endswith("-120000.grib2.gz")
    grouped = objects.groupby("folder").agg(
        file_count=("key", "size"), bytes=("size", "sum"), has_12z=("is_12z", "any")
    )
    grouped["storm_date"] = [
        datetime.strptime(f, "%Y%m%d").date() - timedelta(days=1) for f in grouped.index
    ]
    return grouped.sort_values("storm_date").reset_index(drop=True).loc[:, COLUMNS]
