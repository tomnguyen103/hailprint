"""Documents, schemas, receipt, and safe serialisation of the published files."""

import csv
import io
import json
from datetime import UTC, date, datetime, timedelta, timezone
from importlib.metadata import version
from importlib.resources import files
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
import shapely
from jsonschema import Draft202012Validator

from hailprint import files as files_module
from hailprint import parcels, publish, reports, swath
from hailprint.parcels import OWNER_FIELDS

RUN_TIME = datetime(2024, 5, 29, 13, 0, 7, 987654, tzinfo=UTC)
SOURCES = [
    {
        "source": "noaa-mrms-pds",
        "product": "MESH_Max_1440min_00.50",
        "file": "swaths-2024-05-28.parquet",
    }
]
SCHEMAS = ["receipt", "swath", "reports", "pairs", "zip-counts", "storms", "pipeline"]
IMPACT_KEYS = ("power", "internet", "warnings")


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
    assert [p["threshold_in"] for p in props] == [round(mm / 25.4, 2) for mm in sizes]
    assert [p["label"] for p in props] == [swath.label(mm) for mm in sizes]
    assert {f["geometry"]["type"] for f in doc["features"]} == {"MultiPolygon"}
    metric_km2 = swaths.sort_values("threshold_mm").to_crs("EPSG:32615").area / 1e6
    assert [p["area_km2"] for p in props] == pytest.approx(metric_km2.tolist(), rel=1e-3)
    assert doc["receipt"] == _receipt()


