"""Harris County outline and the Harris bbox."""

from importlib.resources import files

import geopandas as gpd

# shortcut: the county outline is a committed GeoJSON extracted once from
# data/raw/tiger/extracted/cb_2024_us_county_500k.shp (GEOID 48201) on 2026-10-24,
# upgrade to a download when a second county is needed
_OUTLINE = files("hailprint.data") / "harris_county.geojson"
PAD_DEG = 0.05


def outline() -> gpd.GeoDataFrame:
    """Return the Harris County polygon as one row in EPSG:4326."""
    with _OUTLINE.open("rb") as fh:
        return gpd.read_file(fh, engine="pyogrio")


def bbox() -> tuple[float, float, float, float]:
    """Return (min_lon, min_lat, max_lon, max_lat) padded by PAD_DEG."""
    min_lon, min_lat, max_lon, max_lat = outline().total_bounds
    return (min_lon - PAD_DEG, min_lat - PAD_DEG, max_lon + PAD_DEG, max_lat + PAD_DEG)
