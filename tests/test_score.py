import math
import urllib.error
from datetime import date
from email.message import Message as EmailMessage

import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
import pytest
import shapely

import hailprint.__main__ as cli
from hailprint import candidates, county, reports, swath
from hailprint.__main__ import main
from hailprint.parcels import OWNER_FIELDS
from hailprint.score import (
    COUNT_COLUMNS,
    SCORE_COLUMNS,
    contingency,
    dist_column,
    in_domain,
    pool,
    score_day,
    skill,
)


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


# --- score_day: synthetic day on a metric frame near the Harris centre (EPSG:32615 metres) ---

METRIC = "EPSG:32615"
BX0, BY0, BSIDE = 265000, 3305000, 2000  # the 1.00 in swath B, a 2 km square
GAP_E, GAP_N, GAP_W, GAP_S = 3100, 3900, 3000, 5000  # B inside the 0.75 in swath A


def _box_a():
    return shapely.box(BX0 - GAP_W, BY0 - GAP_S, BX0 + BSIDE + GAP_E, BY0 + BSIDE + GAP_N)


def _box_b():
    return shapely.box(BX0, BY0, BX0 + BSIDE, BY0 + BSIDE)


def _swaths(geoms=None, thresholds=(19.05, 25.4), crs=METRIC):
    geoms = [_box_a(), _box_b()] if geoms is None else geoms
    return gpd.GeoDataFrame(
        {"threshold_mm": list(thresholds)},
        geometry=[shapely.MultiPolygon([g]) for g in geoms],
        crs=crs,
    )


def _empty_swaths():
    return gpd.GeoDataFrame({"threshold_mm": pd.Series([], dtype=float)}, geometry=[], crs=METRIC)


def _reports(sizes, points, crs=METRIC):
    return gpd.GeoDataFrame(
        {
            "time": ["1200"] * len(sizes),
            "location": [f"r{i + 1}" for i in range(len(sizes))],
            "county": ["Harris"] * len(sizes),
            "state": ["TX"] * len(sizes),
            "size_in": sizes,
        },
        geometry=[shapely.Point(p) for p in points],
        crs=crs,
    )


def _paper_reports():
    """r1..r6 of the spec table: size, distance to A, distance to B (km)."""
    a, b = _box_a(), _box_b()
    mid_y, mid_x = BY0 + BSIDE / 2, BX0 + BSIDE / 2
    points = [
        (mid_x, mid_y),  # r1 inside B: 0, 0
        (mid_x, BY0 - 3000),  # r2 inside A, 3 km south of B: 0, 3
        (a.bounds[2] + 4900, mid_y),  # r3 east: 4.9, 8
        (mid_x, a.bounds[3] + 5100),  # r4 north: 5.1, 9
        (a.bounds[0] - 12000, mid_y),  # r5 west: 12, 15
        (mid_x, a.bounds[1] - 1000),  # r6 south: 1, 6
    ]
    assert [round(shapely.Point(p).distance(a)) for p in points] == [0, 0, 4900, 5100, 12000, 1000]
    assert [round(shapely.Point(p).distance(b)) for p in points] == [
        0,
        3000,
        8000,
        9000,
        15000,
        6000,
    ]
    return _reports([1.00, 0.75, 1.75, 0.50, 1.25, 0.88], points)


def _counts(table):
    return table.set_index("threshold_mm")[COUNT_COLUMNS]


def test_score_day_paper_day_gives_the_hand_computed_tables():
    day = score_day(_swaths(), _paper_reports(), date(2024, 5, 28), 5)

    counts = _counts(day.table)
    assert day.excluded == 0
    assert counts.loc[19.05].tolist() == [4, 1, 0, 1]
    assert counts.loc[25.4].tolist() == [1, 2, 1, 2]
    assert counts.loc[31.75].tolist() == [0, 2, 0, 4]
    assert len(day.table) == 7


