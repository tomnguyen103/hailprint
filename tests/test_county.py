import json
import re
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import shape

from hailprint import county
from hailprint.county import bbox, metro, metro_bbox, outline

FIXTURES = Path(__file__).parent / "fixtures"
BASEMAP_SH = Path(__file__).parents[1] / "site" / "scripts" / "basemap.sh"
BASEMAP_PY = Path(__file__).parents[1] / "site" / "scripts" / "basemap.py"

# Census cb_2024_us_county_500k, GEOID 48201, EPSG:4269 bounds.
ORACLE = (-95.960733, 29.49752, -94.908498, 30.170606)
# The same file, the 8 metro counties, bounds padded by 0.05 degree.
METRO_ORACLE = (-96.242208, 28.77556588, -94.303383, 30.680284)
PLAN_NAMES = {
    "48201": "Harris",
    "48157": "Fort Bend",
    "48339": "Montgomery",
    "48039": "Brazoria",
    "48167": "Galveston",
    "48473": "Waller",
    "48291": "Liberty",
    "48071": "Chambers",
}


def _metro_file(tmp_path, fips):
    """Write a metro-shaped file with one square per FIPS in `fips`."""
    features = [
        {
            "type": "Feature",
            "properties": {"fips": f, "name": "x"},
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
            },
        }
        for f in fips
    ]
    path = tmp_path / "metro.geojson"
    doc = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


def test_outline_is_harris_in_4326():
    gdf = outline()
    assert gdf.crs.to_epsg() == 4326
    assert len(gdf) == 1
    assert gdf.iloc[0]["fips"] == "48201"


def test_outline_geometry_equals_the_old_harris_file():
    old = json.loads((FIXTURES / "harris_county.geojson").read_text(encoding="utf-8"))
    want = shape(old["features"][0]["geometry"])
    assert outline().geometry.iloc[0].equals_exact(want, 1e-9)


def test_bbox_is_oracle_padded():
    got = bbox()
    want = (ORACLE[0] - 0.05, ORACLE[1] - 0.05, ORACLE[2] + 0.05, ORACLE[3] + 0.05)
    for g, w in zip(got, want, strict=True):
        assert abs(g - w) < 1e-9


def test_metro_holds_the_8_plan_counties_keyed_by_fips():
    gdf = metro()
    assert len(gdf) == 8
    assert gdf.crs.to_epsg() == 4326
    assert gdf["name"].to_dict() == PLAN_NAMES
    assert set(gdf.geom_type) == {"MultiPolygon"}


def test_metro_bbox_is_the_8_outline_bounds_padded():
    for g, w in zip(metro_bbox(), METRO_ORACLE, strict=True):
        assert abs(g - w) < 1e-9


def test_basemap_script_extracts_the_metro_bbox():
    for script in (BASEMAP_SH, BASEMAP_PY):
        text = script.read_text(encoding="utf-8")
        literal = re.search(r'^BBOX\s*=\s*"([^"]+)"', text, re.MULTILINE)
        assert literal is not None
        got = tuple(float(v) for v in literal.group(1).split(","))
        for g, w in zip(got, METRO_ORACLE, strict=True):
            assert abs(g - w) < 1e-9


def test_metro_with_7_features_raises_and_names_the_fips(tmp_path, monkeypatch):
    path = _metro_file(tmp_path, list(PLAN_NAMES)[:7])
    monkeypatch.setattr(county, "_METRO", path)
    with pytest.raises(ValueError, match="48071"):
        metro()


def test_metro_with_a_duplicate_fips_raises(tmp_path, monkeypatch):
    path = _metro_file(tmp_path, [*list(PLAN_NAMES)[:7], "48201"])
    monkeypatch.setattr(county, "_METRO", path)
    with pytest.raises(ValueError, match="duplicate"):
        metro()


def test_missing_metro_file_raises_and_names_the_path(tmp_path, monkeypatch):
    path = tmp_path / "absent.geojson"
    monkeypatch.setattr(county, "_METRO", path)
    with pytest.raises(FileNotFoundError, match="absent.geojson"):
        metro()


def test_metro_returns_a_geodataframe():
    assert isinstance(metro(), gpd.GeoDataFrame)
