"""HCAD parcel loader. Only the parcel allow-list leaves the file; owner fields never load."""

from pathlib import Path

import geopandas as gpd

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


def load_parcels(path: Path, layer: str = "Parcels") -> gpd.GeoDataFrame:
    """Read the allow-listed parcel columns, rename them to snake_case, reproject to EPSG:4326."""
    gdf = gpd.read_file(path, layer=layer, columns=list(ALLOWED), engine="pyogrio")
    return gdf.rename(columns=ALLOWED).to_crs("EPSG:4326")