def test_score_day_table_and_pairs_columns():
    day = score_day(_swaths(), _paper_reports(), date(2024, 5, 28), 5)

    assert list(day.table.columns) == SCORE_COLUMNS
    assert day.table["storm_date"].eq("2024-05-28").all()
    assert day.table["radius_km"].eq(5).all()
    assert day.pairs.crs.to_epsg() == 4326
    assert list(day.pairs.columns) == [
        "time",
        "location",
        "county",
        "state",
        "size_in",
        *[dist_column(mm) for mm in swath.SIZE_CLASSES_MM],
        "geometry",
    ]
    assert day.pairs[dist_column(19.05)].round().tolist() == [0, 0, 4900, 5100, 12000, 1000]
    assert day.pairs[dist_column(63.5)].isna().all()


def test_score_day_reprojects_a_degree_frame_and_agrees_with_the_metric_frame():
    metric = score_day(_swaths(), _paper_reports(), date(2024, 5, 28), 5)
    degrees = score_day(
        _swaths().to_crs("EPSG:4326"),
        _paper_reports().to_crs("EPSG:4326"),
        date(2024, 5, 28),
        5,
    )

    assert _counts(degrees.table).equals(_counts(metric.table))


def test_score_day_a_distance_equal_to_the_radius_is_a_forecast():
    edge = shapely.Point(_box_b().bounds[2] + 5000, BY0 + 1000)
    reports = _reports([1.0], [edge.coords[0]])

    day = score_day(_swaths([_box_b()], (25.4,)), reports, date(2024, 5, 28), 5)

    assert _counts(day.table).loc[25.4].tolist() == [1, 0, 0, 0]


@pytest.mark.parametrize("radius", [-1, 20.001, math.nan, math.inf])
def test_score_day_rejects_a_bad_radius(radius):
    with pytest.raises(ValueError, match="radius_km"):
        score_day(_swaths(), _paper_reports(), date(2024, 5, 28), radius)


def test_score_day_rejects_classes_that_do_not_nest():
    apart = shapely.box(BX0 + 30000, BY0, BX0 + 31000, BY0 + 1000)

    with pytest.raises(ValueError, match="25.4"):
        score_day(_swaths([_box_a(), apart]), _paper_reports(), date(2024, 5, 28), 5)


def test_score_day_is_the_same_on_a_second_call_and_for_reordered_reports():
    reports = _paper_reports()
    first = score_day(_swaths(), reports, date(2024, 5, 28), 5)
    again = score_day(_swaths(), reports, date(2024, 5, 28), 5)
    shuffled = score_day(_swaths(), reports.iloc[::-1], date(2024, 5, 28), 5)

    pd.testing.assert_frame_equal(first.table, again.table)
    pd.testing.assert_frame_equal(first.table, shuffled.table)


def test_score_day_empty_swaths_make_every_event_a_miss():
    day = score_day(_empty_swaths(), _paper_reports(), date(2024, 5, 28), 5)

    counts = _counts(day.table)
    assert len(day.table) == 7
    assert counts.loc[19.05].tolist() == [0, 5, 0, 1]
    assert counts.loc[63.5].tolist() == [0, 0, 0, 6]
    assert day.table["swath_km2"].eq(0).all()
    assert day.table["unverifiable_km2"].eq(0).all()


def test_score_day_no_reports_gives_zero_counts_and_nan_metrics():
    day = score_day(_swaths(), _paper_reports().iloc[:0], date(2024, 5, 28), 5)

    assert len(day.table) == 7
    assert day.excluded == 0
    assert day.table[COUNT_COLUMNS].eq(0).all().all()
    assert day.table[["pod", "far", "csi", "hss"]].isna().all().all()
    assert len(day.pairs) == 0


def _lonlat_report(lon, lat, size=1.0):
    return _reports([size], [(lon, lat)], crs="EPSG:4326")


