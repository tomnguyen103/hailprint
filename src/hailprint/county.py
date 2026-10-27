"""The 8 metro county outlines, the Harris outline, and the Harris bbox."""

from importlib.resources import files

import geopandas as gpd

# shortcut: the 8 metro outlines are a committed GeoJSON extracted once from
# data/raw/tiger/extracted/cb_2024_us_county_500k.shp on 2026-10-27 by
# site/scripts/metro_outlines.py, upgrade to a download when the scope leaves the metro
_METRO = files("hailprint.data") / "metro_counties.geojson"
PAD_DEG = 0.05
HARRIS = "48201"
# FIPS -> plan name: Harris and its seven neighbours
METRO_NAMES = {
    "48201": "Harris",
    "48157": "Fort Bend",
    "48339": "Montgomery",
    "48039": "Brazoria",
    "48167": "Galveston",
    "48473": "Waller",
    "48291": "Liberty",
    "48071": "Chambers",
}


def metro() -> gpd.GeoDataFrame:
    """Return the 8 metro outlines in EPSG:4326, indexed by FIPS with a `name` column."""
    with _METRO.open("rb") as fh:
        gdf = gpd.read_file(fh, engine="pyogrio")
    fips = gdf["fips"].tolist()
    if len(set(fips)) != len(fips):
        raise ValueError(f"metro file holds a duplicate FIPS: {sorted(fips)}")
    if set(fips) != set(METRO_NAMES):
        raise ValueError(f"metro file holds FIPS {sorted(fips)}, expected {sorted(METRO_NAMES)}")
    return gpd.GeoDataFrame(gdf.set_index("fips"))


def outline() -> gpd.GeoDataFrame:
    """Return the Harris County polygon as one row in EPSG:4326."""
    return metro().loc[[HARRIS]].reset_index()


def _padded(bounds) -> tuple[float, float, float, float]:
    min_lon, min_lat, max_lon, max_lat = bounds
    return (min_lon - PAD_DEG, min_lat - PAD_DEG, max_lon + PAD_DEG, max_lat + PAD_DEG)


def bbox() -> tuple[float, float, float, float]:
    """Return (min_lon, min_lat, max_lon, max_lat) padded by PAD_DEG."""
    return _padded(outline().total_bounds)


def metro_bbox() -> tuple[float, float, float, float]:
    """Return the bounds of the 8 metro outlines padded by PAD_DEG."""
    return _padded(metro().total_bounds)
