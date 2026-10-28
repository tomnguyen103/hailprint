"""The publish command: files, index, skips, and failures, on the two real fixture days."""

import io
import json
import shutil
import threading
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from hailprint import __main__ as cli
from hailprint import (
    archive,
    candidates,
    files,
    internet,
    odin,
    parcels,
    power,
    publish,
    sbw,
    swath,
)

FIXTURES = Path(__file__).parent / "fixtures"
GOLDEN = json.loads((FIXTURES / "score_golden.json").read_text(encoding="utf-8"))
RUN_TIME = datetime(2024, 6, 1, 12, 0, 30, 999999, tzinfo=UTC)
LATER = date(2024, 5, 28)
EARLIER = date(2023, 6, 23)
MAX_MESH_MM = 73.2
CANDIDATE_ROWS = (
    "storm_date,report_count,max_size_in,has_12z,report_source\n"
    "2024-05-28,10,4.0,True,wcm\n"
    "2023-06-23,13,2.75,True,wcm\n"
)


class Env:
    """Tmp dirs behind the command, and a table of what the stub SPC fetch serves."""

    def __init__(self, root: Path):
        self.swaths = root / "swaths"
        self.parcels = root / "parcels"
        self.site = root / "site"
        self.warnings = root / "warnings"
        self.eaglei = root / "eaglei"
        self.power = root / "power"
        self.odin = root / "odin"
        self.internet = root / "internet"
        self.served: dict[date, object] = {}

    def add_day(self, storm_date: date, *, metadata: bool = True) -> Path:
        """Copy the fixture swaths as the swath file of the date and serve its SPC CSV."""
        frame = gpd.read_parquet(FIXTURES / f"score_swaths_{storm_date}.parquet")
        path = self.swaths / f"swaths-{storm_date}.parquet"
        if metadata:
            swath.write_swaths(frame, path, 1, MAX_MESH_MM)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            frame.to_parquet(path)
        self.served[storm_date] = (FIXTURES / f"score_spc_{storm_date:%y%m%d}.csv").read_text(
            encoding="utf-8"
        )
        return path

    def add_zips(self, storm_date: date, rows: list[tuple[str, float, int]]) -> Path:
        frame = pd.DataFrame(
            [
                {
                    "storm_date": str(storm_date),
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
        return files.write_atomic(frame, self.parcels / f"zip-counts-{storm_date}.parquet")

    def storm_dir(self, storm_date: date) -> Path:
        return self.site / "storms" / str(storm_date)

    def index(self) -> dict:
        return json.loads((self.site / "storms.json").read_text(encoding="utf-8"))

    def pipeline(self) -> dict:
        return json.loads((self.site / publish.PIPELINE_FILE).read_text(encoding="utf-8"))

    def tree(self) -> dict[str, bytes]:
        return {
            str(p.relative_to(self.site)): p.read_bytes()
            for p in sorted(self.site.rglob("*"))
            if p.is_file()
        }


@pytest.fixture
def env(tmp_path, monkeypatch):
    env = Env(tmp_path)
    (tmp_path / "candidate-days.csv").write_text(CANDIDATE_ROWS, encoding="utf-8")
    monkeypatch.setattr(cli, "DERIVED_DIR", env.swaths)
    monkeypatch.setattr(cli, "PARCELS_DIR", env.parcels)
    monkeypatch.setattr(cli, "SITE_DATA_DIR", env.site)
    monkeypatch.setattr(cli, "WARNINGS_DIR", env.warnings)
    monkeypatch.setattr(cli, "EAGLEI_DIR", env.eaglei)
    monkeypatch.setattr(cli, "POWER_DIR", env.power)
    monkeypatch.setattr(cli, "ODIN_DIR", env.odin)
    monkeypatch.setattr(cli, "INTERNET_DIR", env.internet)
    monkeypatch.setattr(cli, "_utc_now", lambda: RUN_TIME)
    monkeypatch.setattr(archive, "INDEX_PATH", tmp_path / "index" / "mesh-archive.parquet")
    monkeypatch.setattr(candidates, "CANDIDATES_PATH", tmp_path / "candidate-days.csv")

    def served(storm_date, cache_dir, today):
        outcome = env.served[storm_date]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(candidates, "daily_csv", served)
    return env


def _validated(env, storm_date):
    """Every published file of the date, parsed and checked against its schema."""
    kinds = {
        "swath.geojson": "swath",
        "reports.geojson": "reports",
        "pairs.json": "pairs",
        "zip-counts.json": "zip-counts",
    }
    docs = {}
    for name, kind in kinds.items():
        path = env.storm_dir(storm_date) / name
        if path.exists():
            docs[name] = json.loads(path.read_text(encoding="utf-8"))
            publish.validate(docs[name], kind)
    return docs


def test_publish_one_date_writes_three_valid_files_and_one_index_entry(env, capsys):
    env.add_day(LATER)

    assert cli.main(["publish", "2024-05-28"]) == 0

    docs = _validated(env, LATER)
    assert sorted(docs) == ["pairs.json", "reports.geojson", "swath.geojson"]
    index = env.index()
    publish.validate(index, "storms")
    (entry,) = index["storms"]
    golden = GOLDEN["2024-05-28"]
    assert entry["storm_date"] == "2024-05-28"
    assert (entry["report_count"], entry["max_size_in"], entry["report_source"]) == (10, 4.0, "wcm")
    assert entry["max_mesh_mm"] == MAX_MESH_MM
    assert entry["scored_reports"] == golden["report_count"]
    assert entry["excluded_reports"] == golden["excluded"]
    counts = {
        f"{row['threshold_mm']:g}": [
            row["hits"],
            row["misses"],
            row["false_alarms"],
            row["correct_negatives"],
        ]
        for row in entry["table"]
    }
    assert counts == golden["counts"]
    assert entry["parcel_total"] is None
    assert entry["files"] == {
        "swath": "storms/2024-05-28/swath.geojson",
        "reports": "storms/2024-05-28/reports.geojson",
        "pairs": "storms/2024-05-28/pairs.json",
        "zip_counts": None,
        "power": None,
        "internet": None,
        "warnings": None,
    }
    assert f"confidence: {swath.CONFIDENCE}" in capsys.readouterr().out


def test_every_published_file_names_its_inputs_the_run_time_and_the_band(env):
    env.add_day(LATER)

    cli.main(["publish", "2024-05-28"])

    docs = _validated(env, LATER)
    for name, doc in docs.items():
        receipt = doc["receipt"]
        assert receipt["storm_date"] == "2024-05-28", name
        assert receipt["run_time"] == "2024-06-01T12:00:30Z", name
        assert receipt["confidence"] == swath.CONFIDENCE, name
    swath_files = [s["file"] for s in docs["swath.geojson"]["receipt"]["sources"]]
    assert swath_files == ["swaths-2024-05-28.parquet"]
    pair_files = [s["file"] for s in docs["pairs.json"]["receipt"]["sources"]]
    assert pair_files == ["swaths-2024-05-28.parquet", "240528.csv"]


def test_a_zip_parquet_adds_the_zip_file_and_the_parcel_total(env):
    env.add_day(LATER)
    env.add_zips(LATER, [("77002", 19.05, 4), ("77003", 19.05, 6), ("77002", 25.4, 3)])

    assert cli.main(["publish", "2024-05-28"]) == 0

    docs = _validated(env, LATER)
    zips = docs["zip-counts.json"]
    assert [c["parcel_count"] for c in zips["classes"]] == [10, 3]
    assert {(z["zip"], z["threshold_mm"]): z["parcel_count"] for z in zips["zips"]} == {
        ("77002", 19.05): 4,
        ("77003", 19.05): 6,
        ("77002", 25.4): 3,
    }
    (entry,) = env.index()["storms"]
    assert entry["parcel_total"] == 10
    assert entry["files"]["zip_counts"] == "storms/2024-05-28/zip-counts.json"


def test_a_missing_zip_parquet_removes_an_old_zip_file_and_keeps_exit_0(env):
    env.add_day(LATER)
    zips = env.add_zips(LATER, [("77002", 19.05, 4)])
    cli.main(["publish", "2024-05-28"])
    assert (env.storm_dir(LATER) / "zip-counts.json").exists()
    zips.unlink()

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert not (env.storm_dir(LATER) / "zip-counts.json").exists()
    assert env.index()["storms"][0]["files"]["zip_counts"] is None


def test_two_runs_with_a_fixed_run_time_give_equal_bytes_and_leave_no_tmp_file(env):
    env.add_day(LATER)
    env.add_day(EARLIER)
    env.add_zips(LATER, [("77002", 19.05, 4)])

    cli.main(["publish"])
    first = env.tree()
    cli.main(["publish"])

    assert env.tree() == first
    assert len(first) == 9
    assert "pipeline.json" in first
    assert not [name for name in first if name.endswith(".tmp")]


def test_no_date_publishes_every_swath_file_and_the_index_sorts_newest_first(env):
    env.add_day(EARLIER)
    env.add_day(LATER)

    assert cli.main(["publish"]) == 0

    assert [e["storm_date"] for e in env.index()["storms"]] == ["2024-05-28", "2023-06-23"]


def test_a_single_date_run_replaces_its_entry_and_an_entry_without_files_drops_out(env):
    env.add_day(EARLIER)
    env.add_day(LATER)
    cli.main(["publish"])
    before = {e["storm_date"]: e for e in env.index()["storms"]}
    env.add_zips(LATER, [("77002", 19.05, 4)])

    cli.main(["publish", "2024-05-28"])

    after = {e["storm_date"]: e for e in env.index()["storms"]}
    assert after["2023-06-23"] == before["2023-06-23"]
    assert after["2024-05-28"]["parcel_total"] == 4
    shutil.rmtree(env.storm_dir(EARLIER))

    cli.main(["publish", "2024-05-28"])

    assert [e["storm_date"] for e in env.index()["storms"]] == ["2024-05-28"]


def test_publish_without_an_archive_index_writes_pipeline_json_with_archive_null(env):
    env.add_day(LATER)

    assert cli.main(["publish"]) == 0

    doc = env.pipeline()
    publish.validate(doc, "pipeline")
    assert doc["archive"] is None
    assert doc["runs"][0]["storm_dates"] == ["2024-05-28"]


def test_publish_with_an_archive_index_counts_its_days(env):
    env.add_day(LATER)
    frame = pd.DataFrame(
        {
            "storm_date": [date(2023, 6, 23), date(2024, 5, 27), date(2024, 5, 28)],
            "file_count": [720, 719, 720],
            "bytes": [3, 2, 3],
            "has_12z": [True, False, True],
        }
    )
    files.write_atomic(frame, archive.INDEX_PATH)

    assert cli.main(["publish"]) == 0

    summary = env.pipeline()["archive"]
    assert summary is not None
    assert summary["days"] == len(frame)


def test_a_single_date_run_keeps_the_sources_of_every_published_date(env):
    env.add_day(EARLIER)
    env.add_day(LATER)
    env.add_zips(LATER, [("77002", 19.05, 4)])
    cli.main(["publish"])

    cli.main(["publish", "2024-05-28"])

    doc = env.pipeline()
    assert doc["runs"][0]["storm_dates"] == ["2024-05-28"]
    by_source = {row["source"]: row["storm_dates"] for row in doc["sources"]}
    assert by_source == {
        "noaa-mrms-pds": ["2023-06-23", "2024-05-28"],
        publish.spc_source(LATER)["source"]: ["2023-06-23", "2024-05-28"],
        "hcad": ["2024-05-28"],
    }


def test_a_date_absent_from_the_candidate_file_gets_null_report_fields(env, tmp_path):
    env.add_day(LATER)
    (tmp_path / "candidate-days.csv").write_text(
        CANDIDATE_ROWS.replace("2024-05-28", "2024-05-29"), encoding="utf-8"
    )

    assert cli.main(["publish", "2024-05-28"]) == 0

    (entry,) = env.index()["storms"]
    assert (entry["report_count"], entry["max_size_in"], entry["report_source"]) == (
        None,
        None,
        None,
    )


def test_a_swath_file_without_metadata_fails_its_date_and_keeps_the_other_complete(env, capsys):
    env.add_day(EARLIER)
    bad = env.add_day(LATER, metadata=False)

    assert cli.main(["publish"]) == 1

    err = capsys.readouterr().err
    assert "2024-05-28" in err
    assert bad.name in err
    assert sorted(_validated(env, EARLIER)) == ["pairs.json", "reports.geojson", "swath.geojson"]
    assert not env.storm_dir(LATER).exists()
    assert [e["storm_date"] for e in env.index()["storms"]] == ["2023-06-23"]
    doc = env.pipeline()
    assert doc["runs"][0]["storm_dates"] == ["2023-06-23"]
    assert all("2024-05-28" not in row["storm_dates"] for row in doc["sources"])


def test_a_failed_validation_writes_nothing_for_that_date(env, monkeypatch, capsys):
    env.add_day(EARLIER)
    env.add_day(LATER)

    def reject(doc, kind):
        if kind == "pairs" and doc["receipt"]["storm_date"] == "2024-05-28":
            raise ValueError("pairs: $: forced")

    real = publish.validate
    monkeypatch.setattr(publish, "validate", lambda doc, kind: (reject(doc, kind), real(doc, kind)))

    assert cli.main(["publish"]) == 1

    assert "2024-05-28" in capsys.readouterr().err
    assert not env.storm_dir(LATER).exists()
    assert (env.storm_dir(EARLIER) / "pairs.json").exists()
    assert [e["storm_date"] for e in env.index()["storms"]] == ["2023-06-23"]


@pytest.mark.parametrize("outcome", [None, RuntimeError("no route")], ids=["404", "RuntimeError"])
def test_a_date_whose_spc_csv_cannot_be_fetched_is_skipped_with_a_stderr_line(env, capsys, outcome):
    env.add_day(EARLIER)
    env.add_day(LATER)
    env.served[LATER] = outcome

    assert cli.main(["publish"]) == 0

    assert "2024-05-28" in capsys.readouterr().err
    assert not env.storm_dir(LATER).exists()
    assert [e["storm_date"] for e in env.index()["storms"]] == ["2023-06-23"]


def test_the_run_fails_when_no_date_published(env, capsys):
    env.add_day(LATER)
    env.served[LATER] = None

    assert cli.main(["publish"]) == 1

    assert "no storm date was published" in capsys.readouterr().err
    assert not (env.site / "storms.json").exists()


def test_a_missing_swath_file_names_the_ingest_command_and_the_path(env, capsys):
    assert cli.main(["publish", "2024-05-28"]) == 1

    expected = env.swaths / "swaths-2024-05-28.parquet"
    assert capsys.readouterr().err.strip() == f"run hailprint ingest first: {expected}"


def test_a_missing_candidate_file_names_the_candidates_command_and_the_path(env, tmp_path, capsys):
    env.add_day(LATER)
    (tmp_path / "candidate-days.csv").unlink()

    assert cli.main(["publish", "2024-05-28"]) == 1

    expected = tmp_path / "candidate-days.csv"
    assert capsys.readouterr().err.strip() == f"run hailprint candidates first: {expected}"


def test_a_malformed_date_is_rejected_by_the_parser(env):
    with pytest.raises(SystemExit) as stop:
        cli.main(["publish", "2024-5-28"])

    assert stop.value.code == 2


def test_a_failed_rename_leaves_the_old_file_intact_and_no_tmp_file(env, monkeypatch, capsys):
    env.add_day(LATER)
    cli.main(["publish", "2024-05-28"])
    target = env.storm_dir(LATER) / "swath.geojson"
    old = target.read_bytes()
    real = Path.replace

    def broken(self, destination):
        if Path(destination) == target:
            raise OSError("disk full")
        return real(self, destination)

    monkeypatch.setattr(Path, "replace", broken)
    monkeypatch.setattr(cli, "_utc_now", lambda: datetime(2025, 1, 1, tzinfo=UTC))

    assert cli.main(["publish", "2024-05-28"]) == 1

    assert "disk full" in capsys.readouterr().err
    assert target.read_bytes() == old
    assert not [p for p in env.site.rglob("*.tmp")]


def test_an_index_that_breaks_its_schema_stops_the_run_with_the_file_kind(env):
    env.add_day(LATER)
    cli.main(["publish", "2024-05-28"])
    index = env.site / "storms.json"
    index.write_text(json.dumps({"storms": "none"}), encoding="utf-8")

    assert cli.main(["publish", "2024-05-28"]) == 1
    assert json.loads(index.read_text(encoding="utf-8")) == {"storms": "none"}


def test_a_write_error_stops_the_run_with_exit_1_and_the_reason(env, monkeypatch, capsys):
    env.add_day(LATER)

    def broken(text, path):
        raise OSError("disk full")

    monkeypatch.setattr(cli.files, "write_text_atomic", broken)

    assert cli.main(["publish"]) == 1
    assert "disk full" in capsys.readouterr().err


def test_an_index_that_is_not_json_stops_the_run_and_names_the_file(env, capsys):
    env.add_day(LATER)
    env.site.mkdir(parents=True)
    (env.site / "storms.json").write_text("{", encoding="utf-8")

    assert cli.main(["publish"]) == 1
    assert "storms.json" in capsys.readouterr().err


def test_a_corrupt_pairs_file_of_an_earlier_run_stops_the_run_before_the_index_write(env, capsys):
    env.add_day(EARLIER)
    env.add_day(LATER)
    cli.main(["publish"])
    before = env.index()
    (env.storm_dir(EARLIER) / "pairs.json").write_text("nope", encoding="utf-8")

    assert cli.main(["publish", "2024-05-28"]) == 1

    assert "not valid JSON" in capsys.readouterr().err
    assert env.index() == before


def test_a_pipeline_document_that_fails_its_schema_keeps_the_old_index(env, monkeypatch, capsys):
    env.add_day(EARLIER)
    env.add_day(LATER)
    cli.main(["publish", "2023-06-23"])
    before = env.index(), env.pipeline()
    real = publish.validate

    def reject_pipeline(doc, kind):
        real(doc, kind)
        if kind == "pipeline":
            raise ValueError("pipeline: $: forced")

    monkeypatch.setattr(publish, "validate", reject_pipeline)

    assert cli.main(["publish", "2024-05-28"]) == 1

    assert "pipeline: $: forced" in capsys.readouterr().err
    assert (env.index(), env.pipeline()) == before


def test_a_second_run_that_finds_the_lock_file_stops_with_exit_1(env, capsys):
    env.add_day(LATER)
    cli.main(["publish"])
    before = env.index()
    lock = env.site / cli.LOCK_FILE
    lock.write_text("1", encoding="utf-8")

    assert cli.main(["publish"]) == 1

    assert cli.LOCK_FILE in capsys.readouterr().err
    assert env.index() == before
    assert lock.read_text(encoding="utf-8") == "1"


def test_a_corrupt_archive_index_stops_the_run_before_any_write(env, capsys):
    env.add_day(LATER)
    archive.INDEX_PATH.parent.mkdir(parents=True)
    archive.INDEX_PATH.write_text("nope", encoding="utf-8")

    assert cli.main(["publish"]) == 1

    assert "mesh-archive.parquet" in capsys.readouterr().err
    assert not (env.site / "storms.json").exists()
    assert not env.storm_dir(LATER).exists()


def test_a_deleted_zip_file_of_an_earlier_date_nulls_its_entry_and_keeps_exit_0(env):
    env.add_day(EARLIER)
    env.add_day(LATER)
    env.add_zips(EARLIER, [("77002", 19.05, 4)])
    cli.main(["publish"])
    (env.storm_dir(EARLIER) / "zip-counts.json").unlink()

    assert cli.main(["publish", "2024-05-28"]) == 0

    earlier = {e["storm_date"]: e for e in env.index()["storms"]}["2023-06-23"]
    assert earlier["files"]["zip_counts"] is None
    assert earlier["parcel_total"] is None


SBW_FEED = FIXTURES / "iem_sbw_hgx.geojson"
SBW_KEPT = [107, 101, 102, 109, 103]
OPEN_WINDOW = date(2024, 5, 31)


class Iem:
    """The IEM boundary: urlopen serves the body and records each requested URL."""

    def __init__(self):
        self.body = SBW_FEED.read_bytes()
        self.urls: list[str] = []


@pytest.fixture
def iem(monkeypatch):
    iem = Iem()

    @contextmanager
    def urlopen(url, timeout=None):
        iem.urls.append(url)
        yield io.BytesIO(iem.body)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    return iem


def _warnings_file(env, storm_date):
    return env.warnings / f"warnings-{storm_date}.parquet"


def test_warnings_writes_one_parquet_per_date_with_the_iem_and_sbw_metadata(env, iem, capsys):
    assert cli.main(["warnings", "2024-05-28"]) == 0

    path = _warnings_file(env, LATER)
    assert gpd.read_parquet(path)["eventid"].tolist() == SBW_KEPT
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"iem", b"sbw")
    assert capsys.readouterr().out == "2024-05-28: 5 warnings\n"
    assert len(iem.urls) == 1


def test_warnings_missing_makes_no_second_fetch_for_a_date_that_has_a_file(env, iem):
    env.add_day(LATER)

    assert cli.main(["warnings", "--missing"]) == 0
    assert cli.main(["warnings", "--missing"]) == 0

    assert len(iem.urls) == 1
    assert _warnings_file(env, LATER).exists()


def test_warnings_missing_skips_a_date_whose_impact_window_is_not_closed(env, iem):
    env.add_day(LATER)
    shutil.copy(
        env.swaths / f"swaths-{LATER}.parquet", env.swaths / f"swaths-{OPEN_WINDOW}.parquet"
    )

    assert cli.main(["warnings", "--missing"]) == 0

    assert [u.split("begints=")[1][:17] for u in iem.urls] == ["2024-05-28T12:00Z"]
    assert not _warnings_file(env, OPEN_WINDOW).exists()


def test_warnings_missing_fetches_an_empty_file_again_only_for_a_fresh_date(env, iem):
    fresh = date(2024, 5, 30)  # window closed at RUN_TIME, 2 days old: inside FRESH_DAYS
    env.add_day(LATER)  # 4 days old: past FRESH_DAYS
    shutil.copy(env.swaths / f"swaths-{LATER}.parquet", env.swaths / f"swaths-{fresh}.parquet")
    empty = sbw.parse(json.dumps({"type": "FeatureCollection", "features": []}), LATER)
    for storm_date in (LATER, fresh):
        files.write_atomic(empty, _warnings_file(env, storm_date), sbw.METADATA)

    assert cli.main(["warnings", "--missing"]) == 0

    assert [u.split("begints=")[1][:17] for u in iem.urls] == ["2024-05-30T12:00Z"]


def test_an_explicit_warnings_rerun_writes_the_same_bytes(env, iem):
    cli.main(["warnings", "2024-05-28"])
    first = _warnings_file(env, LATER).read_bytes()

    cli.main(["warnings", "2024-05-28"])

    assert _warnings_file(env, LATER).read_bytes() == first
    assert len(iem.urls) == 2
    assert list(env.warnings.glob("*.tmp")) == []


def test_warnings_exits_1_with_one_line_and_no_file_when_iem_answers_5xx_three_times(
    env, monkeypatch, capsys
):
    calls = []

    def urlopen(url, timeout=None):
        calls.append(url)
        raise urllib.error.HTTPError(url, 503, "Service Unavailable", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(cli.sbw.net.time, "sleep", lambda s: None)

    assert cli.main(["warnings", "2024-05-28"]) == 1

    assert len(calls) == 3
    line, summary = capsys.readouterr().err.splitlines()
    assert "2024-05-28" in line and "503" in line
    assert summary == "warnings failed for: 2024-05-28"
    assert not env.warnings.exists() or list(env.warnings.iterdir()) == []


def test_a_failed_warnings_date_does_not_stop_the_later_date(env, iem, monkeypatch, capsys):
    serve = urllib.request.urlopen  # the Iem stub

    def urlopen(url, timeout=None):
        if "begints=2023-06-23" in url:
            raise urllib.error.HTTPError(url, 503, "Service Unavailable", {}, None)
        return serve(url, timeout=timeout)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(cli.sbw.net.time, "sleep", lambda s: None)

    assert cli.main(["warnings", "2023-06-23", "2024-05-28"]) == 1

    assert _warnings_file(env, LATER).exists()
    assert not _warnings_file(env, EARLIER).exists()
    captured = capsys.readouterr()
    assert captured.out == "2024-05-28: 5 warnings\n"
    failure, summary = captured.err.splitlines()
    assert "2023-06-23" in failure and "503" in failure
    assert summary == "warnings failed for: 2023-06-23"


def test_warnings_exits_1_naming_the_eventid_for_a_null_geometry_and_writes_no_file(
    env, iem, capsys
):
    feed = json.loads(iem.body)
    next(f for f in feed["features"] if f["properties"]["eventid"] == 101)["geometry"] = None
    iem.body = json.dumps(feed).encode()

    assert cli.main(["warnings", "2024-05-28"]) == 1

    assert "warning 101 has no geometry" in capsys.readouterr().err
    assert not env.warnings.exists() or list(env.warnings.iterdir()) == []


@pytest.mark.parametrize("argv", [["warnings"], ["warnings", "--missing", "2024-05-28"]])
def test_warnings_takes_storm_dates_or_missing_and_not_both_or_neither(env, iem, argv):
    with pytest.raises(SystemExit) as stop:
        cli.main(argv)

    assert stop.value.code == 2
    assert iem.urls == []


EAGLEI_CSV = FIXTURES / "eaglei_5col.csv"
FIGSHARE_LISTING = json.dumps(
    [
        {"id": 301, "name": "MCC.csv"},
        {"id": 111, "name": "eaglei_outages_2024.csv"},
        {"id": 222, "name": "eaglei_outages_2023.csv"},
    ]
).encode()


class Response(io.BytesIO):
    """A response body with the one header `net.open_stream` reads."""

    def __init__(self, body: bytes, declared: int | None = None):
        super().__init__(body)
        self._declared = len(body) if declared is None else declared

    def getheader(self, name: str) -> str | None:
        return str(self._declared) if name == "Content-Length" else None


class Figshare:
    """The Figshare boundary: urlopen serves the file listing and the year CSV."""

    def __init__(self):
        self.csv = EAGLEI_CSV.read_bytes()
        self.listing = FIGSHARE_LISTING
        self.declared: int | None = None
        self.urls: list[str] = []


@pytest.fixture
def figshare(monkeypatch):
    figshare = Figshare()

    def urlopen(url, timeout=None):
        figshare.urls.append(url)
        if url == power.LISTING_URL:
            return Response(figshare.listing)
        return Response(figshare.csv, figshare.declared)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    return figshare


def _eaglei_file(env, year):
    return env.eaglei / f"eaglei-{year}.parquet"


def test_eaglei_writes_one_parquet_per_year_with_the_eaglei_and_customers_out_metadata(
    env, figshare, capsys
):
    assert cli.main(["eaglei", "2024"]) == 0

    path = _eaglei_file(env, 2024)
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"eaglei", b"customers-out")
    assert pd.read_parquet(path)["fips"].tolist() == ["48039", "48157", "48201", "48201", "48201"]
    assert capsys.readouterr().out == "2024: 5 metro rows\n"
    assert figshare.urls == [power.LISTING_URL, "https://ndownloader.figshare.com/files/111"]


def test_two_eaglei_runs_write_the_same_bytes_and_leave_no_tmp_file(env, figshare):
    cli.main(["eaglei", "2024"])
    first = _eaglei_file(env, 2024).read_bytes()

    cli.main(["eaglei", "2024"])

    assert _eaglei_file(env, 2024).read_bytes() == first
    assert list(env.eaglei.glob("*.tmp")) == []


def test_a_broken_eaglei_stream_exits_1_with_one_line_and_leaves_no_file(env, figshare, capsys):
    figshare.declared = len(figshare.csv) + 100

    assert cli.main(["eaglei", "2024"]) == 1

    (line,) = capsys.readouterr().err.splitlines()
    assert line.startswith("EAGLE-I 2024 stream failed")
    assert not env.eaglei.exists() or list(env.eaglei.iterdir()) == []


def test_a_year_without_a_figshare_file_exits_1_and_names_the_file(env, figshare, capsys):
    assert cli.main(["eaglei", "1999"]) == 1

    assert capsys.readouterr().err == "EAGLE-I 1999: no file eaglei_outages_1999.csv in Figshare\n"
    assert figshare.urls == [power.LISTING_URL]


@pytest.mark.parametrize(
    "listing",
    [
        b"{",
        b'{"name": "eaglei_outages_2024.csv"}',
        b'["eaglei_outages_2024.csv"]',
        b'[{"id": 111}]',
        b'[{"name": "eaglei_outages_2024.csv"}]',
    ],
)
def test_a_figshare_listing_that_is_not_a_list_of_files_exits_1_with_one_line(
    env, figshare, capsys, listing
):
    figshare.listing = listing

    assert cli.main(["eaglei", "2024"]) == 1

    (line,) = capsys.readouterr().err.splitlines()
    assert line == "EAGLE-I 2024: the Figshare listing is not a list of files"
    assert figshare.urls == [power.LISTING_URL]


@pytest.mark.parametrize("file_id", ['"1/../x"', "true", "0", "-5", "1.5", "null"])
def test_a_figshare_file_id_that_is_not_a_positive_whole_number_exits_1_naming_the_file(
    env, figshare, capsys, file_id
):
    figshare.listing = f'[{{"name": "eaglei_outages_2024.csv", "id": {file_id}}}]'.encode()

    assert cli.main(["eaglei", "2024"]) == 1

    (line,) = capsys.readouterr().err.splitlines()
    assert line == (
        "EAGLE-I 2024: the id of eaglei_outages_2024.csv is not a positive whole number"
    )
    assert figshare.urls == [power.LISTING_URL]


def test_a_failed_figshare_listing_request_exits_1_with_one_line(env, monkeypatch, capsys):
    def urlopen(url, timeout=None):
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)

    assert cli.main(["eaglei", "2024"]) == 1

    (line,) = capsys.readouterr().err.splitlines()
    assert line.startswith("EAGLE-I 2024: the Figshare listing failed")
    assert "404" in line


def test_eaglei_stops_at_the_first_failed_year(env, figshare, capsys):
    assert cli.main(["eaglei", "1999", "2024"]) == 1

    assert not _eaglei_file(env, 2024).exists()


@pytest.mark.parametrize("argv", [["eaglei"], ["eaglei", "24"], ["eaglei", "2024-05-28"]])
def test_eaglei_takes_one_or_more_four_digit_years(env, figshare, argv):
    with pytest.raises(SystemExit) as stop:
        cli.main(argv)

    assert stop.value.code == 2
    assert figshare.urls == []


def _write_eaglei(env, year, *rows):
    """Write the EAGLE-I year file of the metro counties from (fips, time, customers_out) rows."""
    frame = pd.DataFrame(
        {
            "fips": [fips for fips, _, _ in rows],
            "time_utc": pd.to_datetime([time for _, time, _ in rows], utc=True),
            "customers_out": pd.array([out for _, _, out in rows], dtype="Int64"),
        }
    )
    return files.write_atomic(frame, env.eaglei / power.file_name(year), power.METADATA)


def _power_file(env, storm_date):
    return env.power / power.day_file_name(storm_date)


HARRIS_ROWS = (("48201", "2024-05-28 20:00", 251_830), ("48201", "2024-05-28 20:15", 0))


def test_power_writes_the_192_step_window_of_each_county_with_the_eaglei_metadata(env, capsys):
    _write_eaglei(env, 2024, *HARRIS_ROWS)

    assert cli.main(["power", "2024-05-28"]) == 0

    path = _power_file(env, LATER)
    frame = pd.read_parquet(path)
    assert list(frame.columns) == ["fips", "step_utc", "customers_out"]
    assert len(frame) == 8 * 192
    assert frame["customers_out"].eq(0).sum() == 1
    assert frame["customers_out"].notna().sum() == 2
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"eaglei", b"customers-out")
    assert capsys.readouterr().out == "2024-05-28: 2 of 1536 county steps have a row\n"


