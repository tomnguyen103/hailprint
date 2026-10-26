"""Documents, schemas, receipt, and safe serialisation of the published files."""

import csv
import io
import json
from datetime import UTC, date, datetime, timedelta, timezone
from importlib.metadata import version
from importlib.resources import files
from pathlib import Path

import geopandas as gpd
import pytest
import shapely
from jsonschema import Draft202012Validator

from hailprint import publish, reports, swath
from hailprint.parcels import OWNER_FIELDS

RUN_TIME = datetime(2024, 5, 29, 13, 0, 7, 987654, tzinfo=UTC)
SOURCES = [
    {
        "source": "noaa-mrms-pds",
        "product": "MESH_Max_1440min_00.50",
        "file": "swaths-2024-05-28.parquet",
    }
]
SCHEMAS = ["receipt", "swath", "reports", "pairs", "zip-counts"]


def _receipt():
    return publish.receipt(date(2024, 5, 28), SOURCES, RUN_TIME)


def _pairs_class(mm=19.05, inches=0.75):
    return {
        "threshold_mm": mm,
        "threshold_in": inches,
        "label": '0.75" (19 mm)',
        "swath_km2": 12.5,
        "unverifiable_km2": [float(km) for km in range(21)],
    }


def _pairs(classes=1, reports=None):
    return {
        "receipt": _receipt(),
        "radius_km_default": 5,
        "radius_km_max": 20,
        "edge_margin_m": 1000,
        "classes": [_pairs_class() for _ in range(classes)],
        "reports": [] if reports is None else reports,
    }


def _reports(features=None):
    return {"type": "FeatureCollection", "receipt": _receipt(), "features": features or []}


def _report_feature(**properties):
    base = {
        "id": 0,
        "time": "2024-05-28T21:15:00Z",
        "location": "HOUSTON",
        "county": "HARRIS",
        "state": "TX",
        "size_in": 2.5,
    }
    return {
        "type": "Feature",
        "properties": {**base, **properties},
        "geometry": {"type": "Point", "coordinates": [-95.4, 29.8]},
    }


def test_receipt_holds_the_inputs_the_band_the_run_time_and_the_package_version():
    assert _receipt() == {
        "storm_date": "2024-05-28",
        "sources": SOURCES,
        "confidence": swath.CONFIDENCE,
        "run_time": "2024-05-29T13:00:07Z",
        "package_version": version("hailprint"),
    }


def test_receipt_converts_a_local_zone_run_time_to_utc():
    local = datetime(2024, 5, 29, 8, 0, 7, tzinfo=timezone(timedelta(hours=-5)))

    assert publish.receipt(date(2024, 5, 28), SOURCES, local)["run_time"] == "2024-05-29T13:00:07Z"


def test_receipt_refuses_a_run_time_without_a_zone():
    with pytest.raises(ValueError, match="run_time"):
        publish.receipt(date(2024, 5, 28), SOURCES, datetime(2024, 5, 29, 13, 0, 7))


def test_the_shortest_legal_documents_validate():
    publish.validate({"type": "FeatureCollection", "receipt": _receipt(), "features": []}, "swath")
    publish.validate(_reports(), "reports")
    publish.validate(_pairs(), "pairs")
    publish.validate({"receipt": _receipt(), "classes": [], "zips": []}, "zip-counts")


def test_a_pairs_document_with_seven_classes_of_21_radii_and_a_null_distance_validates():
    report = {"id": 3, "size_in": 1.75, "edge_m": -250.5, "dist_m": [0.0, 12.5, None] + [None] * 4}

    doc = _pairs(classes=7, reports=[report])

    publish.validate(doc, "pairs")
    assert all(len(c["unverifiable_km2"]) == 21 for c in doc["classes"])


def test_a_reports_document_with_a_feature_validates():
    publish.validate(_reports([_report_feature()]), "reports")


def test_a_swath_document_with_a_multipolygon_feature_validates():
    ring = [[-95.0, 29.0], [-95.0, 29.1], [-94.9, 29.1], [-95.0, 29.0]]
    feature = {
        "type": "Feature",
        "properties": {
            "threshold_mm": 19.05,
            "threshold_in": 0.75,
            "label": '0.75" (19 mm)',
            "area_km2": 1.5,
        },
        "geometry": {"type": "MultiPolygon", "coordinates": [[ring]]},
    }

    publish.validate(
        {"type": "FeatureCollection", "receipt": _receipt(), "features": [feature]}, "swath"
    )


