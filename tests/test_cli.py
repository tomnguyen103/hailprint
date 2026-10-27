"""The publish command: files, index, skips, and failures, on the two real fixture days."""

import io
import json
import shutil
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import UTC, date, datetime
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
import pytest

from hailprint import __main__ as cli
from hailprint import archive, candidates, files, parcels, publish, sbw, swath

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
    (line,) = capsys.readouterr().err.splitlines()
    assert "2024-05-28" in line and "503" in line
    assert not env.warnings.exists() or list(env.warnings.iterdir()) == []


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
