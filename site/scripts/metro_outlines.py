"""Extract the 8 metro county outlines once from the Census TIGER county file.

Writes the package file src/hailprint/data/metro_counties.geojson and the site copy
site/public/counties.geojson. Each feature is a MultiPolygon with `fips` and `name`.

Usage: uv run python site/scripts/metro_outlines.py [path/to/cb_2024_us_county_500k.shp]
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import MultiPolygon, mapping

from hailprint.county import METRO_NAMES

ROOT = Path(__file__).resolve().parents[2]
TIGER = ROOT / "data" / "raw" / "tiger" / "extracted" / "cb_2024_us_county_500k.shp"
PACKAGE_FILE = ROOT / "src" / "hailprint" / "data" / "metro_counties.geojson"
SITE_FILE = ROOT / "site" / "public" / "counties.geojson"


def feature(fips: str, geometry) -> dict:
    multi = geometry if isinstance(geometry, MultiPolygon) else MultiPolygon([geometry])
    return {
        "type": "Feature",
        "properties": {"fips": fips, "name": METRO_NAMES[fips]},
        "geometry": mapping(multi),
    }


def main() -> None:
    shp = Path(sys.argv[1]) if len(sys.argv) > 1 else TIGER
    counties = gpd.read_file(shp, engine="pyogrio").set_index("GEOID")
    # The TIGER file is EPSG:4269. The coordinates pass through unchanged, as before.
    features = [feature(fips, counties.loc[fips, "geometry"]) for fips in METRO_NAMES]
    lines = ",\n".join(json.dumps(f, separators=(",", ":")) for f in features)
    text = f'{{"type":"FeatureCollection","features":[\n{lines}\n]}}\n'
    for path in (PACKAGE_FILE, SITE_FILE):
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"metro_outlines: wrote {path} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
