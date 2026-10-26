"""HCAD parcel loader and the per-class parcel count. Owner fields never load."""

from pathlib import Path
from typing import cast

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
# one foot is projection noise after densify; one MESH cell is 3600 ft wide
NEST_TOLERANCE_FT = 1.0
# a straight edge in degrees bends in EPSG:2278; vertices every 0.002 degree keep the bend
SEGMENT_DEG = 0.002
COUNT_COLUMNS = ["storm_date", "threshold_mm", "threshold_in", "label", "parcel_count"]


def load_parcels(
    path: Path, layer: str = "Parcels", mask: BaseGeometry | None = None
) -> gpd.GeoDataFrame:
    """Read the allow-listed parcel columns, renamed to snake_case, in the layer CRS (EPSG:2278).

    A mask in EPSG:4326 is reprojected to the layer CRS so the driver filters at read time.
    """
    if mask is not None:
        layer_crs = pyogrio.read_info(path, layer=layer)["crs"]
        if layer_crs is None:
            raise ValueError(f"{path.name} layer {layer} has no CRS")
        mask = gpd.GeoSeries([mask], crs="EPSG:4326").to_crs(layer_crs).iloc[0]
    gdf = gpd.read_file(path, layer=layer, columns=list(ALLOWED), mask=mask, engine="pyogrio")
    return cast(gpd.GeoDataFrame, gdf.rename(columns=ALLOWED))


def count_parcels(
    swaths: gpd.GeoDataFrame, parcels_path: Path, layer: str = "Parcels"
) -> pd.DataFrame:
    """Distinct parcels per size class; an empty swath frame never opens the parcel layer.

    The swaths are reprojected once to the layer CRS. One join gives the highest class per
    parcel; a parcel counts in every class at or below that class.
    """
    if swaths.empty:
        return pd.DataFrame(columns=COUNT_COLUMNS)
    if swaths.crs is None or swaths.crs.to_epsg() != 4326:
        raise ValueError(f"swaths must be in EPSG:4326, got {swaths.crs}")
    swaths = cast(gpd.GeoDataFrame, swaths.sort_values("threshold_mm").reset_index(drop=True))
    densified = swaths.set_geometry(swaths.geometry.segmentize(SEGMENT_DEG))
    # shortcut: the read mask keeps the straight edges of the lowest class, so 3 of 361,418
    # parcels in a chord sliver are not read (2024-05-28); upgrade when the count must be exact
    parcels = load_parcels(parcels_path, layer=layer, mask=swaths.geometry.iloc[0])
    if parcels.crs is None:
        raise ValueError(f"{parcels_path.name} layer {layer} has no CRS")
    swaths_native = densified.to_crs(parcels.crs)
    _require_nested(swaths_native)
    hits = gpd.sjoin(
        parcels.loc[:, ["hcad_num", "geometry"]],
        # one row per polygon part: the spatial index then skips parts far from a parcel
        swaths_native.loc[:, ["threshold_mm", "geometry"]].explode(index_parts=False),
        predicate="intersects",
    )
    top = cast(pd.Series, hits.groupby("hcad_num")["threshold_mm"].max())
    out = swaths.drop(columns="geometry").copy()
    out["parcel_count"] = [int((top >= t).sum()) for t in out["threshold_mm"]]
    return out.loc[:, COUNT_COLUMNS]


def _require_nested(swaths: gpd.GeoDataFrame) -> None:
    """Raise ValueError when a class reaches outside the next lower class (rows sorted by size)."""
    # shortcut: classes are treated as nested after reprojection; the guard raises if they are
    # not, upgrade if the guard ever fires
    geoms = swaths.geometry.tolist()
    sizes = swaths["threshold_mm"].tolist()
    for lower, higher, size in zip(geoms, geoms[1:], sizes[1:], strict=False):
        if not higher.difference(lower.buffer(NEST_TOLERANCE_FT)).is_empty:
            raise ValueError(f"size class {size} mm is not inside the next lower class")