def test_a_zip_counts_document_validates_and_refuses_a_five_character_non_digit_zip():
    row = {"zip": "77002", "threshold_mm": 19.05, "parcel_count": 4}
    doc = {"receipt": _receipt(), "classes": [], "zips": [row]}
    publish.validate(doc, "zip-counts")

    doc["zips"] = [{**row, "zip": "77O02"}]

    with pytest.raises(ValueError, match=r"^zip-counts: \$\.zips\[0\]\.zip: "):
        publish.validate(doc, "zip-counts")


def test_validate_names_the_file_kind_and_the_path_of_a_missing_receipt():
    doc = _pairs()
    del doc["receipt"]

    with pytest.raises(ValueError) as err:
        publish.validate(doc, "pairs")

    assert str(err.value) == "pairs: $: 'receipt' is a required property"


def test_validate_names_the_file_kind_and_the_extra_property():
    doc = {**_pairs(), "extra": 1}

    with pytest.raises(ValueError) as err:
        publish.validate(doc, "pairs")

    assert str(err.value) == (
        "pairs: $: Additional properties are not allowed ('extra' was unexpected)"
    )


def test_validate_names_the_path_of_a_string_where_a_number_belongs():
    with pytest.raises(ValueError) as err:
        publish.validate(_reports([_report_feature(size_in="2.5")]), "reports")

    assert str(err.value) == (
        "reports: $.features[0].properties.size_in: '2.5' is not of type 'number'"
    )


def test_validate_refuses_a_radius_array_of_20_entries():
    doc = _pairs()
    doc["classes"][0]["unverifiable_km2"] = [0.0] * 20

    with pytest.raises(
        ValueError, match=r"^pairs: \$\.classes\[0\]\.unverifiable_km2: .*too short"
    ):
        publish.validate(doc, "pairs")


def test_validate_refuses_a_run_time_that_is_not_utc_to_the_second():
    doc = _reports()
    doc["receipt"]["run_time"] = "2024-05-29T13:00:07.987654Z"

    with pytest.raises(ValueError, match=r"^reports: \$\.receipt\.run_time: "):
        publish.validate(doc, "reports")


def test_validate_refuses_an_unknown_file_kind():
    with pytest.raises(ValueError, match="unknown file kind 'nope'"):
        publish.validate({}, "nope")


def test_dumps_writes_compact_json_that_keeps_non_ascii_text():
    text = publish.dumps({"a": [1, 2.5, None], "b": "café"}, "reports")

    assert text == '{"a":[1,2.5,null],"b":"café"}'


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_dumps_refuses_nan_and_infinity(value):
    with pytest.raises(ValueError, match="^pairs: "):
        publish.dumps({"edge_m": value}, "pairs")


@pytest.mark.parametrize("text", ["DAMAGE reported", "Hail Damage", "damages"])
def test_dumps_refuses_the_forbidden_word_in_any_case(text):
    with pytest.raises(ValueError) as err:
        publish.dumps({"location": text}, "reports")

    assert str(err.value).startswith("reports: ")
    assert "forbidden word" in str(err.value)


@pytest.mark.parametrize("field", OWNER_FIELDS)
def test_dumps_refuses_an_owner_field_name_as_key_or_value_in_any_case(field):
    with pytest.raises(ValueError, match=f"^zip-counts: owner field {field!r}"):
        publish.dumps({field.upper(): 1}, "zip-counts")
    with pytest.raises(ValueError, match=f"^zip-counts: owner field {field!r}"):
        publish.dumps({"zip": field.lower()}, "zip-counts")


@pytest.mark.parametrize("name", SCHEMAS)
def test_every_schema_installs_with_the_package_and_is_a_valid_draft_2020_12_schema(name):
    path = files("hailprint") / "schemas" / f"{name}.schema.json"

    schema = json.loads(path.read_text(encoding="utf-8"))

    Draft202012Validator.check_schema(schema)
    assert schema["$id"].endswith(f"/{name}.schema.json")
    assert schema["additionalProperties"] is False


