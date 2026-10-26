import http.client
import io
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import date, time, timedelta
from email.message import Message as EmailMessage

import pandas as pd
import pytest

from hailprint import archive, candidates, net, reports
from hailprint.__main__ import main
from tests.conftest import needs_wcm


@pytest.mark.parametrize(
    ("day", "clock", "want"),
    [
        (date(2024, 5, 28), time(12, 23), date(2024, 5, 28)),
        (date(2024, 5, 29), time(5, 59), date(2024, 5, 28)),
        (date(2024, 5, 29), time(6, 0), date(2024, 5, 29)),
    ],
)
def test_convective_day_shifts_cst_to_the_spc_day(day, clock, want):
    assert candidates.convective_day(day, clock) == want


def _wcm_csv(tmp_path, tz=None, drop_tz=False):
    rows = pd.DataFrame(
        {
            "om": [1, 2, 3, 4, 5],
            "date": ["2024-05-28", "2024-05-28", "2024-05-29", "2024-05-28", "2024-05-28"],
            "time": ["12:23:00", "13:30:00", "05:59:00", "14:00:00", "14:00:00"],
            "st": ["TX", "TX", "TX", "TX", "OK"],
            "mag": [1.0, 1.75, 1.25, 2.0, 2.5],
            "f1": [201, 0, 0, 157, 201],
            "f2": [0, 201, 0, 0, 0],
            "f3": [0, 0, 0, 0, 0],
            "f4": [0, 0, 201, 0, 0],
            "tz": [3, 3, 3, 3, 3],
            "edat": ["", "", "", "", ""],
        }
    )
    if tz is not None:
        rows["tz"] = tz
    if drop_tz:
        rows = rows.drop(columns="tz")
    path = tmp_path / "wcm.csv.zip"
    rows.to_csv(path, index=False, compression={"method": "zip", "archive_name": "wcm.csv"})
    return path


def test_harris_days_keeps_tx_rows_with_201_in_any_f_column(tmp_path):
    df = candidates.harris_days(_wcm_csv(tmp_path))

    assert df["storm_date"].tolist() == [date(2024, 5, 28)]
    assert df["report_count"].tolist() == [3]
    assert df["max_size_in"].tolist() == [1.75]


def test_harris_days_rejects_a_harris_row_with_another_time_zone(tmp_path):
    path = _wcm_csv(tmp_path, tz=[3, 9, 3, 3, 3])

    with pytest.raises(ValueError, match="9"):
        candidates.harris_days(path)


def test_harris_days_ignores_the_time_zone_of_a_row_outside_harris(tmp_path):
    path = _wcm_csv(tmp_path, tz=[3, 3, 3, 9, 9])

    assert candidates.harris_days(path)["report_count"].tolist() == [3]


def test_harris_days_is_the_same_on_a_second_call(tmp_path):
    path = _wcm_csv(tmp_path)

    pd.testing.assert_frame_equal(candidates.harris_days(path), candidates.harris_days(path))


def test_harris_days_without_a_tz_column_names_the_column(tmp_path):
    with pytest.raises(ValueError, match="tz"):
        candidates.harris_days(_wcm_csv(tmp_path, drop_tz=True))


def test_rank_sorts_by_count_then_size_and_drops_days_before_the_archive():
    days = pd.DataFrame(
        {
            "storm_date": [
                date(2024, 5, 28),
                date(2024, 5, 29),
                date(2019, 1, 1),
                date(2024, 6, 1),
            ],
            "report_count": [9, 1, 20, 9],
            "max_size_in": [1.75, 1.0, 3.0, 2.0],
            "report_source": ["wcm", "wcm", "wcm", "spc-daily"],
        }
    )
    index = pd.DataFrame(
        {"storm_date": [date(2020, 10, 13), date(2024, 5, 28)], "has_12z": [True, True]}
    )

    ranked = candidates.rank(days, index)

    assert list(ranked.columns) == candidates.COLUMNS
    assert ranked["storm_date"].tolist() == [date(2024, 6, 1), date(2024, 5, 28), date(2024, 5, 29)]
    assert ranked["has_12z"].tolist() == [False, True, False]
    assert ranked["report_source"].tolist() == ["spc-daily", "wcm", "wcm"]