def test_score_day_excludes_a_report_closer_to_the_crop_edge_than_the_radius_plus_a_cell():
    min_lon, min_lat, max_lon, max_lat = county.bbox()
    mid_lat = (min_lat + max_lat) / 2
    # 0.02 degree is about 2 km: inside the crop but within 5 km + 1 cell of its edge
    near_edge = _lonlat_report(min_lon + 0.02, mid_lat)
    centre = _lonlat_report((min_lon + max_lon) / 2, mid_lat)
    reports = pd.concat([near_edge, centre], ignore_index=True)

    day = score_day(_swaths(), reports, date(2024, 5, 28), 5)

    assert day.excluded == 1
    assert len(day.pairs) == 1
    assert day.table["report_count"].eq(1).all()


def test_in_domain_shrinks_with_the_radius():
    min_lon, min_lat, max_lon, max_lat = county.bbox()
    mid_lat = (min_lat + max_lat) / 2
    # 0.1 degree is about 10 km from the west edge
    report = _lonlat_report(min_lon + 0.1, mid_lat)

    assert in_domain(report, 0).tolist() == [True]
    assert in_domain(report, 5).tolist() == [True]
    assert in_domain(report, 20).tolist() == [False]


def test_score_day_radius_zero_scores_inside_as_hit_and_outside_as_miss():
    mid_x, mid_y = BX0 + BSIDE / 2, BY0 + BSIDE / 2
    inside = (mid_x, mid_y)
    outside = (BX0 + BSIDE + GAP_E + 100, mid_y)  # 100 m east of swath A
    reports = _reports([1.0, 1.0], [inside, outside])

    day = score_day(_swaths([_box_a()], (19.05,)), reports, date(2024, 5, 28), 0)

    assert _counts(day.table).loc[19.05].tolist() == [1, 1, 0, 0]


def test_score_day_radius_20_km_runs():
    day = score_day(_swaths(), _paper_reports(), date(2024, 5, 28), 20)

    assert len(day.table) == 7
    assert day.excluded == 0


def _west_edge_xy():
    """A metric point 2 km inside the west edge of the crop, at the middle latitude."""
    min_lon, min_lat, max_lon, max_lat = county.bbox()
    point = gpd.GeoSeries(
        [shapely.Point(min_lon + 0.02, (min_lat + max_lat) / 2)], crs="EPSG:4326"
    ).to_crs(METRIC)
    return point.iloc[0].x, point.iloc[0].y


def test_unverifiable_area_counts_every_report_even_one_outside_the_domain():
    px, py = _west_edge_xy()
    box = shapely.box(px - 3000, py - 3000, px + 3000, py + 3000)
    reports = _reports([1.0], [(px, py)])

    day = score_day(_swaths([box], (19.05,)), reports, date(2024, 5, 28), 5)

    expected = (box.area - box.intersection(shapely.Point(px, py).buffer(5000)).area) / 1e6
    row = day.table.set_index("threshold_mm").loc[19.05]
    assert day.excluded == 1
    assert row["swath_km2"] == pytest.approx(box.area / 1e6)
    assert row["unverifiable_km2"] == pytest.approx(expected)
    assert row["unverifiable_km2"] <= row["swath_km2"]


def test_unverifiable_area_of_two_reports_at_one_point_equals_that_of_one():
    point = (BX0 + BSIDE / 2, BY0 + BSIDE / 2)
    one = score_day(_swaths(), _reports([1.0], [point]), date(2024, 5, 28), 5)
    two = score_day(_swaths(), _reports([1.0, 0.5], [point, point]), date(2024, 5, 28), 5)

    assert two.table["report_count"].eq(2).all()
    pd.testing.assert_series_equal(one.table["unverifiable_km2"], two.table["unverifiable_km2"])


def test_unverifiable_area_with_no_reports_is_the_whole_swath():
    day = score_day(_swaths(), _paper_reports().iloc[:0], date(2024, 5, 28), 5)

    assert day.table["unverifiable_km2"].tolist() == day.table["swath_km2"].tolist()
    assert day.table["swath_km2"].iloc[0] == pytest.approx(_box_a().area / 1e6)
    assert day.table["swath_km2"].iloc[2] == 0