def test_two_explicit_power_runs_write_the_same_bytes_and_leave_no_tmp_file(env):
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    cli.main(["power", "2024-05-28"])
    first = _power_file(env, LATER).read_bytes()

    cli.main(["power", "2024-05-28"])

    assert _power_file(env, LATER).read_bytes() == first
    assert list(env.power.glob("*.tmp")) == []


def test_power_for_a_date_without_an_eaglei_year_file_or_an_odin_slot_exits_1_and_writes_nothing(
    env, capsys
):
    assert cli.main(["power", "2024-05-28"]) == 1

    assert capsys.readouterr().err == (
        "2024-05-28: no EAGLE-I file for 2024 and no ODIN snapshot in the window, "
        "run hailprint eaglei 2024 first\n"
    )
    assert not env.power.exists() or list(env.power.iterdir()) == []


def _write_odin(env, day, *rows):
    """Write the ODIN day file from (slot, fips, utility, customers_out) rows."""
    frame = pd.DataFrame(
        {
            "slot_utc": pd.to_datetime([slot for slot, *_ in rows], utc=True).as_unit("us"),
            "fips": [fips for _, fips, _, _ in rows],
            "utility": [utility for _, _, utility, _ in rows],
            "customers_out": [out for _, _, _, out in rows],
        }
    )
    path = env.odin / odin.file_name(date.fromisoformat(day))
    return files.write_atomic(frame, path, odin.METADATA)


