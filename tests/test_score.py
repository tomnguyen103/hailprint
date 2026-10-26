import math

import pandas as pd
import pytest

from hailprint import swath
from hailprint.score import contingency, dist_column, pool, skill


def test_skill_hand_computed_table():
    got = skill(4, 1, 0, 1)

    assert got["pod"] == pytest.approx(0.8)
    assert got["far"] == 0.0
    assert got["csi"] == pytest.approx(0.8)
    assert got["hss"] == pytest.approx(8 / 14)


def test_skill_all_zero_counts_give_nan():
    assert all(math.isnan(v) for v in skill(0, 0, 0, 0).values())


def test_skill_misses_only_gives_zero_pod_csi_hss_and_nan_far():
    got = skill(0, 2, 0, 0)

    assert got["pod"] == 0.0
    assert math.isnan(got["far"])
    assert got["csi"] == 0.0
    assert got["hss"] == 0.0


def test_skill_rejects_a_negative_count():
    with pytest.raises(ValueError, match="negative"):
        skill(-1, 0, 0, 0)


def test_skill_is_the_same_on_a_second_call():
    assert skill(7, 3, 2, 11) == skill(7, 3, 2, 11)


def test_skill_perfect_and_zero_skill_tables():
    assert skill(3, 0, 0, 5) == {"pod": 1.0, "far": 0.0, "csi": 1.0, "hss": 1.0}
    assert skill(2, 3, 4, 6)["hss"] == 0.0  # a*d = b*c = 12


def test_label_is_the_text_build_swaths_writes():
    assert swath.label(19.05) == "radar-estimated hail size >= 0.75 in"
    assert swath.label(63.5) == "radar-estimated hail size >= 2.50 in"
    assert swath.FORBIDDEN_WORD not in swath.label(25.4)


def _pairs(sizes, dists):
    """One row per report; dists maps a class in mm to its distance column in metres."""
    frame = pd.DataFrame({"size_in": sizes})
    for mm in swath.SIZE_CLASSES_MM:
        frame[dist_column(mm)] = dists.get(mm, [math.nan] * len(sizes))
    return frame


def test_contingency_compares_size_in_whole_hundredths_of_an_inch():
    # 0.75 in is an event for the 19.05 mm class (0.75 in); 0.74 in is not
    pairs = _pairs([0.75, 0.74], {19.05: [0.0, 0.0]})

    row = contingency(pairs, 5.0).iloc[0]

    assert (row["hits"], row["false_alarms"], row["misses"]) == (1, 1, 0)


def test_contingency_treats_a_distance_equal_to_the_radius_as_a_forecast():
    pairs = _pairs([1.0, 1.0], {25.4: [5000.0, 5000.1]})

    row = contingency(pairs, 5.0).iloc[1]

    assert (row["hits"], row["misses"]) == (1, 1)


def test_contingency_gives_seven_rows_and_counts_that_sum_to_the_reports():
    pairs = _pairs([0.5, 1.25, 2.0], {19.05: [0.0, 100.0, 9000.0], 31.75: [9000.0, 0.0, 0.0]})

    table = contingency(pairs, 5.0)

    assert table["threshold_mm"].tolist() == list(swath.SIZE_CLASSES_MM)
    counts = table[["hits", "misses", "false_alarms", "correct_negatives"]].sum(axis=1)
    assert counts.tolist() == [3] * 7
    assert table["report_count"].tolist() == [3] * 7


def _table(radius_km=5.0, **cells):
    """Seven-row table: zero counts except the 1.25 in row set from cells."""
    rows = []
    for mm in swath.SIZE_CLASSES_MM:
        row = {
            "storm_date": "2024-05-28",
            "threshold_mm": mm,
            "threshold_in": mm / 25.4,
            "label": swath.label(mm),
            "radius_km": radius_km,
            "report_count": 0,
            "hits": 0,
            "misses": 0,
            "false_alarms": 0,
            "correct_negatives": 0,
            "swath_km2": 0.0,
            "unverifiable_km2": 0.0,
        }
        if mm == 31.75:
            row.update(cells)
        rows.append(row)
    return pd.DataFrame(rows)


def test_pool_sums_counts_and_areas_then_recomputes_the_metrics():
    first = _table(hits=3, misses=1, false_alarms=1, correct_negatives=1, swath_km2=10.0)
    second = _table(hits=1, misses=1, false_alarms=2, correct_negatives=2, unverifiable_km2=4.0)

    pooled = pool([first, second]).set_index("threshold_mm").loc[31.75]

    assert (pooled["hits"], pooled["misses"]) == (4, 2)
    assert (pooled["false_alarms"], pooled["correct_negatives"]) == (3, 3)
    assert pooled["swath_km2"] == 10.0
    assert pooled["unverifiable_km2"] == 4.0
    assert pooled["pod"] == pytest.approx(4 / 6)
    assert pooled["hss"] == pytest.approx(skill(4, 2, 3, 3)["hss"])


def test_pool_refuses_tables_with_mixed_radius():
    with pytest.raises(ValueError, match="radius_km"):
        pool([_table(5.0), _table(10.0)])


def test_pool_refuses_no_tables():
    with pytest.raises(ValueError, match="no tables"):
        pool([])
