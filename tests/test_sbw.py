"""IEM storm-based warnings: the filter, the allow-list, the window, and the fetch."""

import json
import urllib.error
from datetime import UTC, date, datetime
from pathlib import Path

import geopandas as gpd
import pyarrow.parquet as pq
import pytest
from shapely.geometry import shape

from hailprint import county, files, impact, sbw
from tests.conftest import needs_network

FIXTURE = Path(__file__).parent / "fixtures" / "iem_sbw_hgx.geojson"
STORM_DATE = date(2024, 5, 28)
# 101 SV Harris, 102 TO Fort Bend, 103 FF Galveston, 107 begins before the window,
# 109 touches the metro edge. The other seven fixture rows drop, one rule each:
# 104 MA, 105 watch, 106 far away, 108 begins at the window end, 110 misses the edge by
# 200 m, 111 watch with a null geometry, 112 ends at the window start.
KEPT = [107, 101, 102, 109, 103]


def feed() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_parse_keeps_only_sv_to_ff_warnings_that_reach_a_metro_county():
    frame = sbw.parse(FIXTURE.read_text(encoding="utf-8"), STORM_DATE)

    assert frame["eventid"].tolist() == KEPT
    assert frame["phenomena"].tolist() == ["SV", "SV", "TO", "SV", "FF"]
    assert set(frame["significance"]) == {"W"}


def test_parse_keeps_the_allow_listed_columns_and_no_text_field():
    frame = sbw.parse(FIXTURE.read_text(encoding="utf-8"), STORM_DATE)

    assert list(frame.columns) == [
        "phenomena",
        "significance",
        "event_label",
        "eventid",
        "polygon_begin",
        "polygon_end",
        "product_id",
        "geometry",
    ]
    assert frame.crs == "EPSG:4326"
    assert frame["polygon_begin"].iloc[0] == datetime(2024, 5, 28, 11, tzinfo=UTC)
    assert frame["polygon_end"].iloc[0] == datetime(2024, 5, 28, 13, tzinfo=UTC)
    union = county.metro().geometry.union_all()
    assert all(geometry.intersects(union) for geometry in frame.geometry)


def test_parse_orders_the_rows_the_same_whatever_the_feed_order():
    document = feed()
    document["features"].reverse()

    frame = sbw.parse(json.dumps(document), STORM_DATE)

    assert frame["eventid"].tolist() == KEPT


def test_parse_writes_a_file_with_zero_rows_when_no_warning_qualifies(tmp_path):
    document = feed()
    document["features"] = [f for f in document["features"] if f["properties"]["phenomena"] == "MA"]
    frame = sbw.parse(json.dumps(document), STORM_DATE)

    path = files.write_atomic(frame, tmp_path / "warnings.parquet", sbw.METADATA)

    assert len(gpd.read_parquet(path)) == 0
    assert list(gpd.read_parquet(path).columns) == list(frame.columns)


def test_write_atomic_stamps_iem_and_sbw_metadata(tmp_path):
    frame = sbw.parse(FIXTURE.read_text(encoding="utf-8"), STORM_DATE)

    path = files.write_atomic(frame, tmp_path / "warnings.parquet", sbw.METADATA)

    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"iem", b"sbw")


def test_parse_raises_value_error_naming_the_eventid_for_a_kept_type_with_no_geometry():
    document = feed()
    next(f for f in document["features"] if f["properties"]["eventid"] == 101)["geometry"] = None

    with pytest.raises(ValueError, match=r"warning 101 .*no geometry"):
        sbw.parse(json.dumps(document), STORM_DATE)


def test_parse_raises_value_error_naming_the_eventid_when_an_allow_listed_property_is_missing():
    document = feed()
    del next(f for f in document["features"] if f["properties"]["eventid"] == 102)["properties"][
        "product_id"
    ]

    with pytest.raises(ValueError, match=r"warning 102 lacks product_id"):
        sbw.parse(json.dumps(document), STORM_DATE)


def test_parse_raises_value_error_naming_the_field_and_the_eventid_for_a_null_event_label():
    document = feed()
    next(f for f in document["features"] if f["properties"]["eventid"] == 101)["properties"][
        "event_label"
    ] = None

    with pytest.raises(ValueError, match=r"warning 101 has a null event_label"):
        sbw.parse(json.dumps(document), STORM_DATE)