ODIN_ROWS = (
    ("2024-05-28 14:00", "48201", "CENTERPOINT ENERGY", 714),
    ("2024-05-28 14:00", "48291", odin.NO_INCIDENT, 0),
)


def test_power_for_a_date_without_an_eaglei_file_reads_the_odin_day_files(env, capsys):
    _write_odin(env, "2024-05-28", *ODIN_ROWS)

    assert cli.main(["power", "2024-05-28"]) == 0

    path = _power_file(env, LATER)
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"odin", ODIN_PRODUCT)
    assert json.loads(metadata[b"utilities"]) == ["CENTERPOINT ENERGY"]
    frame = pd.read_parquet(path)
    assert frame["customers_out"].notna().sum() == 1
    assert capsys.readouterr().out == "2024-05-28: 1 of 1536 county steps have a row\n"


def test_power_missing_replaces_an_odin_file_with_an_eaglei_file_once_eaglei_covers_it(env):
    env.add_day(LATER)
    _write_odin(env, "2024-05-28", *ODIN_ROWS)
    assert cli.main(["power", "--missing"]) == 0
    assert pq.read_schema(_power_file(env, LATER)).metadata[b"source"] == b"odin"
    first = _power_file(env, LATER).stat().st_mtime_ns
    assert cli.main(["power", "--missing"]) == 0
    assert _power_file(env, LATER).stat().st_mtime_ns == first  # no EAGLE-I file yet: kept

    _write_eaglei(env, 2024, *HARRIS_ROWS)
    assert cli.main(["power", "--missing"]) == 0

    path = _power_file(env, LATER)
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"eaglei", b"customers-out")
    assert b"utilities" not in metadata
    assert pd.read_parquet(path)["customers_out"].notna().sum() == 2