def test_candidates_without_index_exits_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(archive, "INDEX_PATH", tmp_path / "missing.parquet")
    assert main(["candidates"]) == 1
    assert "hailprint index" in capsys.readouterr().err


def _fake_urlopen(body):
    @contextmanager
    def urlopen(url, timeout=None):
        yield io.BytesIO(body)

    return urlopen


def test_fetch_database_rejects_a_non_zip_body(tmp_path, monkeypatch):
    path = tmp_path / "spc" / "hail.csv.zip"
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen(b"not a zip"))

    with pytest.raises(RuntimeError, match="not a zip archive"):
        candidates.fetch_database(path)

    assert not path.exists()
    assert list(path.parent.glob("*.tmp")) == []


def test_fetch_database_wraps_a_url_error_and_removes_the_tmp_file(tmp_path, monkeypatch):
    path = tmp_path / "spc" / "hail.csv.zip"

    def urlopen(url, timeout=None):
        raise urllib.error.URLError("boom")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)

    with pytest.raises(RuntimeError, match="WCM download failed"):
        candidates.fetch_database(path)

    assert list(path.parent.glob("*.tmp")) == []


def test_fetch_database_wraps_a_short_read(tmp_path, monkeypatch):
    path = tmp_path / "spc" / "hail.csv.zip"

    def urlopen(url, timeout=None):
        raise http.client.IncompleteRead(b"x")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(net.time, "sleep", lambda s: None)

    with pytest.raises(RuntimeError, match="WCM download failed"):
        candidates.fetch_database(path)

    assert list(path.parent.glob("*.tmp")) == []


@needs_wcm
def test_wcm_database_counts_for_the_oracle_days():
    df = candidates.harris_days(candidates.WCM_PATH).set_index("storm_date")
    assert df.loc[date(2024, 5, 28), "report_count"] == 9
    assert df.loc[date(2024, 5, 29), "report_count"] == 1


# --- daily-CSV fill after the WCM end (the synthetic WCM zip ends on 2024-05-28) ---

WCM_END = date(2024, 5, 28)
SPC_HEADER = "Time,Size,Location,County,State,Lat,Lon,Comments\n"
THREE_HARRIS = SPC_HEADER + (
    "1800,100,A,Harris,TX,29.9,-95.4,x\n"
    "1810,175,B,Harris,TX,29.8,-95.3,x\n"
    "1820,150,C,Harris,TX,29.7,-95.2,x\n"
)
NOT_HARRIS = SPC_HEADER + (
    "1800,100,Hamilton,Harris,GA,32.75,-84.87,x\n1810,200,Sugar Land,Fort Bend,TX,29.62,-95.63,x\n"
)


def _index(*days):
    return pd.DataFrame({"storm_date": list(days), "has_12z": [True] * len(days)})


def _serve(monkeypatch, bodies):
    """Patch the SPC fetch; a body that is an exception is raised. Returns the call log."""
    calls = []

    def fetch(storm_date):
        calls.append(storm_date)
        body = bodies[storm_date]
        if isinstance(body, Exception):
            raise body
        return body

    monkeypatch.setattr(reports, "fetch_hail_csv", fetch)
    return calls


def _all_days(tmp_path, index, today=date(2026, 10, 26)):
    return candidates.all_days(_wcm_csv(tmp_path), index, cache_dir=tmp_path / "daily", today=today)


def test_wcm_last_day_is_the_last_convective_day_of_any_row(tmp_path):
    assert candidates.wcm_last_day(_wcm_csv(tmp_path)) == WCM_END