def test_every_builder_writes_the_size_class_in_inches_without_float_noise():
    swaths = _fixture_swaths()
    rcpt = _receipt()
    frame = gpd.GeoDataFrame(
        {"size_in": [1.0]}, geometry=gpd.points_from_xy([-95.4], [29.8]), crs="EPSG:4326"
    )

    inches = {
        "swath": [
            f["properties"]["threshold_in"] for f in publish.swath_doc(swaths, rcpt)["features"]
        ],
        "pairs": [c["threshold_in"] for c in publish.pairs_doc(swaths, frame, rcpt)["classes"]],
        "zips": [
            c["threshold_in"]
            for c in publish.zip_doc(_zip_frame(("77002", 19.05, 1)), rcpt)["classes"]
        ],
    }

    assert 19.05 / 25.4 != 0.75  # the noise this test guards against
    # the fixture day has no 2.5 in class
    assert inches["swath"] == [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
    assert inches["pairs"] == [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]
    assert inches["zips"] == [0.75]


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


def _zip_frame(*rows):
    return pd.DataFrame(
        [
            {
                "storm_date": "2024-05-28",
                "zip": zip_code,
                "threshold_mm": mm,
                "threshold_in": mm / 25.4,
                "label": swath.label(mm),
                "parcel_count": count,
            }
            for zip_code, mm, count in rows
        ],
        columns=parcels.ZIP_COLUMNS,
    )


def test_zip_doc_sums_the_rows_of_a_class_and_lists_the_zip_rows_by_class_then_zip():
    frame = _zip_frame(
        ("77003", 25.4, 2), ("77002", 19.05, 4), ("77003", 19.05, 6), ("77002", 25.4, 3)
    )

    doc = publish.zip_doc(frame, _receipt())

    publish.validate(doc, "zip-counts")
    assert [(c["threshold_mm"], c["parcel_count"]) for c in doc["classes"]] == [
        (19.05, 10),
        (25.4, 5),
    ]
    assert doc["classes"][0]["label"] == swath.label(19.05)
    assert [(z["threshold_mm"], z["zip"], z["parcel_count"]) for z in doc["zips"]] == [
        (19.05, "77002", 4),
        (19.05, "77003", 6),
        (25.4, "77002", 3),
        (25.4, "77003", 2),
    ]


def test_zip_doc_keeps_the_unknown_zip_and_gives_an_empty_frame_empty_lists():
    unknown = publish.zip_doc(_zip_frame((parcels.UNKNOWN_ZIP, 19.05, 1)), _receipt())
    empty = publish.zip_doc(_zip_frame(), _receipt())

    publish.validate(unknown, "zip-counts")
    publish.validate(empty, "zip-counts")
    assert unknown["zips"][0]["zip"] == "unknown"
    assert (empty["classes"], empty["zips"]) == ([], [])


def test_zip_doc_carries_counts_only_even_when_the_frame_has_more_columns():
    frame = _zip_frame(("77002", 19.05, 4)).assign(hcad_num="0010010010010")

    text = publish.dumps(publish.zip_doc(frame, _receipt()), "zip-counts")

    assert "hcad_num" not in text
    assert "0010010010010" not in text
    assert set(json.loads(text)["zips"][0]) == {"zip", "threshold_mm", "parcel_count"}


def _table_row(mm=19.05):
    return {
        "threshold_mm": mm,
        "threshold_in": mm / 25.4,
        "label": swath.label(mm),
        "hits": 3,
        "misses": 1,
        "false_alarms": 2,
        "correct_negatives": 4,
        "pod": 0.75,
        "far": None,
        "csi": 0.5,
        "hss": None,
        "swath_km2": 12.5,
        "unverifiable_km2": 3.25,
    }


def _entry(storm_date, **changes):
    entry = {
        "storm_date": storm_date,
        "report_count": 10,
        "max_size_in": 4.0,
        "report_source": "wcm",
        "max_mesh_mm": 73.2,
        "scored_reports": 9,
        "excluded_reports": 1,
        "table": [_table_row(mm) for mm in swath.SIZE_CLASSES_MM],
        "parcel_total": None,
        "files": {
            "swath": f"storms/{storm_date}/swath.geojson",
            "reports": f"storms/{storm_date}/reports.geojson",
            "pairs": f"storms/{storm_date}/pairs.json",
            "zip_counts": None,
            "power": None,
            "internet": None,
            "warnings": None,
        },
    }
    return entry | changes


def _old_entry(storm_date):
    """An index entry as the run before the impact keys wrote it."""
    entry = _entry(storm_date)
    return entry | {"files": {k: v for k, v in entry["files"].items() if k not in IMPACT_KEYS}}


def test_storms_doc_sorts_the_entries_newest_first_and_states_the_band_and_the_run_time():
    entries = [_entry("2023-06-23"), _entry("2024-05-28"), _entry("2024-04-01")]

    doc = publish.storms_doc(entries, RUN_TIME)

    publish.validate(doc, "storms")
    assert [e["storm_date"] for e in doc["storms"]] == ["2024-05-28", "2024-04-01", "2023-06-23"]
    assert doc["confidence"] == swath.CONFIDENCE
    assert doc["run_time"] == "2024-05-29T13:00:07Z"
    assert doc["package_version"] == version("hailprint")
    assert doc["radius_km_default"] == 5


def test_storms_doc_of_no_entry_validates():
    doc = publish.storms_doc([], RUN_TIME)

    publish.validate(doc, "storms")
    assert doc["storms"] == []


def test_a_storms_entry_with_null_report_facts_and_a_null_mesh_maximum_validates():
    entry = _entry(
        "2024-05-28", report_count=None, max_size_in=None, report_source=None, max_mesh_mm=None
    )

    publish.validate(publish.storms_doc([entry], RUN_TIME), "storms")


def test_the_storms_schema_refuses_a_table_of_six_rows_and_an_extra_key():
    short = _entry("2024-05-28")
    short["table"] = short["table"][:6]
    extra = _entry("2024-05-28", owner="x")

    with pytest.raises(ValueError, match=r"storms: \$\.storms\[0\]\.table"):
        publish.validate(publish.storms_doc([short], RUN_TIME), "storms")
    with pytest.raises(ValueError, match=r"storms: \$\.storms\[0\]"):
        publish.validate(publish.storms_doc([extra], RUN_TIME), "storms")


def test_storms_doc_with_the_forbidden_word_stops_the_serialiser():
    entry = _entry("2024-05-28", report_source="Damage")

    with pytest.raises(ValueError, match="forbidden word"):
        publish.dumps(publish.storms_doc([entry], RUN_TIME), "storms")


def _walk(node):
    """Every (key, value) pair of a JSON document, at any depth."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield key, value
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def test_the_schemas_pin_the_size_class_count_to_the_tuple():
    folder = files("hailprint") / "schemas"
    pins = [
        value
        for path in folder.iterdir()
        if path.name.endswith(".schema.json")
        for key, value in _walk(json.loads(path.read_text(encoding="utf-8")))
        if key in ("minItems", "maxItems")
    ]

    # swath:1, pairs:2, zip-counts:1, storms:2 pin the class count; the radius arrays pin 21
    assert pins.count(len(swath.SIZE_CLASSES_MM)) == 6


def test_swath_source_reads_the_source_entry_and_the_mesh_maximum_from_the_metadata(tmp_path):
    path = files_module.write_atomic(
        _fixture_swaths(), tmp_path / "swath-2024-05-28.parquet", metadata={"max_mesh_mm": "31.5"}
    )

    entry, max_mesh_mm = publish.swath_source(path)

    assert entry == {
        "source": files_module.SOURCE,
        "product": files_module.PRODUCT,
        "file": "swath-2024-05-28.parquet",
    }
    assert max_mesh_mm == 31.5


def test_swath_source_gives_none_without_a_mesh_maximum_and_refuses_bare_metadata(tmp_path):
    plain = files_module.write_atomic(_fixture_swaths(), tmp_path / "plain.parquet")
    bare = tmp_path / "bare.parquet"
    _fixture_swaths().to_parquet(bare)

    assert publish.swath_source(plain)[1] is None
    with pytest.raises(ValueError, match="bare.parquet: the metadata lacks source, product, conf"):
        publish.swath_source(bare)


def _build_day(zips=None, facts=None):
    nearby = reports.nearby_reports(
        date(2024, 5, 28),
        _spc_csv(("100", "Spring", 30.08, -95.42, ""), ("175", "Katy", 29.79, -95.82, "")),
    )
    return publish.build_day(
        date(2024, 5, 28),
        _fixture_swaths(),
        nearby,
        mrms=SOURCES[0],
        max_mesh_mm=73.2,
        spc=publish.spc_source(date(2024, 5, 28)),
        zips=zips,
        hcad=None if zips is None else publish.hcad_source("zip-counts-2024-05-28.parquet"),
        facts=facts,
        run_time=RUN_TIME,
    )


def test_build_day_without_zips_gives_three_texts_and_an_entry_without_parcel_counts():
    texts, entry = _build_day()

    assert sorted(texts) == ["pairs.json", "reports.geojson", "swath.geojson"]
    assert all(json.loads(text) for text in texts.values())
    assert entry["parcel_total"] is None
    assert entry["files"]["zip_counts"] is None
    assert entry["scored_reports"] == 2


def test_build_day_with_zips_gives_four_texts_and_the_parcel_total_of_the_frame():
    zips = _zip_frame(("77001", 19.05, 3), ("77002", 19.05, 4))

    texts, entry = _build_day(zips=zips)

    assert sorted(texts) == ["pairs.json", "reports.geojson", "swath.geojson", "zip-counts.json"]
    assert all(json.loads(text) for text in texts.values())
    assert entry["parcel_total"] == int(zips["parcel_count"].sum()) == 7
    assert entry["files"]["zip_counts"].endswith("zip-counts.json")


def test_build_day_refuses_an_entry_that_breaks_the_storms_schema():
    facts = {"report_count": -1, "max_size_in": 1.0, "report_source": "wcm"}

    with pytest.raises(ValueError, match="storms"):
        _build_day(facts=facts)


def test_merge_entries_keeps_an_old_entry_with_files_drops_one_without_and_replaces_by_date(
    tmp_path,
):
    for storm_date in ("2023-06-23", "2024-05-28"):
        folder = tmp_path / "storms" / storm_date
        folder.mkdir(parents=True)
        for name in ("swath.geojson", "reports.geojson", "pairs.json"):
            (folder / name).write_text("{}", encoding="utf-8")
    old = [_entry("2023-06-23"), _entry("2024-04-01"), _entry("2024-05-28", report_count=1)]
    new = [_entry("2024-05-28", report_count=2)]

    merged = publish.merge_entries(old, new, tmp_path)

    assert {e["storm_date"]: e["report_count"] for e in merged} == {
        "2023-06-23": 10,
        "2024-05-28": 2,
    }
    assert [e["storm_date"] for e in publish.storms_doc(merged, RUN_TIME)["storms"]] == [
        "2024-05-28",
        "2023-06-23",
    ]


def _published_day(root, storm_date, *, zips):
    """The three required files of a storm date under `root`, plus the ZIP count file on request."""
    folder = root / "storms" / storm_date
    folder.mkdir(parents=True)
    for name in ("swath.geojson", "reports.geojson"):
        (folder / name).write_text("{}", encoding="utf-8")
    (folder / "pairs.json").write_text(publish.dumps(_pairs(), "pairs"), encoding="utf-8")
    if zips:
        zip_doc = publish.zip_doc(_zip_frame(("77002", 19.05, 4)), _receipt())
        (folder / "zip-counts.json").write_text(
            publish.dumps(zip_doc, "zip-counts"), encoding="utf-8"
        )
    return _entry(
        storm_date,
        parcel_total=4 if zips else None,
        files=_entry(storm_date)["files"]
        | {"zip_counts": f"storms/{storm_date}/zip-counts.json" if zips else None},
    )


def test_merge_entries_clears_the_zip_fields_of_an_entry_whose_zip_file_is_gone(tmp_path):
    entry = _published_day(tmp_path, "2024-05-28", zips=True)
    (tmp_path / "storms" / "2024-05-28" / "zip-counts.json").unlink()

    [merged] = publish.merge_entries([entry], [], tmp_path)

    assert merged["files"]["zip_counts"] is None
    assert merged["parcel_total"] is None
    assert entry["parcel_total"] == 4


def test_an_old_index_without_the_impact_keys_reads_and_merge_entries_fills_null(tmp_path):
    entry = _published_day(tmp_path, "2024-05-28", zips=True)
    old = _old_entry("2024-05-28") | {"parcel_total": 4}
    old["files"]["zip_counts"] = entry["files"]["zip_counts"]
    index = tmp_path / "storms.json"
    index.write_text(json.dumps(publish.storms_doc([old], RUN_TIME)), encoding="utf-8")

    loaded = publish.read_published(index, "storms")["storms"]
    assert not set(IMPACT_KEYS) & set(loaded[0]["files"])
    [merged] = publish.merge_entries(loaded, [], tmp_path)

    assert {k: merged["files"][k] for k in IMPACT_KEYS} == dict.fromkeys(IMPACT_KEYS)
    assert merged["files"]["zip_counts"] == entry["files"]["zip_counts"]
    assert merged["parcel_total"] == 4
    publish.validate(publish.storms_doc([merged], RUN_TIME), "storms")


def test_merge_entries_fills_the_impact_keys_of_a_new_entry_and_keeps_a_set_key(tmp_path):
    kept = _published_day(tmp_path, "2024-05-28", zips=False)
    kept["files"]["warnings"] = "storms/2024-05-28/warnings.geojson"
    fresh = _published_day(tmp_path, "2023-06-23", zips=False)
    fresh["files"] = {k: v for k, v in fresh["files"].items() if k not in IMPACT_KEYS}

    merged = {e["storm_date"]: e for e in publish.merge_entries([kept], [fresh], tmp_path)}

    assert merged["2024-05-28"]["files"]["warnings"] == "storms/2024-05-28/warnings.geojson"
    assert merged["2024-05-28"]["files"]["power"] is None
    assert [merged["2023-06-23"]["files"][k] for k in IMPACT_KEYS] == [None, None, None]


def test_build_day_writes_the_three_impact_keys_as_null():
    _, entry = _build_day()

    assert {k: entry["files"][k] for k in IMPACT_KEYS} == dict.fromkeys(IMPACT_KEYS)


def test_the_storms_schema_accepts_an_impact_path_and_refuses_an_extra_or_misplaced_key():
    ok = _entry("2024-05-28")
    ok["files"] |= {
        "power": "storms/2024-05-28/power.json",
        "internet": "storms/2024-05-28/internet.json",
        "warnings": "storms/2024-05-28/warnings.geojson",
    }
    publish.validate(publish.storms_doc([ok], RUN_TIME), "storms")

    extra = _entry("2024-05-28")
    extra["files"]["outages"] = None
    wrong_type = _entry("2024-05-28")
    wrong_type["files"]["warnings"] = "storms/2024-05-28/warnings.json"
    outside = _entry("2024-05-28")
    outside["files"]["power"] = "../power.json"
    for bad in (extra, wrong_type, outside):
        with pytest.raises(ValueError, match=r"storms: \$\.storms\[0\]\.files"):
            publish.validate(publish.storms_doc([bad], RUN_TIME), "storms")


def test_index_receipts_lists_the_impact_files_and_skips_a_null_key(tmp_path):
    assert publish.RECEIPT_FILES[2:] == (
        ("power", "power"),
        ("internet", "internet"),
        ("warnings", "warnings"),
    )
    entry = _published_day(tmp_path, "2024-05-28", zips=False)

    assert publish.index_receipts([entry], tmp_path) == [_receipt()]


def test_index_receipts_reads_the_pairs_and_the_zip_count_receipt_of_every_entry(tmp_path):
    entries = [
        _published_day(tmp_path, "2024-05-28", zips=True),
        _published_day(tmp_path, "2023-06-23", zips=False),
    ]

    receipts = publish.index_receipts(entries, tmp_path)

    assert len(receipts) == 3
    assert all(r == _receipt() for r in receipts)


def test_read_published_names_a_file_that_is_not_json_and_one_that_breaks_its_schema(tmp_path):
    broken = tmp_path / "pairs.json"
    broken.write_text("nope", encoding="utf-8")
    with pytest.raises(ValueError, match="not valid JSON"):
        publish.read_published(broken, "pairs")

    broken.write_text("{}", encoding="utf-8")
    with pytest.raises(ValueError, match=r"pairs\.json: pairs: "):
        publish.read_published(broken, "pairs")


def test_the_storms_schema_refuses_a_file_path_outside_the_storm_date_folder():
    entry = _entry("2024-05-28")
    entry["files"]["pairs"] = "../pairs.json"

    with pytest.raises(ValueError, match=r"storms: \$\.storms\[0\]\.files"):
        publish.validate(publish.storms_doc([entry], RUN_TIME), "storms")


def _run(run_time="2024-05-29T13:00:07Z", dates=("2024-05-28",), file_count=4):
    return {
        "run_time": run_time,
        "package_version": version("hailprint"),
        "storm_dates": list(dates),
        "file_count": file_count,
    }


def _archive_frame():
    return pd.DataFrame(
        {
            "storm_date": [date(2023, 6, 23), date(2024, 4, 1), date(2024, 5, 28)],
            "file_count": [720, 719, 720],
            "bytes": [3, 2, 3],
            "has_12z": [True, False, True],
        }
    )


def _pipeline_doc(**changes):
    sources = publish.sources_of([_receipt()])
    doc = publish.pipeline_doc(
        [_run()], publish.archive_summary(_archive_frame()), sources, RUN_TIME
    )
    return doc | changes


def test_archive_summary_counts_days_per_year_and_days_without_12z():
    summary = publish.archive_summary(_archive_frame())

    assert summary == {
        "days": 3,
        "first_storm_date": "2023-06-23",
        "last_storm_date": "2024-05-28",
        "days_without_12z": 1,
        "years": [
            {"year": 2023, "days": 1, "days_with_12z": 1},
            {"year": 2024, "days": 2, "days_with_12z": 1},
        ],
    }


def test_archive_summary_of_an_empty_index_is_none():
    assert publish.archive_summary(_archive_frame().iloc[0:0]) is None


def test_sources_of_groups_by_source_and_product_with_sorted_dates():
    first = publish.receipt(date(2024, 5, 28), SOURCES, RUN_TIME)
    second = publish.receipt(
        date(2023, 6, 23),
        [SOURCES[0], publish.hcad_source("zip-counts-2023-06-23.parquet")],
        RUN_TIME,
    )

    rows = publish.sources_of([first, second])

    assert rows == [
        {"source": "hcad", "product": publish.HCAD_PRODUCT, "storm_dates": ["2023-06-23"]},
        {
            "source": "noaa-mrms-pds",
            "product": "MESH_Max_1440min_00.50",
            "storm_dates": ["2023-06-23", "2024-05-28"],
        },
    ]


def test_the_site_service_rules_match_the_source_names():
    assert "hail" in publish.SPC_PRODUCT
    assert publish.hcad_source("zip-counts-2024-05-28.parquet")["source"] == "hcad"


def test_the_run_cap_of_the_pipeline_schema_matches_max_runs():
    schema_path = files("hailprint") / "schemas" / "pipeline.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    assert schema["properties"]["runs"]["maxItems"] == publish.MAX_RUNS


def test_merge_runs_replaces_the_same_run_time_sorts_newest_first_and_caps_at_fifty():
    old = [_run(f"2024-01-{day:02d}T12:00:00Z", file_count=1) for day in range(1, 31)]
    old += [_run(f"2024-02-{day:02d}T12:00:00Z", file_count=1) for day in range(1, 22)]
    assert len(old) == 51

    replaced = publish.merge_runs(old, _run("2024-02-21T12:00:00Z", file_count=9))
    newer = publish.merge_runs(old, _run("2024-03-01T12:00:00Z"))

    assert len(replaced) == 50
    assert replaced[0]["run_time"] == "2024-02-21T12:00:00Z"
    assert replaced[0]["file_count"] == 9
    assert [r["run_time"] for r in replaced].count("2024-02-21T12:00:00Z") == 1
    assert replaced[-1]["run_time"] == "2024-01-02T12:00:00Z"
    assert newer[0]["run_time"] == "2024-03-01T12:00:00Z"
    assert len(newer) == 50
    assert publish.merge_runs([], _run()) == [_run()]


def test_pipeline_doc_validates_and_carries_the_confidence_band():
    doc = _pipeline_doc()

    publish.validate(doc, "pipeline")

    assert doc["confidence"] == swath.CONFIDENCE
    assert doc["run_time"] == "2024-05-29T13:00:07Z"
    assert doc["runs"][0] == _run() == publish.run_entry(["2024-05-28"], 4, RUN_TIME)
    assert doc["archive"]["days"] == 3
    assert doc["sources"][0]["storm_dates"] == ["2024-05-28"]
    assert publish.dumps(doc, "pipeline")


def test_pipeline_doc_with_archive_none_validates():
    publish.validate(_pipeline_doc(archive=None), "pipeline")


def test_pipeline_schema_refuses_a_directory_a_missing_archive_and_a_bad_date():
    with_dir = _pipeline_doc()
    with_dir["sources"][0]["product"] = "storms/MESH_Max_1440min_00.50"
    with pytest.raises(ValueError, match=r"pipeline: \$\.sources\[0\]\.product"):
        publish.validate(with_dir, "pipeline")

    without_archive = _pipeline_doc()
    del without_archive["archive"]
    with pytest.raises(ValueError, match="pipeline: .*archive"):
        publish.validate(without_archive, "pipeline")

    bad_date = _pipeline_doc()
    bad_date["runs"][0]["storm_dates"] = ["28-05-2024"]
    with pytest.raises(ValueError, match=r"pipeline: \$\.runs\[0\]\.storm_dates\[0\]"):
        publish.validate(bad_date, "pipeline")


def test_pipeline_dumps_refuses_the_forbidden_word():
    doc = _pipeline_doc(confidence=f"hail {files_module.FORBIDDEN_WORD} band")

    with pytest.raises(ValueError, match=files_module.FORBIDDEN_WORD):
        publish.dumps(doc, "pipeline")