def test_power_missing_makes_a_second_run_write_nothing(env, capsys):
    env.add_day(LATER)
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    assert cli.main(["power", "--missing"]) == 0
    first = _power_file(env, LATER).stat().st_mtime_ns
    capsys.readouterr()

    assert cli.main(["power", "--missing"]) == 0

    assert _power_file(env, LATER).stat().st_mtime_ns == first
    assert capsys.readouterr().out == ""


def test_power_missing_skips_a_date_whose_impact_window_is_not_closed(env):
    env.add_day(LATER)
    shutil.copy(
        env.swaths / f"swaths-{LATER}.parquet", env.swaths / f"swaths-{OPEN_WINDOW}.parquet"
    )
    _write_eaglei(env, 2024, *HARRIS_ROWS)

    assert cli.main(["power", "--missing"]) == 0

    assert _power_file(env, LATER).exists()
    assert not _power_file(env, OPEN_WINDOW).exists()


def test_power_missing_skips_a_date_without_a_power_source_and_exits_0(env, capsys):
    env.add_day(LATER)  # 2024
    env.add_day(EARLIER)  # 2023
    _write_eaglei(env, 2023, ("48201", "2023-06-23 22:00", 11))

    assert cli.main(["power", "--missing"]) == 0

    assert _power_file(env, EARLIER).exists()
    assert not _power_file(env, LATER).exists()
    assert capsys.readouterr().out.splitlines() == [
        "2023-06-23: 1 of 1536 county steps have a row",
        "1 date skipped without an EAGLE-I file or an ODIN snapshot",
    ]