FIXTURES = Path(__file__).parent / "fixtures"
SPC_HEADER = ["Time", "Size", "Location", "County", "State", "Lat", "Lon", "Comments"]


def _fixture_swaths():
    return gpd.read_parquet(FIXTURES / "score_swaths_2024-05-28.parquet")


def _signed_area(ring):
    """The shoelace sum of a closed ring: positive when the ring runs counter-clockwise."""
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False)) / 2


def _spc_csv(*rows):
    """SPC hail CSV text; each row is (size, location, lat, lon, comments)."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(SPC_HEADER)
    for size, location, lat, lon, comments in rows:
        writer.writerow(["1500", size, location, "Harris", "TX", lat, lon, comments])
    return out.getvalue()


def _swath_frame(geometry, label=None, crs="EPSG:4326"):
    return gpd.GeoDataFrame(
        {
            "storm_date": ["2024-05-28"],
            "threshold_mm": [19.05],
            "threshold_in": [0.75],
            "label": [label or swath.label(19.05)],
        },
        geometry=[geometry],
        crs=crs,
    )


def test_swath_doc_of_the_fixture_day_has_one_multipolygon_per_class_sorted_by_size():
    swaths = _fixture_swaths()

    doc = publish.swath_doc(swaths.iloc[::-1], _receipt())

    publish.validate(doc, "swath")
    props = [f["properties"] for f in doc["features"]]
    sizes = sorted(swaths["threshold_mm"])
    assert [p["threshold_mm"] for p in props] == sizes
    assert [p["threshold_in"] for p in props] == [mm / 25.4 for mm in sizes]
    assert [p["label"] for p in props] == [swath.label(mm) for mm in sizes]
    assert {f["geometry"]["type"] for f in doc["features"]} == {"MultiPolygon"}
    metric_km2 = swaths.sort_values("threshold_mm").to_crs("EPSG:32615").area / 1e6
    assert [p["area_km2"] for p in props] == pytest.approx(metric_km2.tolist(), rel=1e-3)
    assert doc["receipt"] == _receipt()


def test_swath_doc_exterior_rings_run_counter_clockwise_and_holes_clockwise():
    doc = publish.swath_doc(_fixture_swaths(), _receipt())

    rings = [
        (index, ring)
        for feature in doc["features"]
        for polygon in feature["geometry"]["coordinates"]
        for index, ring in enumerate(polygon)
    ]
    assert any(index > 0 for index, _ in rings), "the fixture day needs a hole to test"
    for index, ring in rings:
        assert (_signed_area(ring) > 0) == (index == 0)


def test_swath_doc_turns_a_clockwise_exterior_and_a_counter_clockwise_hole_around():
    outer = [(-95, 29), (-95, 29.4), (-94.6, 29.4), (-94.6, 29)]  # clockwise
    hole = [(-94.9, 29.1), (-94.7, 29.1), (-94.7, 29.3), (-94.9, 29.3)]  # counter-clockwise
    swaths = _swath_frame(shapely.MultiPolygon([shapely.Polygon(outer, [hole])]))

    doc = publish.swath_doc(swaths, _receipt())

    exterior, interior = doc["features"][0]["geometry"]["coordinates"][0]
    assert _signed_area(exterior) == pytest.approx(0.16)
    assert _signed_area(interior) == pytest.approx(-0.04)


def test_swath_doc_rounds_coordinates_to_six_decimals():
    polygon = shapely.Polygon(
        [(-95.1234567891, 29.1), (-95.1234567891, 29.2), (-95.0, 29.2), (-95.0, 29.1)]
    )

    doc = publish.swath_doc(_swath_frame(shapely.MultiPolygon([polygon])), _receipt())

    coordinates = [c for ring in doc["features"][0]["geometry"]["coordinates"][0] for c in ring]
    assert all(round(value, 6) == value for pair in coordinates for value in pair)
    assert [-95.123457, 29.1] in coordinates


def test_swath_doc_of_one_class_and_of_an_empty_frame_validate():
    one = _fixture_swaths().iloc[:1]
    empty = _fixture_swaths().iloc[:0]

    assert len(publish.swath_doc(one, _receipt())["features"]) == 1
    doc = publish.swath_doc(empty, _receipt())

    assert doc["features"] == []
    publish.validate(doc, "swath")


def test_swath_doc_is_the_same_for_every_row_order():
    swaths = _fixture_swaths()

    assert publish.swath_doc(swaths, _receipt()) == publish.swath_doc(swaths.iloc[::-1], _receipt())


def test_a_swath_label_with_the_forbidden_word_stops_the_serialiser():
    box = shapely.MultiPolygon([shapely.box(-95, 29, -94.9, 29.1)])
    doc = publish.swath_doc(_swath_frame(box, label="hail DAMAGE area"), _receipt())

    with pytest.raises(ValueError, match="^swath: forbidden word"):
        publish.dumps(doc, "swath")


def test_swath_doc_refuses_a_frame_without_a_crs():
    box = shapely.MultiPolygon([shapely.box(-95, 29, -94.9, 29.1)])

    with pytest.raises(ValueError, match="no CRS"):
        publish.swath_doc(_swath_frame(box, crs=None), _receipt())


def test_reports_doc_of_the_fixture_day_has_one_point_per_neighbourhood_report():
    text = (FIXTURES / "score_spc_240528.csv").read_text(encoding="utf-8")
    frame = reports.nearby_reports(date(2024, 5, 28), text)

    doc = publish.reports_doc(frame, _receipt())

    publish.validate(doc, "reports")
    assert 0 < len(doc["features"]) == len(frame)
    for index, (feature, row) in enumerate(zip(doc["features"], frame.itertuples(), strict=True)):
        assert feature["properties"] == {
            "id": index,
            "time": row.time,
            "location": row.location,
            "county": row.county,
            "state": row.state,
            "size_in": row.size_in,
        }
        assert feature["geometry"]["coordinates"] == [
            round(row.geometry.x, 6),
            round(row.geometry.y, 6),
        ]


def test_reports_doc_keeps_unusual_text_and_the_size_range_through_a_json_round_trip():
    place = 'Café "Big", 5 N'
    text = _spc_csv(
        (0, place, 29.76, -95.37, "(HGX)"),
        (800, "Katy", 29.79, -95.82, "(HGX)"),
    )
    frame = reports.nearby_reports(date(2024, 5, 28), text)

    doc = publish.reports_doc(frame, _receipt())

    sizes = [f["properties"]["size_in"] for f in doc["features"]]
    assert sizes == [0, 8]
    assert doc["features"][0]["properties"]["location"] == place
    assert json.loads(publish.dumps(doc, "reports")) == doc


def test_reports_doc_leaves_out_the_comments_column():
    text = _spc_csv((100, "Katy", 29.79, -95.82, "hail DAMAGE to roofs"))
    frame = reports.nearby_reports(date(2024, 5, 28), text)

    doc = publish.reports_doc(frame, _receipt())

    assert set(doc["features"][0]["properties"]) == {
        "id",
        "time",
        "location",
        "county",
        "state",
        "size_in",
    }
    assert "damage" not in publish.dumps(doc, "reports").lower()


def test_reports_doc_of_a_day_with_no_neighbourhood_report_has_no_feature():
    text = _spc_csv((100, "Far away", 40.0, -100.0, "(OUN)"))

    doc = publish.reports_doc(reports.nearby_reports(date(2024, 5, 28), text), _receipt())

    assert doc["features"] == []
    publish.validate(doc, "reports")


def test_reports_doc_gives_the_same_document_for_the_same_csv_twice():
    text = (FIXTURES / "score_spc_240528.csv").read_text(encoding="utf-8")

    first = publish.reports_doc(reports.nearby_reports(date(2024, 5, 28), text), _receipt())
    second = publish.reports_doc(reports.nearby_reports(date(2024, 5, 28), text), _receipt())

    assert first == second


def _rescore_doc(*reports_):
    """A pairs document of seven classes and the given (edge_m, size_in, dist) reports.

    Each report has the same distance to every size class.
    """
    classes = [
        {
            "threshold_mm": mm,
            "threshold_in": mm / 25.4,
            "label": swath.label(mm),
            "swath_km2": 10.0,
            "unverifiable_km2": [10.0 - km / 4 for km in range(21)],
        }
        for mm in swath.SIZE_CLASSES_MM
    ]
    rows = [
        {"id": i, "size_in": size_in, "edge_m": edge_m, "dist_m": [dist] * 7}
        for i, (edge_m, size_in, dist) in enumerate(reports_)
    ]
    return {
        "receipt": _receipt(),
        "radius_km_default": 5,
        "radius_km_max": 20,
        "edge_margin_m": 1000,
        "classes": classes,
        "reports": rows,
    }


def test_rescore_scores_a_report_only_when_its_edge_distance_beats_the_radius_plus_the_margin():
    doc = _rescore_doc((6000, 1.0, 0.0), (6001, 1.0, 0.0), (5999.5, 1.0, 0.0))

    table = publish.rescore(doc, 5)

    assert table["report_count"].eq(1).all()
    assert table["hits"].tolist() == [1, 1, 0, 0, 0, 0, 0]
    assert table["false_alarms"].tolist() == [0, 0, 1, 1, 1, 1, 1]


def test_rescore_counts_a_distance_equal_to_the_radius_as_a_forecast_and_a_null_as_none():
    doc = _rescore_doc((9000, 1.0, 5000.0), (9000, 1.0, 5000.5), (9000, 1.0, None))

    table = publish.rescore(doc, 5)

    assert table["report_count"].eq(3).all()
    assert table["hits"].tolist() == [1, 1, 0, 0, 0, 0, 0]
    assert table["misses"].tolist() == [2, 2, 0, 0, 0, 0, 0]
    assert table["false_alarms"].tolist() == [0, 0, 1, 1, 1, 1, 1]


def test_rescore_reads_the_areas_at_the_index_of_the_radius():
    table = publish.rescore(_rescore_doc((9000, 1.0, 0.0)), 8)

    assert table["swath_km2"].eq(10.0).all()
    assert table["unverifiable_km2"].eq(8.0).all()
    assert table["radius_km"].eq(8).all()
    assert table["storm_date"].eq("2024-05-28").all()


@pytest.mark.parametrize("radius_km", [-1, 21, float("nan"), float("inf"), 2.5, 0.1])
def test_rescore_refuses_a_radius_that_is_not_a_whole_number_from_0_to_20(radius_km):
    with pytest.raises(ValueError, match="radius_km"):
        publish.rescore(_rescore_doc((9000, 1.0, 0.0)), radius_km)


def test_rescore_accepts_the_whole_float_radius_at_both_ends():
    doc = _rescore_doc((22000, 1.0, 0.0))

    assert publish.rescore(doc, 0.0)["report_count"].eq(1).all()
    assert publish.rescore(doc, 20.0)["report_count"].eq(1).all()


def test_rescore_refuses_a_document_with_a_missing_size_class():
    doc = _rescore_doc((9000, 1.0, 0.0))
    del doc["classes"][2]

    with pytest.raises(ValueError, match="missing size classes"):
        publish.rescore(doc, 5)


def test_rescore_refuses_a_distance_list_of_the_wrong_length():
    doc = _rescore_doc((9000, 1.0, 0.0))
    doc["reports"][0]["dist_m"] = [0.0] * 6

    with pytest.raises(ValueError, match="dist_m"):
        publish.rescore(doc, 5)


def test_pairs_doc_refuses_classes_that_do_not_nest():
    low = shapely.MultiPolygon([shapely.box(-95.5, 29.5, -95.4, 29.6)])
    high = shapely.MultiPolygon([shapely.box(-95.2, 29.5, -95.1, 29.6)])
    frame = gpd.GeoDataFrame(
        {
            "storm_date": ["2024-05-28"] * 2,
            "threshold_mm": [19.05, 25.4],
            "threshold_in": [0.75, 1.0],
            "label": [swath.label(19.05), swath.label(25.4)],
        },
        geometry=[low, high],
        crs="EPSG:4326",
    )
    nearby = reports.nearby_reports(date(2024, 5, 28), _spc_csv((100, "Katy", 29.79, -95.82, "")))

    with pytest.raises(ValueError, match="not inside the next lower class"):
        publish.pairs_doc(frame, nearby, _receipt())
