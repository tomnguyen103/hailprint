import io
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import date, time

import pandas as pd
import pytest

from hailprint import archive, candidates
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


def _wcm_csv(tmp_path):
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
            "edat": ["", "", "", "", ""],
        }
    )
    path = tmp_path / "wcm.csv.zip"
    rows.to_csv(path, index=False, compression={"method": "zip", "archive_name": "wcm.csv"})
    return path


def test_harris_days_keeps_tx_rows_with_201_in_any_f_column(tmp_path):
    df = candidates.harris_days(_wcm_csv(tmp_path))

    assert df["storm_date"].tolist() == [date(2024, 5, 28)]
    assert df["report_count"].tolist() == [3]
    assert df["max_size_in"].tolist() == [1.75]


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
        }
    )
    index = pd.DataFrame(
        {"storm_date": [date(2020, 10, 13), date(2024, 5, 28)], "has_12z": [True, True]}
    )

    ranked = candidates.rank(days, index)

    assert list(ranked.columns) == candidates.COLUMNS
    assert ranked["storm_date"].tolist() == [date(2024, 6, 1), date(2024, 5, 28), date(2024, 5, 29)]
    assert ranked["has_12z"].tolist() == [False, True, False]


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
    assert not path.with_suffix(".tmp").exists()


def test_fetch_database_wraps_a_url_error_and_removes_the_tmp_file(tmp_path, monkeypatch):
    path = tmp_path / "spc" / "hail.csv.zip"

    def urlopen(url, timeout=None):
        raise urllib.error.URLError("boom")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)

    with pytest.raises(RuntimeError, match="WCM download failed"):
        candidates.fetch_database(path)

    assert not path.with_suffix(".tmp").exists()


@needs_wcm
def test_wcm_database_counts_for_the_oracle_days():
    df = candidates.harris_days(candidates.WCM_PATH).set_index("storm_date")
    assert df.loc[date(2024, 5, 28), "report_count"] == 9
    assert df.loc[date(2024, 5, 29), "report_count"] == 1