def test_power_for_two_dates_writes_the_second_when_the_first_fails_and_exits_1(
    env, capsys, monkeypatch
):
    _write_eaglei(env, 2023, ("48201", "2023-06-23 22:00", 11))
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    build = power.build

    def failing_first(storm_date, *args):
        if storm_date == EARLIER:
            raise ValueError("broken source")
        return build(storm_date, *args)

    monkeypatch.setattr(power, "build", failing_first)

    assert cli.main(["power", str(EARLIER), str(LATER)]) == 1

    assert not _power_file(env, EARLIER).exists()
    assert _power_file(env, LATER).exists()
    captured = capsys.readouterr()
    assert captured.err.splitlines() == [
        "2023-06-23: broken source",
        "power failed for: 2023-06-23",
    ]
    assert captured.out == "2024-05-28: 2 of 1536 county steps have a row\n"


def test_power_missing_rebuilds_a_power_file_that_is_not_a_parquet_file(env):
    env.add_day(LATER)
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    env.power.mkdir(parents=True)
    _power_file(env, LATER).write_bytes(b"junk")

    assert cli.main(["power", "--missing"]) == 0

    path = _power_file(env, LATER)
    assert pq.read_schema(path).metadata[b"source"] == b"eaglei"
    assert pd.read_parquet(path)["customers_out"].notna().sum() == 2


def test_power_missing_rebuilds_a_power_file_that_has_no_source_metadata(env):
    env.add_day(LATER)
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    env.power.mkdir(parents=True)
    pd.DataFrame({"fips": ["48201"]}).to_parquet(_power_file(env, LATER))

    assert cli.main(["power", "--missing"]) == 0

    assert pq.read_schema(_power_file(env, LATER)).metadata[b"source"] == b"eaglei"


def test_a_window_across_new_year_needs_both_year_files(env, capsys):
    new_year_eve = "2023-12-31"
    _write_eaglei(env, 2023, ("48201", "2023-12-31 23:45", 7))

    assert cli.main(["power", new_year_eve]) == 1

    assert "run hailprint eaglei 2024 first" in capsys.readouterr().err
    _write_eaglei(env, 2024, ("48201", "2024-01-01 00:00", 9))

    assert cli.main(["power", new_year_eve]) == 0

    day = pd.read_parquet(env.power / "power-2023-12-31.parquet")
    assert day.loc[day["fips"] == "48201", "customers_out"].dropna().tolist() == [7, 9]


@pytest.mark.parametrize("argv", [["power"], ["power", "--missing", "2024-05-28"]])
def test_power_takes_storm_dates_or_missing_and_not_both_or_neither(env, argv):
    with pytest.raises(SystemExit) as stop:
        cli.main(argv)

    assert stop.value.code == 2


def _internet_file(env, storm_date):
    return env.internet / f"internet-{storm_date}.parquet"


def _add_signal(ioda, storm_date, value=1000):
    """Serve a steady Harris signal from 7 days before the window to its end."""
    start, end = sbw.window(storm_date)
    first = int(start.timestamp()) - internet.BASELINE_DAYS * 86400
    ioda.add("48201", first, int(end.timestamp()), value)


def test_internet_writes_one_parquet_per_date_with_the_ioda_metadata(env, ioda, capsys):
    _add_signal(ioda, LATER)

    assert cli.main(["internet", "2024-05-28"]) == 0

    path = _internet_file(env, LATER)
    day = pd.read_parquet(path)
    assert list(day.columns) == ["fips", "step_utc", "value", "baseline", "ratio"]
    assert day.loc[day["fips"] == "48201", "ratio"].eq(1.0).all()
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"ioda", b"ping-slash24")
    assert capsys.readouterr().out == "2024-05-28: 192 of 1536 county steps have a ratio\n"
    assert len(ioda.urls) == 8


