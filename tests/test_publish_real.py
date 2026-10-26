"""The pairs file and the re-scorer against the scorer, on two real storm dates.

The oracle is `score.score_day` for every whole radius from 0 to 20 km and the golden counts
of the real run at 5 km.
"""

import json
from datetime import UTC, date, datetime
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest

from hailprint import publish, reports, score, swath

FIXTURES = Path(__file__).parent / "fixtures"
GOLDEN = json.loads((FIXTURES / "score_golden.json").read_text(encoding="utf-8"))
DAYS = [date(2024, 5, 28), date(2023, 6, 23)]
RECEIPT = publish.receipt(
    date(2024, 5, 28),
    [{"source": "noaa-mrms-pds", "product": "MESH_Max_1440min_00.50", "file": "x.parquet"}],
    datetime(2024, 5, 29, 13, 0, 7, tzinfo=UTC),
)


def _inputs(storm_date):
    swaths = gpd.read_parquet(FIXTURES / f"score_swaths_{storm_date}.parquet")
    text = (FIXTURES / f"score_spc_{storm_date:%y%m%d}.csv").read_text(encoding="utf-8")
    return swaths, reports.nearby_reports(storm_date, text)


def _doc(storm_date, frame=None):
    swaths, nearby = _inputs(storm_date)
    rcpt = publish.receipt(storm_date, RECEIPT["sources"], datetime(2024, 5, 29, tzinfo=UTC))
    doc = publish.pairs_doc(swaths, nearby if frame is None else frame, rcpt)
    return json.loads(publish.dumps(doc, "pairs"))  # the file as the browser reads it


@pytest.mark.parametrize("storm_date", DAYS, ids=str)
def test_rescore_equals_score_day_for_every_whole_radius_from_0_to_20(storm_date):
    swaths, nearby = _inputs(storm_date)
    doc = _doc(storm_date)

    for radius_km in range(21):
        expected = score.score_day(swaths, nearby, storm_date, radius_km).table

        got = publish.rescore(doc, radius_km)

        pd.testing.assert_frame_equal(got, expected, check_exact=False, rtol=0, atol=1e-12)


@pytest.mark.parametrize("storm_date", DAYS, ids=str)
def test_rescore_at_5_km_matches_the_golden_counts(storm_date):
    doc = _doc(storm_date)
    golden = GOLDEN[str(storm_date)]

    table = publish.rescore(doc, golden["radius_km"])

    counts = {
        f"{row.threshold_mm:g}": [row.hits, row.misses, row.false_alarms, row.correct_negatives]
        for row in table.itertuples()
    }
    assert counts == golden["counts"]
    assert table["report_count"].eq(golden["report_count"]).all()
    assert len(doc["reports"]) - golden["report_count"] == golden["excluded"]


@pytest.mark.parametrize("storm_date", DAYS, ids=str)
def test_rescore_is_the_same_for_reversed_report_rows(storm_date):
    _, nearby = _inputs(storm_date)
    forward, backward = _doc(storm_date), _doc(storm_date, nearby.iloc[::-1])

    for radius_km in (0, 5, 20):
        pd.testing.assert_frame_equal(
            publish.rescore(forward, radius_km), publish.rescore(backward, radius_km)
        )


def test_pairs_doc_states_the_default_the_maximum_and_the_margin():
    doc = _doc(DAYS[0])

    assert (doc["radius_km_default"], doc["radius_km_max"], doc["edge_margin_m"]) == (5, 20, 1000)
    publish.validate(doc, "pairs")


def test_pairs_doc_holds_seven_classes_and_gives_an_absent_class_null_distances_and_zero_areas():
    doc = _doc(DAYS[0])

    assert [c["threshold_mm"] for c in doc["classes"]] == list(swath.SIZE_CLASSES_MM)
    absent = doc["classes"][-1]
    assert absent["swath_km2"] == 0
    assert absent["unverifiable_km2"] == [0.0] * 21
    assert all(r["dist_m"][-1] is None for r in doc["reports"])
    assert all(len(r["dist_m"]) == 7 for r in doc["reports"])


def test_pairs_doc_unverifiable_area_never_grows_with_the_radius_and_stays_inside_the_swath():
    doc = _doc(DAYS[0])

    for cls in doc["classes"]:
        by_km = cls["unverifiable_km2"]
        assert by_km == sorted(by_km, reverse=True)
        assert by_km[0] <= cls["swath_km2"]
    assert any(c["swath_km2"] > 0 for c in doc["classes"])


def test_pairs_doc_ids_follow_the_row_order_of_the_reports_file():
    _, nearby = _inputs(DAYS[0])
    doc = _doc(DAYS[0])
    points = publish.reports_doc(nearby, RECEIPT)["features"]

    assert [r["id"] for r in doc["reports"]] == [f["properties"]["id"] for f in points]
    assert [r["size_in"] for r in doc["reports"]] == [f["properties"]["size_in"] for f in points]


def test_pairs_doc_of_a_day_with_no_report_rescoring_to_zero_counts():
    _, nearby = _inputs(DAYS[0])
    doc = _doc(DAYS[0], nearby.iloc[:0])

    table = publish.rescore(doc, 5)

    assert doc["reports"] == []
    assert table["report_count"].eq(0).all()
    assert table[score.COUNT_COLUMNS].eq(0).all().all()
    assert table["pod"].isna().all()
