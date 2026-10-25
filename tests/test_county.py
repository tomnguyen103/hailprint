from hailprint.county import bbox, outline

# Census cb_2024_us_county_500k, GEOID 48201, EPSG:4269 bounds.
ORACLE = (-95.960733, 29.49752, -94.908498, 30.170606)


def test_outline_is_harris_in_4326():
    gdf = outline()
    assert gdf.crs.to_epsg() == 4326
    assert len(gdf) == 1
    assert gdf.iloc[0]["GEOID"] == "48201"


def test_bbox_is_oracle_padded():
    got = bbox()
    want = (ORACLE[0] - 0.05, ORACLE[1] - 0.05, ORACLE[2] + 0.05, ORACLE[3] + 0.05)
    for g, w in zip(got, want, strict=True):
        assert abs(g - w) < 1e-6