def test_internet_missing_makes_no_second_request_for_a_date_that_has_a_file(env, ioda):
    env.add_day(LATER)
    _add_signal(ioda, LATER)

    assert cli.main(["internet", "--missing"]) == 0
    assert cli.main(["internet", "--missing"]) == 0

    assert len(ioda.urls) == 8
    assert _internet_file(env, LATER).exists()


def test_internet_keeps_a_file_with_no_ratio_and_missing_skips_it(env, ioda, capsys):
    env.add_day(LATER)  # IODA holds no signal for the date

    assert cli.main(["internet", "--missing"]) == 0

    assert pd.read_parquet(_internet_file(env, LATER))["ratio"].isna().all()
    assert capsys.readouterr().out == "2024-05-28: 0 of 1536 county steps have a ratio\n"
    asked = len(ioda.urls)

    assert cli.main(["internet", "--missing"]) == 0

    assert len(ioda.urls) == asked
    assert capsys.readouterr().out == ""


def test_internet_missing_asks_again_for_an_all_null_file_only_while_the_date_is_fresh(env, ioda):
    fresh = date(2024, 5, 30)  # window closed at RUN_TIME, 2 days old: inside FRESH_DAYS
    env.add_day(LATER)  # 4 days old: past FRESH_DAYS
    shutil.copy(env.swaths / f"swaths-{LATER}.parquet", env.swaths / f"swaths-{fresh}.parquet")
    for storm_date in (LATER, fresh):
        files.write_atomic(
            internet.derive(storm_date, {}), _internet_file(env, storm_date), internet.METADATA
        )

    assert cli.main(["internet", "--missing"]) == 0

    asked = {parse_qs(urlsplit(u).query)["from"][0] for u in ioda.urls}
    assert asked == {str(int(sbw.window(fresh)[0].timestamp()) - internet.BASELINE_DAYS * 86400)}


def test_internet_missing_fetches_again_a_date_whose_file_cannot_be_read(env, ioda):
    env.add_day(LATER)
    _add_signal(ioda, LATER)
    env.internet.mkdir(parents=True, exist_ok=True)
    _internet_file(env, LATER).write_bytes(b"not a parquet file")

    assert cli.main(["internet", "--missing"]) == 0

    assert pd.read_parquet(_internet_file(env, LATER))["ratio"].eq(1.0).any()


def test_internet_missing_skips_a_date_whose_impact_window_is_not_closed(env, ioda):
    env.add_day(LATER)
    shutil.copy(
        env.swaths / f"swaths-{LATER}.parquet", env.swaths / f"swaths-{OPEN_WINDOW}.parquet"
    )

    assert cli.main(["internet", "--missing"]) == 0

    assert _internet_file(env, LATER).exists()
    assert not _internet_file(env, OPEN_WINDOW).exists()


def test_an_explicit_internet_rerun_writes_the_same_bytes(env, ioda):
    _add_signal(ioda, LATER)
    cli.main(["internet", "2024-05-28"])
    first = _internet_file(env, LATER).read_bytes()

    cli.main(["internet", "2024-05-28"])

    assert _internet_file(env, LATER).read_bytes() == first
    assert list(env.internet.glob("*.tmp")) == []


def test_internet_exits_1_with_one_line_and_no_file_when_ioda_times_out(env, ioda, capsys):
    ioda.error = TimeoutError("timed out")

    assert cli.main(["internet", "2024-05-28"]) == 1

    assert len(ioda.urls) == 3  # one county, 3 tries, then the date fails
    line, summary = capsys.readouterr().err.splitlines()
    assert line.startswith("2024-05-28: IODA 48039") and "timed out" in line
    assert summary == "internet failed for: 2024-05-28"
    assert not env.internet.exists() or list(env.internet.iterdir()) == []


def test_internet_exits_1_when_ioda_answers_5xx_three_times(env, ioda, capsys):
    ioda.error = urllib.error.HTTPError("https://ioda", 503, "Service Unavailable", {}, None)

    assert cli.main(["internet", "2024-05-28"]) == 1

    assert "503" in capsys.readouterr().err
    assert not env.internet.exists() or list(env.internet.iterdir()) == []


def test_a_failed_internet_date_does_not_stop_the_later_date(env, ioda, monkeypatch, capsys):
    _add_signal(ioda, LATER)
    answer = urllib.request.urlopen  # the Ioda stub
    earlier_from = int(sbw.window(EARLIER)[0].timestamp()) - internet.BASELINE_DAYS * 86400

    def urlopen(url, timeout=None):
        if f"from={earlier_from}&" in url:
            raise TimeoutError("timed out")
        return answer(url, timeout=timeout)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)

    assert cli.main(["internet", "2023-06-23", "2024-05-28"]) == 1

    assert _internet_file(env, LATER).exists()
    assert not _internet_file(env, EARLIER).exists()
    captured = capsys.readouterr()
    assert captured.out == "2024-05-28: 192 of 1536 county steps have a ratio\n"
    assert captured.err.splitlines()[-1] == "internet failed for: 2023-06-23"


@pytest.mark.parametrize("argv", [["internet"], ["internet", "--missing", "2024-05-28"]])
def test_internet_takes_storm_dates_or_missing_and_not_both_or_neither(env, ioda, argv):
    with pytest.raises(SystemExit) as stop:
        cli.main(argv)

    assert stop.value.code == 2
    assert ioda.urls == []


ODIN_LIVE = FIXTURES / "odin_grouped.json"
ODIN_MIXED = FIXTURES / "odin_mixed.json"
ODIN_PRODUCT = b"odin-real-time-outages-county"


class OdinFeed:
    """A stub ODIN endpoint: the answer body, the fetch time, and the URLs asked."""

    def __init__(self, monkeypatch):
        self.body = ODIN_LIVE.read_bytes()
        self.urls: list[str] = []
        self.monkeypatch = monkeypatch
        self.at(2024, 5, 28, 14, 7)

    def at(self, year, month, day, hour, minute, second=0):
        moment = datetime(year, month, day, hour, minute, second, tzinfo=UTC)
        self.monkeypatch.setattr(cli, "_utc_now", lambda: moment)


@pytest.fixture
def odin_feed(env, monkeypatch):
    feed = OdinFeed(monkeypatch)

    @contextmanager
    def urlopen(url, timeout=None):
        feed.urls.append(url)
        yield io.BytesIO(feed.body)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    return feed


def _odin_file(env, day="2024-05-28"):
    return env.odin / f"odin-{day}.parquet"


def test_odin_writes_the_day_file_with_the_14_00_slot_and_the_odin_metadata(env, odin_feed, capsys):
    """O8: a fetch at 14:07 UTC gives the 14:00 slot."""
    assert cli.main(["odin"]) == 0

    path = _odin_file(env)
    frame = pd.read_parquet(path)
    assert set(frame["slot_utc"]) == {pd.Timestamp("2024-05-28 14:00", tz="UTC")}
    assert len(frame) == 8
    assert frame.loc[frame["fips"] == "48201", "customers_out"].tolist() == [714]
    metadata = pq.read_schema(path).metadata
    assert (metadata[b"source"], metadata[b"product"]) == (b"odin", ODIN_PRODUCT)
    assert b"confidence" in metadata
    assert capsys.readouterr().out == "2024-05-28 14:00 UTC: 8 rows\n"
    assert len(odin_feed.urls) == 1
    assert list(env.odin.glob("*.tmp")) == []


def test_odin_at_23_59_59_utc_stays_in_its_utc_day(env, odin_feed):
    odin_feed.at(2024, 5, 28, 23, 59, 59)

    assert cli.main(["odin"]) == 0

    frame = pd.read_parquet(_odin_file(env))
    assert set(frame["slot_utc"]) == {pd.Timestamp("2024-05-28 23:45", tz="UTC")}
    assert [p.name for p in env.odin.iterdir()] == ["odin-2024-05-28.parquet"]


def test_a_run_after_midnight_utc_starts_the_next_day_file(env, odin_feed):
    cli.main(["odin"])
    odin_feed.at(2024, 5, 29, 0, 3)

    assert cli.main(["odin"]) == 0

    assert sorted(p.name for p in env.odin.iterdir()) == [
        "odin-2024-05-28.parquet",
        "odin-2024-05-29.parquet",
    ]