def test_score_day_counts_sum_to_the_scored_reports_and_events_fall_as_the_class_rises():
    day = score_day(_swaths(), _paper_reports(), date(2024, 5, 28), 5)

    table = day.table
    assert table[COUNT_COLUMNS].sum(axis=1).eq(table["report_count"]).all()
    events = (table["hits"] + table["misses"]).tolist()
    assert events == sorted(events, reverse=True)
    assert (table["unverifiable_km2"] <= table["swath_km2"]).all()


# --- the score command ---

DAY_A, DAY_B = date(2024, 5, 28), date(2024, 5, 29)


def _write_swath_file(directory, day):
    metric = _swaths()
    inches = [mm / 25.4 for mm in metric["threshold_mm"]]
    frame = gpd.GeoDataFrame(
        {
            "storm_date": [day.isoformat()] * 2,
            "threshold_mm": metric["threshold_mm"],
            "threshold_in": inches,
            "label": [swath.label(mm) for mm in metric["threshold_mm"]],
        },
        geometry=metric.geometry,
        crs=METRIC,
    ).to_crs("EPSG:4326")
    return swath.write_swaths(frame, directory / f"swaths-{day}.parquet", 1, 30.0)


def _spc_csv(edge_report=False):
    """SPC CSV text of the six paper reports, plus one report 2 km inside the crop edge."""
    lines = ["Time,Size,Location,County,State,Lat,Lon,Comments"]
    points = _paper_reports().to_crs("EPSG:4326")
    for row in points.itertuples():
        size, lat, lon = round(row.size_in * 100), row.geometry.y, row.geometry.x
        lines.append(f"1200,{size},{row.location},Harris,TX,{lat:.5f},{lon:.5f},test")
    if edge_report:
        min_lon, min_lat, _, max_lat = county.bbox()
        lines.append(
            f"1300,100,Edge,Waller,TX,{(min_lat + max_lat) / 2:.5f},{min_lon + 0.02:.5f},t"
        )
    return "\n".join(lines) + "\n"


def _not_found():
    return urllib.error.HTTPError("u", 404, "Not Found", EmailMessage(), None)


@pytest.fixture
def score_env(tmp_path, monkeypatch):
    """Point the command at tmp dirs; serve(bodies) patches the SPC fetch by storm date."""
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "swaths")
    monkeypatch.setattr(cli, "SCORES_DIR", tmp_path / "scores")
    monkeypatch.setattr(candidates, "DAILY_DIR", tmp_path / "daily")

    def serve(bodies):
        def fetch(storm_date):
            body = bodies[storm_date]
            if isinstance(body, Exception):
                raise body
            return body

        monkeypatch.setattr(reports, "fetch_hail_csv", fetch)

    return tmp_path, serve


def test_score_command_writes_pairs_and_scores_with_metadata(score_env, capsys):
    tmp_path, serve = score_env
    _write_swath_file(tmp_path / "swaths", DAY_A)
    serve({DAY_A: _spc_csv()})

    assert main(["score", "2024-05-28"]) == 0

    out = capsys.readouterr().out
    assert f"confidence: {swath.CONFIDENCE}" in out
    assert "radar-estimated hail size >= 1.25 in" in out
    for name in ("pairs", "scores"):
        meta = pq.read_schema(tmp_path / "scores" / f"{name}-2024-05-28.parquet").metadata
        assert meta[b"source"] == b"noaa-mrms-pds"
        assert meta[b"product"] == b"MESH_Max_1440min_00.50"
        assert meta[b"confidence"] == swath.CONFIDENCE.encode()
        assert meta[b"radius_km"] == b"5"
        assert meta[b"report_source"] == b"spc-daily-csv"
    table = pd.read_parquet(tmp_path / "scores" / "scores-2024-05-28.parquet")
    assert list(table.columns) == SCORE_COLUMNS
    assert _counts(table).loc[19.05].tolist() == [4, 1, 0, 1]
    assert len(gpd.read_parquet(tmp_path / "scores" / "pairs-2024-05-28.parquet")) == 6