def test_all_days_fills_a_day_after_the_wcm_end_from_the_daily_csv(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    _serve(monkeypatch, {day: THREE_HARRIS})

    days = _all_days(tmp_path, _index(WCM_END, day)).set_index("storm_date")

    assert days.loc[day, "report_count"] == 3
    assert days.loc[day, "max_size_in"] == 1.75
    assert days.loc[day, "report_source"] == "spc-daily"
    assert days.loc[WCM_END, "report_source"] == "wcm"
    assert days.loc[WCM_END, "report_count"] == 3


def test_all_days_fetches_only_days_after_the_last_wcm_day(tmp_path, monkeypatch):
    next_day = date(2024, 5, 29)
    calls = _serve(monkeypatch, {next_day: THREE_HARRIS})

    days = _all_days(tmp_path, _index(WCM_END, next_day))

    assert calls == [next_day]
    assert days["report_source"].tolist() == ["wcm", "spc-daily"]


def test_all_days_drops_a_day_with_no_harris_tx_row(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    _serve(monkeypatch, {day: NOT_HARRIS})

    days = _all_days(tmp_path, _index(WCM_END, day))

    assert days["storm_date"].tolist() == [WCM_END]


def test_all_days_caches_an_old_day_and_refetches_a_fresh_day(tmp_path, monkeypatch):
    today = date(2026, 10, 26)
    old, fresh = date(2026, 1, 5), date(2026, 10, 24)
    calls = _serve(monkeypatch, {old: THREE_HARRIS, fresh: THREE_HARRIS})
    index = _index(old, fresh)

    _all_days(tmp_path, index, today)
    _all_days(tmp_path, index, today)

    assert sorted(calls) == [old, fresh, fresh]
    assert [f.name for f in (tmp_path / "daily").iterdir()] == ["260105.csv"]


def test_all_days_skips_a_404_day_with_one_stderr_line(tmp_path, monkeypatch, capsys):
    gone, there = date(2026, 1, 5), date(2026, 1, 6)
    not_found = urllib.error.HTTPError("u", 404, "Not Found", EmailMessage(), None)
    _serve(monkeypatch, {gone: not_found, there: THREE_HARRIS})

    days = _all_days(tmp_path, _index(gone, there))

    assert days.loc[days["report_source"] == "spc-daily", "storm_date"].tolist() == [there]
    lines = capsys.readouterr().err.splitlines()
    assert len(lines) == 1
    assert "2026-01-05" in lines[0]


def test_all_days_names_the_date_of_a_network_error_and_leaves_no_tmp_file(tmp_path, monkeypatch):
    day = date(2026, 1, 6)
    _serve(monkeypatch, {day: urllib.error.URLError("boom")})

    with pytest.raises(RuntimeError, match="2026-01-06"):
        _all_days(tmp_path, _index(day))

    assert list((tmp_path / "daily").glob("*")) == []


def test_candidates_command_writes_the_report_source_column(tmp_path, monkeypatch, capsys):
    index = _index(date(2024, 5, 28), date(2026, 1, 5))
    index_path = tmp_path / "mesh-archive.parquet"
    index.to_parquet(index_path)
    out_path = tmp_path / "candidate-days.csv"
    days = pd.DataFrame(
        {
            "storm_date": [date(2024, 5, 28), date(2026, 1, 5)],
            "report_count": [9, 3],
            "max_size_in": [1.75, 1.5],
            "report_source": ["wcm", "spc-daily"],
        }
    )
    monkeypatch.setattr(archive, "INDEX_PATH", index_path)
    monkeypatch.setattr(candidates, "CANDIDATES_PATH", out_path)
    monkeypatch.setattr(candidates, "fetch_database", lambda: tmp_path / "wcm.zip")
    monkeypatch.setattr(candidates, "all_days", lambda wcm_path, index_df: days)

    assert main(["candidates"]) == 0

    written = pd.read_csv(out_path)
    assert list(written.columns) == candidates.COLUMNS
    assert written["report_source"].tolist() == ["wcm", "spc-daily"]
    assert "spc-daily" in capsys.readouterr().out


def test_all_days_does_not_cache_a_body_that_fails_to_parse(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    _serve(monkeypatch, {day: "<html>Service Unavailable</html>"})

    with pytest.raises(RuntimeError, match="2026-01-05"):
        _all_days(tmp_path, _index(day))

    assert list((tmp_path / "daily").glob("*")) == []


def test_all_days_fetches_again_when_the_cache_file_no_longer_parses(tmp_path, monkeypatch, capsys):
    day = date(2026, 1, 5)
    cache = tmp_path / "daily"
    cache.mkdir()
    (cache / "260105.csv").write_text("", encoding="utf-8")
    calls = _serve(monkeypatch, {day: THREE_HARRIS})

    days = _all_days(tmp_path, _index(day))

    assert calls == [day]
    assert days.loc[days["report_source"] == "spc-daily", "report_count"].tolist() == [3]
    assert (cache / "260105.csv").read_text(encoding="utf-8") == THREE_HARRIS
    assert "260105.csv" in capsys.readouterr().err


def test_all_days_raises_when_every_fill_day_is_a_404(tmp_path, monkeypatch):
    days = [date(2026, 1, 5), date(2026, 1, 6)]
    not_found = urllib.error.HTTPError("u", 404, "Not Found", EmailMessage(), None)
    _serve(monkeypatch, {d: not_found for d in days})

    with pytest.raises(RuntimeError, match="any of the 2 days"):
        _all_days(tmp_path, _index(*days))


def test_all_days_names_the_date_when_the_cache_write_fails(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    _serve(monkeypatch, {day: THREE_HARRIS})

    def boom(text, path):
        raise OSError("disk full")

    monkeypatch.setattr(candidates.files, "write_text_atomic", boom)

    with pytest.raises(RuntimeError, match="2026-01-05"):
        _all_days(tmp_path, _index(day))


@pytest.mark.parametrize(("age", "cached"), [(3, False), (4, True)])
def test_all_days_caches_a_day_only_after_it_is_older_than_fresh_days(
    tmp_path, monkeypatch, age, cached
):
    today = date(2026, 10, 26)
    day = today - timedelta(days=age)
    _serve(monkeypatch, {day: THREE_HARRIS})

    _all_days(tmp_path, _index(day), today=today)

    assert (tmp_path / "daily" / f"{day:%y%m%d}.csv").exists() is cached


def test_all_days_names_the_date_on_a_server_error(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    boom = urllib.error.HTTPError("u", 500, "Server Error", EmailMessage(), None)
    _serve(monkeypatch, {day: boom})

    with pytest.raises(RuntimeError, match="2026-01-05"):
        _all_days(tmp_path, _index(day))

    assert list((tmp_path / "daily").glob("*")) == []


def test_all_days_fetches_again_when_the_cache_file_is_not_utf8(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    cache = tmp_path / "daily"
    cache.mkdir()
    (cache / "260105.csv").write_bytes(b"\xff\xfe\x00bad")
    calls = _serve(monkeypatch, {day: THREE_HARRIS})

    _all_days(tmp_path, _index(day))

    assert calls == [day]


def test_all_days_fetches_a_repeated_index_day_once(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    calls = _serve(monkeypatch, {day: THREE_HARRIS})

    _all_days(tmp_path, _index(day, day))

    assert calls == [day]


def test_all_days_skips_a_single_404_day_and_keeps_the_wcm_rows(tmp_path, monkeypatch):
    day = date(2026, 1, 5)
    boom = urllib.error.HTTPError("u", 404, "Not Found", EmailMessage(), None)
    _serve(monkeypatch, {day: boom})

    days = _all_days(tmp_path, _index(day))

    assert "spc-daily" not in set(days["report_source"])


def test_read_facts_types_the_filled_cells_and_gives_none_for_a_blank_one(tmp_path):
    path = tmp_path / "candidate-days.csv"
    path.write_text(
        "storm_date,report_count,max_size_in,has_12z,report_source\n"
        "2024-05-28,10,,True,wcm\n"
        "2023-06-23,13,2.75,True,spc-daily\n",
        encoding="utf-8",
    )

    facts = candidates.read_facts(path)

    assert facts == {
        "2024-05-28": {"report_count": 10, "max_size_in": None, "report_source": "wcm"},
        "2023-06-23": {"report_count": 13, "max_size_in": 2.75, "report_source": "spc-daily"},
    }
    assert type(facts["2023-06-23"]["report_count"]) is int
    assert type(facts["2023-06-23"]["max_size_in"]) is float