@pytest.mark.parametrize(
    ("key", "value", "message"),
    [
        ("product_id", None, "has a null product_id"),
        ("product_id", "", "has an empty product_id"),
        ("event_label", "", "has an empty event_label"),
    ],
)
def test_parse_raises_value_error_naming_the_eventid_for_a_null_or_empty_label_or_product_id(
    key, value, message
):
    document = feed()
    next(f for f in document["features"] if f["properties"]["eventid"] == 101)["properties"][
        key
    ] = value

    with pytest.raises(ValueError, match=rf"warning 101 {message}"):
        sbw.parse(json.dumps(document), STORM_DATE)


def test_parse_shows_a_feed_value_in_an_error_as_a_repr_cut_to_40_characters():
    document = feed()
    kept = next(f for f in document["features"] if f["properties"]["eventid"] == 101)
    kept["properties"]["eventid"] = "x" * 100
    kept["geometry"] = None

    with pytest.raises(ValueError) as caught:
        sbw.parse(json.dumps(document), STORM_DATE)

    assert str(caught.value) == f"warning '{'x' * 36}... has no geometry"


def test_parse_reads_the_utc_prefixed_polygon_times_of_the_live_feed():
    document = feed()
    kept = next(f for f in document["features"] if f["properties"]["eventid"] == 101)

    assert "polygon_begin" not in kept["properties"]
    frame = sbw.parse(json.dumps(document), STORM_DATE)
    row = frame[frame["eventid"] == 101].iloc[0]
    assert row["polygon_begin"] == datetime(2024, 5, 28, 21, tzinfo=UTC)
    assert row["polygon_end"] == datetime(2024, 5, 28, 22, tzinfo=UTC)


def test_parse_raises_value_error_when_a_feed_time_is_empty():
    document = feed()
    next(f for f in document["features"] if f["properties"]["eventid"] == 101)["properties"][
        "utc_polygon_begin"
    ] = None

    with pytest.raises(ValueError, match=r"warning 101 has a malformed value"):
        sbw.parse(json.dumps(document), STORM_DATE)


def test_parse_raises_value_error_for_a_kept_warning_whose_geometry_is_not_a_polygon():
    document = feed()
    next(f for f in document["features"] if f["properties"]["eventid"] == 101)["geometry"] = {
        "type": "Point",
        "coordinates": [-95.4, 29.7],
    }

    with pytest.raises(ValueError, match=r"warning 101 has a malformed value"):
        sbw.parse(json.dumps(document), STORM_DATE)


@pytest.mark.parametrize("member", ["text", 3, None])
def test_parse_raises_value_error_for_a_feature_that_is_not_an_object(member):
    document = feed()
    document["features"].append(member)

    with pytest.raises(ValueError, match="not an object"):
        sbw.parse(json.dumps(document), STORM_DATE)


@pytest.mark.parametrize("text", ["not json", '{"type": "FeatureCollection"}', "[]"])
def test_parse_raises_value_error_for_a_body_that_is_not_a_feature_collection(text):
    with pytest.raises(ValueError, match="IEM warnings feed"):
        sbw.parse(text, STORM_DATE)


def test_fetch_asks_iem_for_the_window_and_wfo_hgx(monkeypatch):
    urls = []
    monkeypatch.setattr(sbw.net, "get", lambda url, timeout: urls.append(url) or b"{}")

    assert sbw.fetch(STORM_DATE) == "{}"
    assert urls == [
        "https://mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson"
        "?begints=2024-05-28T12:00Z&endts=2024-05-30T12:00Z&wfo=HGX"
    ]


def test_fetch_raises_runtime_error_that_names_the_date_when_iem_fails(monkeypatch):
    def refuse(url, timeout):
        raise urllib.error.HTTPError(url, 503, "Service Unavailable", {}, None)

    monkeypatch.setattr(sbw.net, "get", refuse)

    with pytest.raises(RuntimeError, match=r"2024-05-28.*503"):
        sbw.fetch(STORM_DATE)


@needs_network
def test_the_live_feed_count_after_the_filter_equals_the_parquet_row_count():
    """O14: an independent filter of the raw feed gives the row count `parse` returns."""
    text = sbw.fetch(STORM_DATE)
    start, end = (t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in impact.window(STORM_DATE))
    union = county.metro().geometry.union_all()
    expected = [
        f
        for f in json.loads(text)["features"]
        if f["properties"]["phenomena"] in ("SV", "TO", "FF")
        and f["properties"]["significance"] == "W"
        and f["properties"]["utc_polygon_begin"] < end
        and f["properties"]["utc_polygon_end"] > start
        and shape(f["geometry"]).intersects(union)
    ]

    assert len(sbw.parse(text, STORM_DATE)) == len(expected)