def test_two_odin_runs_in_one_slot_leave_one_row_per_fips_and_utility(env, odin_feed):
    cli.main(["odin"])
    odin_feed.body = ODIN_MIXED.read_bytes()
    odin_feed.at(2024, 5, 28, 14, 12)

    assert cli.main(["odin"]) == 0

    frame = pd.read_parquet(_odin_file(env))
    assert not frame.duplicated(["slot_utc", "fips", "utility"]).any()
    assert len(frame) == 9
    assert frame.loc[frame["fips"] == "48201", "customers_out"].sum() == 720  # the second answer
    assert list(env.odin.glob("*.tmp")) == []


def test_a_later_slot_adds_its_rows_to_the_day_file(env, odin_feed):
    cli.main(["odin"])
    first = pd.read_parquet(_odin_file(env))
    odin_feed.at(2024, 5, 28, 14, 22)

    assert cli.main(["odin"]) == 0

    frame = pd.read_parquet(_odin_file(env))
    assert frame["slot_utc"].nunique() == 2
    assert frame.iloc[: len(first)].reset_index(drop=True).equals(first)


@pytest.mark.parametrize("body", [b"{", b"", b'{"total": 1}', b"[]"])
def test_odin_with_a_bad_body_exits_1_with_one_line_and_writes_no_file(
    env, odin_feed, capsys, body
):
    odin_feed.body = body

    assert cli.main(["odin"]) == 1

    err = capsys.readouterr().err
    assert err.startswith("ODIN") and len(err.splitlines()) == 1
    assert not env.odin.exists() or list(env.odin.iterdir()) == []


