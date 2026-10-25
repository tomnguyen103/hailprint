from datetime import date

from hailprint.reports import harris_reports

CSV = """Time,Size,Location,County,State,Lat,Lon,Comments
1823,100,6 NE Jersey Village,Harris,TX,29.96,-95.53,Report from mPING (HGX)
1900,175,2 S Tomball,Harris,TX,30.07,-95.62,(HGX)
1910,125,Hamilton,Harris,GA,32.75,-84.87,(FFC)
1930,200,Sugar Land,Fort Bend,TX,29.62,-95.63,(HGX)
"""


def test_harris_tx_rows_only():
    gdf = harris_reports(date(2024, 5, 28), text=CSV)
    assert len(gdf) == 2
    assert gdf["size_in"].tolist() == [1.0, 1.75]
    assert gdf["time"].tolist() == ["1823", "1900"]
    assert gdf["location"].tolist() == ["6 NE Jersey Village", "2 S Tomball"]
    assert gdf.crs.to_epsg() == 4326
    assert gdf.geometry.x.round(2).tolist() == [-95.53, -95.62]
    assert gdf.geometry.y.round(2).tolist() == [29.96, 30.07]


def test_no_harris_rows_gives_empty_frame():
    gdf = harris_reports(date(2024, 5, 28), text=CSV.splitlines()[0] + "\n")
    assert len(gdf) == 0
    assert list(gdf.columns) == ["time", "location", "size_in", "geometry"]
