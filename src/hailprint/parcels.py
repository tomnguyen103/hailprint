"""HCAD parcel loader and the per-class parcel count. Owner fields never load."""

import gc
from collections.abc import Sequence
from pathlib import Path
from typing import NamedTuple, cast

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry.base import BaseGeometry

from hailprint import swath

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
ZIP_COLUMNS = ["storm_date", "zip", "threshold_mm", "threshold_in", "label", "parcel_count"]
UNKNOWN_ZIP = "unknown"


class ParcelCounts(NamedTuple):
    classes: pd.DataFrame
    zips: pd.DataFrame


def load_parcels(
    path: Path,
    layer: str = "Parcels",
    mask: BaseGeometry | None = None,
    columns: Sequence[str] | None = None,
) -> gpd.GeoDataFrame:
    """Read allow-listed parcel columns, renamed to snake_case, in the layer CRS (EPSG:2278).

    Reproject an EPSG:4326 mask to the layer CRS so the driver filters at read time.
    Any column outside ALLOWED or an empty column list raises ValueError so owner fields stay out.
    """
    if isinstance(columns, (str, bytes)):
        raise ValueError("columns must be a sequence of column names, not str or bytes")
    selected = list(ALLOWED) if columns is None else list(dict.fromkeys(columns))
    if not selected:
        raise ValueError("columns must include at least one allow-listed parcel column")
    disallowed = sorted(set(selected) - set(ALLOWED))
    if disallowed:
        raise ValueError(f"disallowed parcel columns: {disallowed}")
    if mask is not None:
        layer_crs = pyogrio.read_info(path, layer=layer)["crs"]
        if layer_crs is None:
            raise ValueError(f"{path.name} layer {layer} has no CRS")
        mask = gpd.GeoSeries([mask], crs="EPSG:4326").to_crs(layer_crs).iloc[0]
    was_enabled = gc.isenabled()
    gc.disable()
    try:
        gdf = gpd.read_file(path, layer=layer, columns=selected, mask=mask, engine="pyogrio")
    finally:
        if was_enabled:
            gc.enable()
    return cast(gpd.GeoDataFrame, gdf.rename(columns={col: ALLOWED[col] for col in selected}))


def zip5(values: pd.Series) -> pd.Series:
    """The first five digits of each HCAD 77xxx zip value; any other value becomes `unknown`."""
    digits = values.astype("string").str.strip().str.extract(r"^(77\d{3})", expand=False)
    return digits.fillna(UNKNOWN_ZIP).astype(object)


def count_parcels(
    swaths: gpd.GeoDataFrame, parcels_path: Path, layer: str = "Parcels"
) -> ParcelCounts:
    """Distinct parcels per size class and per ZIP; an empty swath frame never opens the layer.

    The swaths are reprojected once to the layer CRS. One join gives the highest class per
    parcel; a parcel counts in every class at or below that class, and in its own ZIP.
    """
    # shortcut: the ZIP is the HCAD field and not a geocode, upgrade when HCAD replies and
    # parcel geometry may publish
    if swaths.empty:
        return ParcelCounts(pd.DataFrame(columns=COUNT_COLUMNS), pd.DataFrame(columns=ZIP_COLUMNS))
    if swaths.crs is None or not swaths.crs.equals("EPSG:4326", ignore_axis_order=True):
        raise ValueError(f"swaths must be in EPSG:4326, got {swaths.crs}")
    swaths = cast(gpd.GeoDataFrame, swaths.sort_values("threshold_mm").reset_index(drop=True))
    densified = swaths.set_geometry(swaths.geometry.segmentize(SEGMENT_DEG))
    # shortcut: the read mask keeps the straight edges of the lowest class, so 3 of 361,418
    # parcels in a chord sliver are not read (2024-05-28); upgrade when the count must be exact
    parcels = load_parcels(
        parcels_path,
        layer=layer,
        mask=swaths.geometry.iloc[0],
        columns=("HCAD_NUM_1", "zip"),
    )
    if parcels.crs is None:
        raise ValueError(f"{parcels_path.name} layer {layer} has no CRS")
    swaths_native = densified.to_crs(parcels.crs)
    # shortcut: classes are treated as nested after reprojection; the guard raises if they are
    # not, upgrade if the guard ever fires
    swath.require_nested(swaths_native, NEST_TOLERANCE_FT)
    hits = gpd.sjoin(
        parcels.loc[:, ["hcad_num", "zip", "geometry"]],
        # one row per polygon part: the spatial index then skips parts far from a parcel
        swaths_native.loc[:, ["threshold_mm", "geometry"]].explode(index_parts=False),
        predicate="intersects",
    )
    hits = hits.sort_values("threshold_mm", ascending=False, kind="stable")
    by_parcel = (
        hits.dropna(subset=["hcad_num"])
        .drop_duplicates("hcad_num")
        .rename(columns={"threshold_mm": "top"})
    )
    by_parcel["zip"] = zip5(cast(pd.Series, by_parcel["zip"]))
    out = swaths.drop(columns="geometry").copy()
    out["parcel_count"] = [int((by_parcel["top"] >= t).sum()) for t in out["threshold_mm"]]
    rows = []
    for cls in out.to_dict("records"):
        inside = by_parcel.loc[by_parcel["top"] >= cls["threshold_mm"]]
        for zip_code, n in inside.groupby("zip").size().items():
            rows.append({**cls, "zip": zip_code, "parcel_count": int(n)})
    zips = pd.DataFrame(rows, columns=ZIP_COLUMNS)
    zips = zips.sort_values(["zip", "threshold_mm"]).reset_index(drop=True)
    return ParcelCounts(out.loc[:, COUNT_COLUMNS], zips)
