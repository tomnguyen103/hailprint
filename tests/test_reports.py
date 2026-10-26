from datetime import date

import geopandas as gpd
import pandas as pd
import pytest
import shapely

from hailprint import county
from hailprint.reports import BUFFER_KM, harris_reports, nearby_reports, parse

HEADER = "Time,Size,Location,County,State,Lat,Lon,Comments\n"
CSV = (
    HEADER
    + """1823,100,6 NE Jersey Village,Harris,TX,29.96,-95.53,Report from mPING (HGX)
1900,175,2 S Tomball,Harris,TX,30.07,-95.62,(HGX)
1910,125,Hamilton,Harris,GA,32.75,-84.87,(FFC)
1930,200,Sugar Land,Fort Bend,TX,29.62,-95.63,(HGX)
1945,150,Hamilton,Harris,GA,32.75,-84.87,(FFC)
"""
)
COLUMNS = ["time", "location", "county", "state", "size_in", "geometry"]


def test_harris_tx_rows_only():
    gdf = harris_reports(date(2024, 5, 28), text=CSV)
    assert len(gdf) == 2
    assert gdf["size_in"].tolist() == [1.0, 1.75]
    assert gdf["time"].tolist() == ["1823", "1900"]
    assert gdf["location"].tolist() == ["6 NE Jersey Village", "2 S Tomball"]
    assert gdf["county"].tolist() == ["Harris", "Harris"]
    assert gdf["state"].tolist() == ["TX", "TX"]
    assert gdf.crs.to_epsg() == 4326
    assert gdf.geometry.x.round(2).tolist() == [-95.53, -95.62]
    assert gdf.geometry.y.round(2).tolist() == [29.96, 30.07]


def test_no_harris_rows_gives_empty_frame():
    gdf = harris_reports(date(2024, 5, 28), text=HEADER)
    assert len(gdf) == 0
    assert list(gdf.columns) == COLUMNS


def test_nearby_reports_keeps_fort_bend_and_drops_georgia():
    gdf = nearby_reports(date(2024, 5, 28), text=CSV)

    assert gdf["location"].tolist() == ["6 NE Jersey Village", "2 S Tomball", "Sugar Land"]
    assert gdf["county"].tolist() == ["Harris", "Harris", "Fort Bend"]
    assert gdf["state"].tolist() == ["TX", "TX", "TX"]
    assert list(gdf.columns) == COLUMNS
    assert gdf.crs.to_epsg() == 4326


def _outline_metres() -> shapely.geometry.base.BaseGeometry:
    return county.outline().to_crs("EPSG:32615").geometry.union_all()


def _row_north_of_the_county(metres: float, location: str) -> tuple[str, float, float]:
    """A report `metres` due north of the county's northernmost vertex (EPSG:32615)."""
    outline = _outline_metres()
    top = max(shapely.get_coordinates(outline), key=lambda xy: xy[1])
    point = gpd.GeoSeries([shapely.Point(top[0], top[1] + metres)], crs="EPSG:32615").to_crs(
        "EPSG:4326"
    )
    return location, point.iloc[0].y, point.iloc[0].x


def test_buffer_is_fifty_km_measured_in_metres():
    near, far = (
        _row_north_of_the_county(49_000, "49 km out"),
        _row_north_of_the_county(51_000, "51 km out"),
    )
    rows = "".join(
        f"1200,100,{loc},Waller,TX,{lat:.6f},{lon:.6f},x\n" for loc, lat, lon in (near, far)
    )
    outline = _outline_metres()
    metres = gpd.GeoSeries(
        [shapely.Point(lon, lat) for _, lat, lon in (near, far)], crs="EPSG:4326"
    ).to_crs("EPSG:32615")
    assert [round(outline.distance(p) / 1000) for p in metres] == [49, 51]

    gdf = nearby_reports(date(2024, 5, 28), text=HEADER + rows)

    assert BUFFER_KM == 50
    assert gdf["location"].tolist() == ["49 km out"]


def test_nearby_reports_header_only_gives_the_empty_frame():
    gdf = nearby_reports(date(2024, 5, 28), text=HEADER)

    assert len(gdf) == 0
    assert list(gdf.columns) == COLUMNS


def test_nearby_reports_gives_equal_frames_on_two_runs():
    first = nearby_reports(date(2024, 5, 28), text=CSV)
    second = nearby_reports(date(2024, 5, 28), text=CSV)

    pd.testing.assert_frame_equal(pd.DataFrame(first), pd.DataFrame(second))
    assert first.geometry.equals(second.geometry)


def test_nearby_reports_rejects_a_row_with_a_bad_size():
    with pytest.raises(ValueError):
        nearby_reports(date(2024, 5, 28), text=HEADER + "1200,big,x,Harris,TX,29.9,-95.4,x\n")


def test_harris_reports_keeps_a_harris_row_far_from_the_county_by_name():
    far = HEADER + "1200,100,Odd,Harris,TX,45.0,-100.0,x\n"

    assert len(harris_reports(date(2024, 5, 28), text=far)) == 1
    assert len(nearby_reports(date(2024, 5, 28), text=far)) == 0


def test_parse_rejects_a_header_without_the_size_column():
    with pytest.raises(ValueError, match="Size"):
        parse("Time,Location,County,State,Lat,Lon\n")


def test_parse_rejects_an_html_body_and_a_short_row():
    with pytest.raises(ValueError, match="lacks the columns"):
        parse("<html>Service Unavailable</html>")
    with pytest.raises(ValueError, match="malformed row"):
        parse(HEADER + "1200,100,Odd\n")