def test_score_command_without_a_date_scores_every_swath_file_and_pools_them(score_env, capsys):
    tmp_path, serve = score_env
    for day in (DAY_A, DAY_B):
        _write_swath_file(tmp_path / "swaths", day)
    serve({DAY_A: _spc_csv(), DAY_B: _spc_csv(edge_report=True)})

    assert main(["score"]) == 0

    lines = capsys.readouterr().out.splitlines()
    assert "2024-05-28: 6 scored reports, 0 excluded" in lines
    assert "2024-05-29: 6 scored reports, 1 excluded" in lines
    pooled = next(line for line in lines if "radar-estimated hail size >= 0.75 in" in line)
    assert pooled.split()[-4:-2] == ["0.80", "0.00"]  # pooled POD 8/10, FAR 0 at 0.75 in


def test_score_command_without_a_swath_file_exits_1_naming_ingest(score_env, capsys):
    _, serve = score_env
    serve({})

    assert main(["score", "2024-05-28"]) == 1
    assert "hailprint ingest" in capsys.readouterr().err
    assert main(["score"]) == 1
    assert "hailprint ingest" in capsys.readouterr().err


@pytest.mark.parametrize("argv", [["--radius-km", "25"], ["--radius-km", "nan"], ["2024-5-28"]])
def test_score_command_rejects_bad_arguments(argv):
    with pytest.raises(SystemExit) as exc:
        main(["score", *argv])

    assert exc.value.code == 2


def test_score_command_second_run_leaves_equal_files_and_no_tmp_file(score_env):
    tmp_path, serve = score_env
    _write_swath_file(tmp_path / "swaths", DAY_A)
    serve({DAY_A: _spc_csv()})
    names = ["pairs-2024-05-28.parquet", "scores-2024-05-28.parquet"]

    assert main(["score", "2024-05-28"]) == 0
    first = [(tmp_path / "scores" / n).read_bytes() for n in names]
    assert main(["score", "2024-05-28"]) == 0
    second = [(tmp_path / "scores" / n).read_bytes() for n in names]

    assert first == second
    assert sorted(p.name for p in (tmp_path / "scores").iterdir()) == names


def test_score_command_skips_a_404_day_and_scores_the_other(score_env, capsys):
    tmp_path, serve = score_env
    for day in (DAY_A, DAY_B):
        _write_swath_file(tmp_path / "swaths", day)
    serve({DAY_A: _not_found(), DAY_B: _spc_csv()})

    assert main(["score"]) == 0

    captured = capsys.readouterr()
    assert [line for line in captured.err.splitlines() if "404" in line] == [
        "SPC daily CSV for 2024-05-28 not found (HTTP 404), skipped"
    ]
    assert not (tmp_path / "scores" / "scores-2024-05-28.parquet").exists()
    assert (tmp_path / "scores" / "scores-2024-05-29.parquet").exists()


def test_score_command_exits_1_when_every_day_is_a_404(score_env, capsys):
    tmp_path, serve = score_env
    _write_swath_file(tmp_path / "swaths", DAY_A)
    serve({DAY_A: _not_found()})

    assert main(["score"]) == 1
    assert "no storm date was scored" in capsys.readouterr().err


def test_score_command_exits_1_on_a_network_error(score_env, capsys):
    tmp_path, serve = score_env
    _write_swath_file(tmp_path / "swaths", DAY_A)
    serve({DAY_A: urllib.error.URLError("connection reset")})

    assert main(["score", "2024-05-28"]) == 1
    assert "SPC daily CSV for 2024-05-28 failed" in capsys.readouterr().err


def test_score_command_outputs_hold_no_owner_field_or_forbidden_word(score_env):
    tmp_path, serve = score_env
    _write_swath_file(tmp_path / "swaths", DAY_A)
    serve({DAY_A: _spc_csv()})
    assert main(["score", "2024-05-28"]) == 0

    for path in (tmp_path / "scores").iterdir():
        schema = pq.read_schema(path)
        text = " ".join(schema.names + [v.decode() for v in (schema.metadata or {}).values()])
        for word in (swath.FORBIDDEN_WORD, *map(str.lower, OWNER_FIELDS)):
            assert word not in text.lower(), (path, word)