def test_a_failed_odin_fetch_leaves_the_old_day_file_and_exits_1(
    env, odin_feed, monkeypatch, capsys
):
    cli.main(["odin"])
    before = _odin_file(env).read_bytes()
    calls = []

    def urlopen(url, timeout=None):
        calls.append(url)
        raise urllib.error.HTTPError(url, 503, "Service Unavailable", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(odin.net.time, "sleep", lambda s: None)
    odin_feed.at(2024, 5, 28, 14, 22)
    capsys.readouterr()

    assert cli.main(["odin"]) == 1

    assert len(calls) == 3
    err = capsys.readouterr().err
    assert "ODIN fetch failed" in err and "503" in err
    assert _odin_file(env).read_bytes() == before
    assert list(env.odin.glob("*.tmp")) == []


def test_a_day_file_that_cannot_be_read_stops_the_run_and_keeps_its_bytes(env, odin_feed, capsys):
    env.odin.mkdir()
    _odin_file(env).write_bytes(b"not a parquet file")

    assert cli.main(["odin"]) == 1

    assert _odin_file(env).read_bytes() == b"not a parquet file"
    assert capsys.readouterr().err != ""


def test_a_reader_thread_that_opens_the_day_file_during_a_write_sees_the_old_file_whole(
    env, odin_feed, monkeypatch
):
    """The rename is the only moment the target changes: the reader gets the old or the new file.

    A free-running reader would block the rename on Windows, so the reader runs at the moment
    just before the rename, when the temp file is complete and the target is still the old file.
    """
    cli.main(["odin"])
    path = _odin_file(env)
    old = pd.read_parquet(path)
    seen: dict[str, pd.DataFrame] = {}
    real_replace = Path.replace

    def replace(self, target):
        reader = threading.Thread(target=lambda: seen.update(during=pd.read_parquet(path)))
        reader.start()
        reader.join()
        result = real_replace(self, target)
        seen["after"] = pd.read_parquet(path)
        return result

    monkeypatch.setattr(Path, "replace", replace)
    odin_feed.at(2024, 5, 28, 14, 22)

    assert cli.main(["odin"]) == 0

    pd.testing.assert_frame_equal(seen["during"], old)
    assert len(seen["after"]) == 2 * len(old)
    assert seen["after"].iloc[: len(old)].reset_index(drop=True).equals(old)


def test_odin_takes_no_arguments(env, odin_feed):
    with pytest.raises(SystemExit) as stop:
        cli.main(["odin", "2024-05-28"])

    assert stop.value.code == 2
    assert odin_feed.urls == []


def test_the_odin_command_ignores_the_publish_lock_and_writes_only_the_odin_directory(
    env, odin_feed
):
    env.site.mkdir(parents=True)
    (env.site / "publish.lock").write_text("1", encoding="utf-8")

    assert cli.main(["odin"]) == 0

    assert sorted(p.name for p in env.site.iterdir()) == ["publish.lock"]
    assert [p.name for p in env.odin.iterdir()] == ["odin-2024-05-28.parquet"]
    assert not env.swaths.exists() and not env.power.exists()


def test_a_second_odin_run_stops_while_the_odin_lock_is_held(env, odin_feed, capsys):
    cli.main(["odin"])
    before = _odin_file(env).read_bytes()
    lock = env.odin / "odin.lock"
    lock.write_text("1", encoding="utf-8")
    odin_feed.at(2024, 5, 28, 14, 22)
    capsys.readouterr()

    assert cli.main(["odin"]) == 1

    assert "another run holds it" in capsys.readouterr().err
    assert _odin_file(env).read_bytes() == before
    assert lock.read_text(encoding="utf-8") == "1"


def test_an_odin_run_removes_its_lock_when_the_day_file_cannot_be_read(env, odin_feed, capsys):
    env.odin.mkdir()
    _odin_file(env).write_bytes(b"not a parquet file")

    assert cli.main(["odin"]) == 1

    assert "not a readable ODIN day file" in capsys.readouterr().err
    assert not (env.odin / "odin.lock").exists()


def _published(env, storm_date, name):
    return json.loads((env.storm_dir(storm_date) / name).read_text(encoding="utf-8"))


def test_publish_writes_power_json_from_the_eaglei_power_file_of_the_date(env):
    env.add_day(LATER)
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    cli.main(["power", "2024-05-28"])

    assert cli.main(["publish", "2024-05-28"]) == 0

    doc = _published(env, LATER, publish.POWER_FILE)
    publish.validate(doc, "power")
    assert (doc["source"], doc["utilities"]) == ("eaglei", None)
    assert [s["source"] for s in doc["receipt"]["sources"]] == ["eaglei"]
    assert env.index()["storms"][0]["files"]["power"] == f"storms/{LATER}/{publish.POWER_FILE}"


def test_publish_writes_the_odin_utilities_into_power_json(env):
    env.add_day(LATER)
    _write_odin(env, "2024-05-28", *ODIN_ROWS)
    cli.main(["power", "2024-05-28"])

    assert cli.main(["publish", "2024-05-28"]) == 0

    doc = _published(env, LATER, publish.POWER_FILE)
    assert (doc["source"], doc["utilities"]) == ("odin", ["CENTERPOINT ENERGY"])


def test_publish_without_a_power_file_writes_no_power_json_and_nulls_the_entry(env):
    env.add_day(LATER)

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert not (env.storm_dir(LATER) / publish.POWER_FILE).exists()
    assert env.index()["storms"][0]["files"]["power"] is None


def test_publish_removes_a_stale_power_json_when_the_power_file_is_gone(env):
    env.add_day(LATER)
    _write_eaglei(env, 2024, *HARRIS_ROWS)
    cli.main(["power", "2024-05-28"])
    cli.main(["publish", "2024-05-28"])
    _power_file(env, LATER).unlink()

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert not (env.storm_dir(LATER) / publish.POWER_FILE).exists()
    assert env.index()["storms"][0]["files"]["power"] is None


def test_publish_exits_1_and_names_the_file_for_a_power_file_without_metadata(env, capsys):
    env.add_day(LATER)
    frame = pd.DataFrame(
        {"fips": [], "step_utc": pd.to_datetime([], utc=True), "customers_out": []}
    )
    env.power.mkdir(parents=True)
    frame.to_parquet(_power_file(env, LATER))

    assert cli.main(["publish", "2024-05-28"]) == 1

    assert "power-2024-05-28.parquet" in capsys.readouterr().err
    assert not env.storm_dir(LATER).exists()


def test_publish_writes_warnings_geojson_from_the_warnings_file_and_removes_it_when_gone(env, iem):
    env.add_day(LATER)
    cli.main(["warnings", "2024-05-28"])

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert (env.storm_dir(LATER) / publish.WARNINGS_FILE).exists()
    assert env.index()["storms"][0]["files"]["warnings"] == f"storms/{LATER}/warnings.geojson"
    _warnings_file(env, LATER).unlink()

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert not (env.storm_dir(LATER) / publish.WARNINGS_FILE).exists()
    assert env.index()["storms"][0]["files"]["warnings"] is None


def test_publish_with_internet_writes_internet_json_and_sets_the_index_entry(env, ioda):
    env.add_day(LATER)
    _add_signal(ioda, LATER)
    cli.main(["internet", "2024-05-28"])

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    doc = _published(env, LATER, publish.INTERNET_FILE)
    publish.validate(doc, "internet")
    assert [s["source"] for s in doc["receipt"]["sources"]] == ["ioda"]
    harris = doc["counties"][0]
    assert (harris["fips"], harris["baseline"]) == ("48201", 1000)
    assert harris["ratio"] == [1.0] * 192
    entry = env.index()["storms"][0]["files"]
    assert entry["internet"] == f"storms/{LATER}/{publish.INTERNET_FILE}"


def test_publish_without_the_flag_leaves_internet_unpublished_when_the_file_exists(env, ioda):
    env.add_day(LATER)
    _add_signal(ioda, LATER)
    cli.main(["internet", "2024-05-28"])

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert not (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    assert env.index()["storms"][0]["files"]["internet"] is None


def test_publish_with_internet_skips_a_file_that_holds_no_ratio(env, ioda):
    env.add_day(LATER)
    cli.main(["internet", "2024-05-28"])  # IODA holds no signal for the date

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    assert not (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    assert env.index()["storms"][0]["files"]["internet"] is None


def test_publish_with_internet_skips_an_unreadable_file_and_publishes_the_date(env, capsys):
    env.add_day(LATER)
    env.internet.mkdir(parents=True)
    _internet_file(env, LATER).write_bytes(b"not a parquet file")

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    assert "internet-2024-05-28.parquet: unreadable" in capsys.readouterr().err
    assert (env.storm_dir(LATER) / publish.SWATH_FILE).exists()
    assert not (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    assert env.index()["storms"][0]["files"]["internet"] is None


def test_publish_with_internet_skips_a_file_without_a_ratio_column(env, capsys):
    env.add_day(LATER)
    env.internet.mkdir(parents=True)
    pd.DataFrame({"fips": ["48201"]}).to_parquet(_internet_file(env, LATER))

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    assert "unreadable" in capsys.readouterr().err
    assert not (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    assert env.index()["storms"][0]["files"]["internet"] is None


def test_publish_with_internet_and_no_internet_file_writes_no_internet_json(env):
    env.add_day(LATER)

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    assert not (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    assert env.index()["storms"][0]["files"]["internet"] is None


def test_publish_without_the_flag_removes_a_stale_internet_json(env, ioda):
    env.add_day(LATER)
    _add_signal(ioda, LATER)
    cli.main(["internet", "2024-05-28"])
    cli.main(["publish", "2024-05-28", "--with-internet"])
    assert (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert not (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    assert env.index()["storms"][0]["files"]["internet"] is None


def test_publish_without_the_flag_removes_the_internet_json_of_a_date_it_does_not_publish(
    env, ioda, capsys
):
    for storm_date in (LATER, EARLIER):
        env.add_day(storm_date)
        _add_signal(ioda, storm_date)
        cli.main(["internet", str(storm_date)])
    cli.main(["publish", "--with-internet"])
    assert (env.storm_dir(EARLIER) / publish.INTERNET_FILE).exists()
    capsys.readouterr()

    assert cli.main(["publish", "2024-05-28"]) == 0

    assert f"{EARLIER}: removed internet.json" in capsys.readouterr().out
    assert not (env.storm_dir(EARLIER) / publish.INTERNET_FILE).exists()
    assert {e["storm_date"]: e["files"]["internet"] for e in env.index()["storms"]} == {
        str(LATER): None,
        str(EARLIER): None,
    }


def _rewrite_internet(env, ioda, storm_date, change):
    """Write the internet file of a date, then write it again with `change` applied to the frame."""
    _add_signal(ioda, storm_date)
    cli.main(["internet", str(storm_date)])
    path = _internet_file(env, storm_date)
    files.write_atomic(change(pd.read_parquet(path)), path, internet.METADATA)


def _fail_internet_reads(monkeypatch):
    """Make `pd.read_parquet` raise ArrowTypeError for an internet file, as a mixed column does."""
    read = pd.read_parquet

    def fake(path, *args, **kwargs):
        if Path(path).name.startswith("internet-"):
            raise pa.ArrowTypeError("Expected bytes, got a 'int' object")
        return read(path, *args, **kwargs)

    monkeypatch.setattr(pd, "read_parquet", fake)


def _assert_internet_skipped(env, storm_date, capsys):
    assert f"internet-{storm_date}.parquet: unreadable" in capsys.readouterr().err
    assert (env.storm_dir(storm_date) / publish.SWATH_FILE).exists()
    assert not (env.storm_dir(storm_date) / publish.INTERNET_FILE).exists()
    entry = {e["storm_date"]: e for e in env.index()["storms"]}[str(storm_date)]
    assert entry["files"]["internet"] is None


@pytest.mark.parametrize(
    "change",
    [
        pytest.param(lambda f: f.assign(step_utc=f["step_utc"].astype(str)), id="text-step-column"),
        pytest.param(lambda f: f[f["fips"] == "48201"], id="counties-missing-from-the-window"),
        pytest.param(
            lambda f: f.assign(step_utc=f["step_utc"] + pd.Timedelta(days=9)), id="steps-off-window"
        ),
    ],
)
def test_publish_with_internet_skips_a_file_that_internet_doc_rejects(env, ioda, capsys, change):
    env.add_day(LATER)
    _rewrite_internet(env, ioda, LATER, change)

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    _assert_internet_skipped(env, LATER, capsys)


def test_publish_with_internet_skips_a_file_that_raises_arrow_type_error_on_read(
    env, ioda, monkeypatch, capsys
):
    env.add_day(LATER)
    _rewrite_internet(env, ioda, LATER, lambda f: f)
    _fail_internet_reads(monkeypatch)

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    _assert_internet_skipped(env, LATER, capsys)


def test_publish_with_internet_skips_a_file_without_the_source_metadata(env, ioda, capsys):
    env.add_day(LATER)
    _rewrite_internet(env, ioda, LATER, lambda f: f)
    path = _internet_file(env, LATER)
    pd.read_parquet(path).to_parquet(path)  # plain pandas write: no source, product, confidence

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    _assert_internet_skipped(env, LATER, capsys)


def test_publish_with_internet_removes_the_internet_json_once_the_file_goes_bad(env, ioda, capsys):
    env.add_day(LATER)
    _rewrite_internet(env, ioda, LATER, lambda f: f)
    cli.main(["publish", "2024-05-28", "--with-internet"])
    assert (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    _internet_file(env, LATER).write_bytes(b"not a parquet file")
    capsys.readouterr()

    assert cli.main(["publish", "2024-05-28", "--with-internet"]) == 0

    _assert_internet_skipped(env, LATER, capsys)


def test_a_bad_internet_file_does_not_stop_the_internet_layer_of_the_other_date(env, ioda, capsys):
    for storm_date in (LATER, EARLIER):
        env.add_day(storm_date)
        _rewrite_internet(env, ioda, storm_date, lambda f: f)
    _internet_file(env, EARLIER).write_bytes(b"not a parquet file")
    capsys.readouterr()

    assert cli.main(["publish", "--with-internet"]) == 0

    assert (env.storm_dir(LATER) / publish.INTERNET_FILE).exists()
    _assert_internet_skipped(env, EARLIER, capsys)


def test_internet_missing_fetches_a_file_that_raises_arrow_type_error_again(env, ioda, monkeypatch):
    env.add_day(LATER)
    _rewrite_internet(env, ioda, LATER, lambda f: f)
    _fail_internet_reads(monkeypatch)
    before = len(ioda.urls)

    assert cli.main(["internet", "--missing"]) == 0

    assert len(ioda.urls) == before + 8
