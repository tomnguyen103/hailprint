"""Size-class swath polygons and the GeoParquet swath file."""

from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
import xarray as xr
from rasterio.features import shapes
from rasterio.transform import from_origin

from hailprint import files
from hailprint.files import CONFIDENCE as CONFIDENCE  # re-export: callers read swath.CONFIDENCE

SIZE_CLASSES_MM = (19.05, 25.4, 31.75, 38.1, 44.45, 50.8, 63.5)
COLUMNS = ["storm_date", "threshold_mm", "threshold_in", "label", "geometry"]
FORBIDDEN_WORD = "damage"


def _transform(da: xr.DataArray):
    lon, lat = da.longitude.values, da.latitude.values
    dx, dy = float(lon[1] - lon[0]), float(lat[0] - lat[1])
    # coordinates are cell centres; the affine origin is the top-left cell edge
    return from_origin(float(lon[0]) - dx / 2, float(lat[0]) + dy / 2, dx, dy)


def build_swaths(da: xr.DataArray, storm_date: date) -> gpd.GeoDataFrame:
    """One dissolved MultiPolygon per size class with at least one cell at or above it."""
    values = da.values
    transform = _transform(da)
    rows = []
    for threshold in SIZE_CLASSES_MM:
        # compare in the raster dtype so float32(19.05) counts as 19.05
        mask = np.nan_to_num(values, nan=-1) >= np.asarray(threshold, dtype=values.dtype)
        if not mask.any():
            continue
        polygons = [
            shapely.geometry.shape(geom)
            for geom, _ in shapes(mask.astype(np.uint8), mask=mask, transform=transform)
        ]
        threshold_in = threshold / 25.4
        rows.append(
            {
                "storm_date": storm_date.isoformat(),
                "threshold_mm": threshold,
                "threshold_in": threshold_in,
                "label": f"radar-estimated hail size >= {threshold_in:.2f} in",
                "geometry": shapely.MultiPolygon(
                    shapely.get_parts(shapely.unary_union(polygons)).tolist()
                ),
            }
        )
    return gpd.GeoDataFrame(rows, columns=COLUMNS, geometry="geometry", crs="EPSG:4326")


def write_swaths(
    gdf: gpd.GeoDataFrame, path: Path, file_count: int, max_mesh_mm: float | None
) -> Path:
    """Write the swath file as GeoParquet with the source and confidence metadata."""
    metadata = {
        "file_count": str(file_count),
        "max_mesh_mm": "" if max_mesh_mm is None else str(max_mesh_mm),
    }
    for text in [*gdf["label"].tolist(), *metadata.values(), *files.METADATA.values()]:
        if FORBIDDEN_WORD in text.lower():
            raise ValueError(f"forbidden word in swath text: {text!r}")
    return files.write_atomic(gdf, path, metadata)
