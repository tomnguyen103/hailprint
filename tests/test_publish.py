"""Documents, schemas, receipt, and safe serialisation of the published files."""

import json
from datetime import UTC, date, datetime, timedelta, timezone
from importlib.metadata import version
from importlib.resources import files

import pytest
from jsonschema import Draft202012Validator

from hailprint import publish, swath
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
