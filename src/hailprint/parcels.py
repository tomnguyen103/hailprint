"""HCAD parcel loader and the per-class parcel count. Owner fields never load."""

from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry.base import BaseGeometry

ALLOWED = {
    "HCAD_NUM_1": "hcad_num",
    "LOWPARCELID": "low_parcel_id",
    "zip": "zip",
    "city": "city",
    "yr_impr": "yr_impr",
    "StatedArea": "stated_area",
    "Stacked": "stacked",
}
OWNER_FIELDS = (
    "CurrOwner",
    "mail_addr_1",
    "mail_addr_2",
    "mail_city",
    "mail_state",
    "mail_zip",
    "LocAddr",
    "LocNum",
    "LocName",
)
COUNT_COLUMNS = ["storm_date", "threshold_mm", "threshold_in", "label", "parcel_count"]


def load_parcels(
    path: Path, layer: str = "Parcels", mask: BaseGeometry | None = None
) -> gpd.GeoDataFrame:
    """Read the allow-listed parcel columns, rename them to snake_case, reproject to EPSG:4326.

    A mask in EPSG:4326 is reprojected to the layer CRS so the driver filters at read time.
    """
    if mask is not None:
        layer_crs = pyogrio.read_info(path, layer=layer)["crs"]
        mask = gpd.GeoSeries([mask], crs="EPSG:4326").to_crs(layer_crs).iloc[0]
    gdf = gpd.read_file(path, layer=layer, columns=list(ALLOWED), mask=mask, engine="pyogrio")
    return gdf.rename(columns=ALLOWED).to_crs("EPSG:4326")


def count_parcels(swaths: gpd.GeoDataFrame, parcels: gpd.GeoDataFrame) -> pd.DataFrame:
    """Distinct parcels that intersect each size class; every swath class keeps a row."""
    if swaths.empty:
        return pd.DataFrame(columns=COUNT_COLUMNS)
    hits = gpd.sjoin(parcels[["hcad_num", "geometry"]], swaths, predicate="intersects")
    per_class = hits.groupby("threshold_mm")["hcad_num"].nunique()
    out = swaths.drop(columns="geometry").copy()
    out["parcel_count"] = out["threshold_mm"].map(per_class).fillna(0).astype(int)
    return out.sort_values("threshold_mm").reset_index(drop=True)[COUNT_COLUMNS]
