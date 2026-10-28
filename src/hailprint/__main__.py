"""Command line entry for the hailprint commands.

The commands are ``ingest``, ``index``, ``candidates``, ``parcels``, ``score``, ``warnings``,
``eaglei``, ``power``, ``odin``, ``internet``, and ``publish``.
Run ``hailprint <command> --help`` for the arguments of one command.
"""

import argparse
import math
import re
import sys
from datetime import UTC, date, datetime
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq

from hailprint import (
    archive,
    candidates,
    county,
    files,
    internet,
    mesh,
    odin,
    parcels,
    paths,
    plot,
    power,
    publish,
    reports,
    sbw,
    score,
    swath,
)

RAW_DIR = paths.RAW_DIR / "mesh"
DERIVED_DIR = paths.DERIVED_DIR / "swaths"
OUT_DIR = paths.OUT_DIR
PARCELS_GDB = paths.RAW_DIR / "hcad" / "extracted" / "Parcels.gdb"
PARCELS_DIR = paths.DERIVED_DIR / "parcels"
SCORES_DIR = paths.DERIVED_DIR / "scores"
WARNINGS_DIR = paths.DERIVED_DIR / "warnings"
EAGLEI_DIR = paths.DERIVED_DIR / "eaglei"
POWER_DIR = paths.DERIVED_DIR / "power"
ODIN_DIR = paths.DERIVED_DIR / "odin"
INTERNET_DIR = paths.DERIVED_DIR / "internet"
SITE_DATA_DIR = paths.SITE_DATA_DIR
LOCK_FILE = "publish.lock"
ODIN_LOCK_FILE = "odin.lock"


def _storm_date(text: str) -> date:
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise ValueError(text)
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {text!r}") from exc


def _year(text: str) -> int:
    if not re.fullmatch(r"\d{4}", text):
        raise argparse.ArgumentTypeError(f"not a YYYY year: {text!r}")
    return int(text)


def _radius_km(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        value = math.nan
    if not (math.isfinite(value) and 0 <= value <= score.MAX_RADIUS_KM):
        raise argparse.ArgumentTypeError(
            f"not a radius from 0 to {score.MAX_RADIUS_KM} km: {text!r}"
        )
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hailprint")
    commands = parser.add_subparsers(dest="command", required=True)
    ingest_cmd = commands.add_parser("ingest", help="write the daily-max swaths for storm dates")
    ingest_cmd.add_argument(
        "storm_dates", nargs="+", type=_storm_date, help="SPC convective day, YYYY-MM-DD"
    )
    commands.add_parser("index", help="list the MESH archive and store one row per day")
    cand = commands.add_parser("candidates", help="rank Harris County hail days by report count")
    cand.add_argument("--top", type=int, default=20, help="rows to print")
    cand.add_argument(
        "--missing",
        action="store_true",
        help="print the candidate days with a 12Z file and no swath file, newest first",
    )
    parcels_cmd = commands.add_parser(
        "parcels", help="count parcels per size class for a storm date"
    )
    parcels_cmd.add_argument("storm_date", type=_storm_date, help="SPC convective day, YYYY-MM-DD")
    score_cmd = commands.add_parser(
        "score", help="score the swaths against SPC hail reports for storm dates"
    )
    score_cmd.add_argument(
        "storm_dates",
        nargs="*",
        type=_storm_date,
        help="SPC convective day, YYYY-MM-DD; none scores every swath file",
    )
    score_cmd.add_argument(
        "--radius-km",
        type=_radius_km,
        default=score.DEFAULT_RADIUS_KM,
        help=f"scoring radius in km, 0 to {score.MAX_RADIUS_KM}, default {score.DEFAULT_RADIUS_KM}",
    )
    warnings_cmd = commands.add_parser(
        "warnings", help="store the IEM storm-based warnings of the impact window per storm date"
    )
    warnings_cmd.add_argument(
        "storm_dates", nargs="*", type=_storm_date, help="SPC convective day, YYYY-MM-DD"
    )
    warnings_cmd.add_argument(
        "--missing",
        action="store_true",
        help="fetch each swath date with a closed impact window and no warnings file",
    )
    eaglei_cmd = commands.add_parser(
        "eaglei", help="store the EAGLE-I customers out of the metro counties per year"
    )
    eaglei_cmd.add_argument("years", nargs="+", type=_year, help="calendar year, YYYY")
    power_cmd = commands.add_parser(
        "power", help="store the customers out of the metro counties per step of the impact window"
    )
    power_cmd.add_argument(
        "storm_dates", nargs="*", type=_storm_date, help="SPC convective day, YYYY-MM-DD"
    )
    power_cmd.add_argument(
        "--missing",
        action="store_true",
        help="build each swath date with a closed window, an EAGLE-I file, and no power file",
    )
    commands.add_parser(
        "odin", help="store one ODIN snapshot of the customers out of the metro counties"
    )
    internet_cmd = commands.add_parser(
        "internet",
        help="store the IODA internet reachability of the metro counties per step of the window",
    )
    internet_cmd.add_argument(
        "storm_dates", nargs="*", type=_storm_date, help="SPC convective day, YYYY-MM-DD"
    )
    internet_cmd.add_argument(
        "--missing",
        action="store_true",
        help="fetch each swath date with a closed impact window and no internet file",
    )
    publish_cmd = commands.add_parser(
        "publish", help="write the site data files and the storms index for storm dates"
    )
    publish_cmd.add_argument(
        "storm_dates",
        nargs="*",
        type=_storm_date,
        help="SPC convective day, YYYY-MM-DD; none publishes every swath file",
    )
    publish_cmd.add_argument(
        "--with-internet",
        action="store_true",
        help="also publish internet.json for each date whose internet file holds a ratio",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command in ("warnings", "power", "internet") and bool(args.storm_dates) == args.missing:
        parser.error(f"{args.command} takes storm dates or --missing, not both and not neither")
    try:
        if args.command == "ingest":
            ingest(args.storm_dates)
        elif args.command == "index":
            index()
        elif args.command == "candidates":
            rank_candidates(args.top, args.missing)
        elif args.command == "parcels":
            count_parcels(args.storm_date)
        elif args.command == "score":
            score_days(args.storm_dates, args.radius_km)
        elif args.command == "warnings":
            warn_days(args.storm_dates, args.missing)
        elif args.command == "eaglei":
            eaglei_years(args.years)
        elif args.command == "power":
            power_days(args.storm_dates, args.missing)
        elif args.command == "odin":
            odin_snapshot()
        elif args.command == "internet":
            internet_days(args.storm_dates, args.missing)
        elif args.command == "publish":
            publish_days(args.storm_dates, args.with_internet)
    except (RuntimeError, OSError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


def ingest(storm_dates: list[date]) -> list[Path]:
    """Swath file and PNG per storm date from the one 12Z file. Prints one fact per line."""
    mesh.download_many([mesh.key_for(d) for d in storm_dates], RAW_DIR)
    pngs = []
    for storm_date in storm_dates:
        da = mesh.daily_max(storm_date, RAW_DIR)
        max_mesh_mm = None if bool(da.isnull().all()) else round(float(da.max()), 2)
        swaths = swath.build_swaths(da, storm_date)
        swath.write_swaths(swaths, DERIVED_DIR / swath.file_name(storm_date), 1, max_mesh_mm)
        try:
            points = reports.harris_reports(storm_date)
            report_count = str(len(points))
        except Exception as exc:  # noqa: BLE001 - the picture still lands without points
            points = None
            report_count = "unknown (fetch failed)"
            print(f"SPC fetch failed: {exc!r}", file=sys.stderr)
        title = (
            f"Hailprint {storm_date} — radar-estimated hail size "
            f"(MESH daily max, SPC 12Z-12Z day)\n{swath.CONFIDENCE}"
        )
        png = plot.render(
            swaths, county.outline(), points, title, OUT_DIR / f"ingest-{storm_date}.png"
        )
        max_text = "none (no valid cell)" if max_mesh_mm is None else f"{max_mesh_mm} mm"
        print(f"storm date: {storm_date}")
        print(f"max MESH in bbox: {max_text}")
        print(f"SPC hail reports in Harris County: {report_count}")
        print(png)
        print(f"confidence: {swath.CONFIDENCE}")
        pngs.append(png)
    return pngs


def index() -> Path:
    """One bucket listing to the archive index. Prints the day counts."""
    df = archive.build_index()
    path = files.write_atomic(df, archive.INDEX_PATH)
    print(f"archive days: {len(df)}")
    print(f"first storm date: {df['storm_date'].iloc[0]}")
    print(f"last storm date: {df['storm_date'].iloc[-1]}")
    print(f"days without 12Z file: {int((~df['has_12z'].to_numpy()).sum())}")
    return path


def rank_candidates(top: int, missing: bool = False) -> Path:
    """Rank WCM days and the daily-CSV fill against the archive index.

    Writes the full CSV and prints the top rows. With `missing`, prints instead the top
    missing candidate days, one storm date per line, for the nightly run.
    """
    if top < 1:
        raise ValueError(f"--top must be at least 1, got {top}")
    if not archive.INDEX_PATH.exists():
        raise FileNotFoundError(f"run hailprint index first: {archive.INDEX_PATH}")
    index_df = pd.read_parquet(archive.INDEX_PATH)
    ranked = candidates.rank(candidates.all_days(candidates.fetch_database(), index_df), index_df)
    path = files.write_atomic(ranked, candidates.CANDIDATES_PATH)
    if missing:
        for storm_date in candidates.missing_days(ranked, DERIVED_DIR)[:top]:
            print(storm_date)
    else:
        print(ranked.head(top).to_string(index=False))
    return path


def count_parcels(storm_date: date) -> Path:
    """Parcels per size class and per ZIP from the swath file and the masked HCAD read."""
    swath_path = DERIVED_DIR / swath.file_name(storm_date)
    if not swath_path.exists():
        raise FileNotFoundError(f"run hailprint ingest first: {swath_path}")
    swaths = gpd.read_parquet(swath_path)
    counts, zips = parcels.count_parcels(swaths, PARCELS_GDB)
    path = files.write_atomic(counts, PARCELS_DIR / f"parcel-counts-{storm_date}.parquet")
    files.write_atomic(zips, PARCELS_DIR / f"zip-counts-{storm_date}.parquet")
    for threshold_in, parcel_count in zip(
        counts["threshold_in"], counts["parcel_count"], strict=True
    ):
        print(f">= {threshold_in:.2f} in: {parcel_count} parcels")
    print(f"confidence: {swath.CONFIDENCE}")
    return path


def _swath_files(storm_dates: list[date]) -> list[tuple[date, Path]]:
    """The swath file per storm date. An empty list selects every swath file, oldest first."""
    if storm_dates:
        found = [(d, DERIVED_DIR / swath.file_name(d)) for d in sorted(set(storm_dates))]
    else:
        found = []
        for path in sorted(DERIVED_DIR.glob("swaths-????-??-??.parquet")):
            try:
                found.append((_storm_date(path.stem.removeprefix("swaths-")), path))
            except argparse.ArgumentTypeError as exc:
                raise ValueError(f"not a swath file name: {path.name}") from exc
    for _, path in found:
        if not path.exists():
            raise FileNotFoundError(f"run hailprint ingest first: {path}")
    if not found:
        raise FileNotFoundError(f"run hailprint ingest first: no swath file in {DERIVED_DIR}")
    return found


def score_days(storm_dates: list[date], radius_km: float) -> list[Path]:
    """Pairs and score files per storm date, then the pooled table. A 404 day is skipped."""
    meta = {"radius_km": f"{radius_km:.15g}", "report_source": score.REPORT_SOURCE}
    tables, written = [], []
    for storm_date, swath_path in _swath_files(storm_dates):
        text = candidates.daily_csv(storm_date, candidates.DAILY_DIR, date.today())
        if text is None:
            continue
        day = score.score_day(
            gpd.read_parquet(swath_path),
            reports.nearby_reports(storm_date, text),
            storm_date,
            radius_km,
        )
        for name, frame in (("pairs", day.pairs), ("scores", day.table)):
            written.append(
                files.write_atomic(frame, SCORES_DIR / f"{name}-{storm_date}.parquet", meta)
            )
        tables.append(day.table)
        print(f"{storm_date}: {len(day.pairs)} scored reports, {day.excluded} excluded")
    if not tables:
        raise RuntimeError("no storm date was scored")
    pooled = score.pool(tables)
    shown = [
        "label",
        "report_count",
        *score.COUNT_COLUMNS,
        *score.AREA_COLUMNS,
        *score.METRIC_COLUMNS,
    ]
    print(f"pooled over {len(tables)} storm dates, radius {radius_km:.15g} km")
    table = pooled[shown].astype({c: object for c in score.AREA_COLUMNS + score.METRIC_COLUMNS})
    for column in score.AREA_COLUMNS:
        table[column] = [f"{v:.0f}" for v in pooled[column]]
    for column in score.METRIC_COLUMNS:
        table[column] = [f"{v:.2f}" for v in pooled[column]]
    print(table.to_string(index=False))
    if bool(((pooled["false_alarms"] + pooled["correct_negatives"]) == 0).to_numpy().any()):
        print(
            "note: a row with no report below its class has no non-event, "
            "so its FAR, CSI, and HSS hold by construction"
        )
    print(f"confidence: {swath.CONFIDENCE}")
    return written


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _warnings_settled(storm_date: date, now: datetime) -> bool:
    """True when the warnings file holds a row, or holds none for a date older than FRESH_DAYS."""
    path = WARNINGS_DIR / sbw.file_name(storm_date)
    if not path.exists():
        return False
    # a gap is never zero: an empty file of a fresh date may be a late IEM feed
    return (
        pq.read_metadata(path).num_rows > 0
        or (now.date() - storm_date).days > candidates.FRESH_DAYS
    )


def warn_days(storm_dates: list[date], missing: bool = False) -> list[Path]:
    """One warnings file per storm date from the IEM feed of the impact window.

    With `missing`, the dates are the swath dates whose window has closed and that have no
    settled warnings file. A file with zero rows settles only after `candidates.FRESH_DAYS`.
    A failed date does not stop the other dates. The run prints one line per failed date,
    then exits 1. The next `--missing` run starts again with the failed dates.
    """
    # shortcut: an explicit date runs for an open window too and writes a partial file that
    # `--missing` then skips; add a closed-window check when explicit reruns of recent days
    # become routine.
    if missing:
        now = _utc_now()
        storm_dates = [
            d
            for d, _ in _swath_files([])
            if sbw.window(d)[1] <= now and not _warnings_settled(d, now)
        ]
    written = []
    failed = []
    for storm_date in storm_dates:
        try:
            frame = sbw.parse(sbw.fetch(storm_date), storm_date)
            written.append(
                files.write_atomic(frame, WARNINGS_DIR / sbw.file_name(storm_date), sbw.METADATA)
            )
        except (RuntimeError, ValueError) as exc:
            print(f"{storm_date}: {exc}", file=sys.stderr)
            failed.append(storm_date.isoformat())
            continue
        print(f"{storm_date}: {len(frame)} warnings")
    if failed:
        raise ValueError(f"warnings failed for: {', '.join(failed)}")
    return written


def eaglei_years(years: list[int]) -> list[Path]:
    """One EAGLE-I file per year with the metro rows. The run stops at the first failed year.

    A year file is written only after the whole CSV is read, so a broken stream leaves nothing.
    """
    written = []
    for year in years:
        frame = power.fetch_year(year)
        written.append(
            files.write_atomic(frame, EAGLEI_DIR / power.file_name(year), power.METADATA)
        )
        print(f"{year}: {len(frame)} metro rows")
    return written


def power_days(storm_dates: list[date], missing: bool = False) -> list[Path]:
    """One power file per storm date, from one source: EAGLE-I when it covers the window, else ODIN.

    With `missing`, the dates are the swath dates whose window has closed and that have no power
    file, or whose power file comes from ODIN while the EAGLE-I year files now cover the window.
    A date with no source is skipped and counted. An explicit date with no source stops the run
    with exit 1. A failed date does not stop the other dates. The run prints one line per failed
    date, then exits 1.
    """
    # shortcut: an EAGLE-I year file counts as covering its year, upgrade to a check of the last
    # row time if a partial year file is ever ingested
    # shortcut: an explicit date runs for an open window too and writes a file with null future
    # steps that `--missing` then skips; add a closed-window check when explicit reruns of
    # recent days become routine.
    if missing:
        now = _utc_now()
        storm_dates = [
            d for d, _ in _swath_files([]) if sbw.window(d)[1] <= now and _needs_power(d)
        ]
    written = []
    failed = []
    skipped = 0
    for storm_date in storm_dates:
        try:
            built = power.build(storm_date, EAGLEI_DIR, ODIN_DIR)
            if built is not None:
                frame, metadata = built
                path = POWER_DIR / power.day_file_name(storm_date)
                written.append(files.write_atomic(frame, path, metadata))
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"{storm_date}: {exc}", file=sys.stderr)
            failed.append(storm_date.isoformat())
            continue
        if built is None:
            if not missing:
                absent = [
                    str(year)
                    for year in power.years_of(storm_date)
                    if not (EAGLEI_DIR / power.file_name(year)).exists()
                ]
                raise ValueError(
                    f"{storm_date}: no EAGLE-I file for {' and '.join(absent)} and no ODIN "
                    f"snapshot in the window, run hailprint eaglei {' '.join(absent)} first"
                )
            skipped += 1
            continue
        frame, _ = built
        known = frame["customers_out"].count()
        print(f"{storm_date}: {known} of {len(frame)} county steps have a row")
    if skipped:
        print(
            f"{skipped} date{'s' if skipped > 1 else ''} skipped "
            "without an EAGLE-I file or an ODIN snapshot"
        )
    if failed:
        raise ValueError(f"power failed for: {', '.join(failed)}")
    return written


def _needs_power(storm_date: date) -> bool:
    """True when the date has no power file, or has an ODIN file that EAGLE-I now replaces."""
    path = POWER_DIR / power.day_file_name(storm_date)
    if not path.exists():
        return True
    try:
        source = power.file_source(path)
    except (OSError, ValueError):
        return True  # an unreadable file is rebuilt
    if source is None:
        return True  # a file with no source metadata is rebuilt
    covered = all((EAGLEI_DIR / power.file_name(y)).exists() for y in power.years_of(storm_date))
    return covered and source == odin.METADATA["source"]


def odin_snapshot() -> Path:
    """Add one ODIN snapshot to the file of its UTC day, keyed by the 15-minute slot.

    A failed fetch, a bad answer, or an unreadable day file writes nothing and exits 1.
    A rerun in one slot replaces the rows of that slot. A run that finds the ODIN lock held
    exits 1, so two overlapping runs never merge from the same stale day file.
    """
    slot = odin.slot_of(_utc_now())
    fresh = odin.snapshot(odin.fetch(), slot)
    path = ODIN_DIR / odin.file_name(slot.date())
    with files.lock(ODIN_DIR / ODIN_LOCK_FILE):
        try:
            existing = pd.read_parquet(path) if path.exists() else None
        except (OSError, ValueError) as exc:
            raise ValueError(f"{path}: not a readable ODIN day file: {exc}") from exc
        written = files.write_atomic(odin.merge(existing, fresh), path, odin.METADATA)
    print(f"{slot:%Y-%m-%d %H:%M} UTC: {len(fresh)} rows")
    return written


def internet_days(storm_dates: list[date], missing: bool = False) -> list[Path]:
    """One internet file per storm date from the IODA county signals of the impact window.

    With `missing`, the dates are the swath dates whose window has closed and that have no
    internet file. A file with no ratio at all stays, so a date with no IODA signal costs no
    request on a later run. A failed date writes no file and does not stop the other dates. The
    run prints one line per failed date, then exits 1. The next `--missing` run starts again with
    the failed dates.
    """
    # shortcut: an explicit date runs for an open window too and writes a file with null future
    # steps that `--missing` then skips; add a closed-window check when explicit reruns of
    # recent days become routine.
    if missing:
        now = _utc_now()
        storm_dates = [
            d
            for d, _ in _swath_files([])
            if sbw.window(d)[1] <= now and not (INTERNET_DIR / internet.file_name(d)).exists()
        ]
    written = []
    failed = []
    for storm_date in storm_dates:
        try:
            frame = internet.build(storm_date)
            written.append(
                files.write_atomic(
                    frame, INTERNET_DIR / internet.file_name(storm_date), internet.METADATA
                )
            )
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"{storm_date}: {exc}", file=sys.stderr)
            failed.append(storm_date.isoformat())
            continue
        print(f"{storm_date}: {frame['ratio'].count()} of {len(frame)} county steps have a ratio")
    if failed:
        raise ValueError(f"internet failed for: {', '.join(failed)}")
    return written


def _archive_summary() -> dict | None:
    """The archive coverage from the archive index, or None without an index."""
    if not archive.INDEX_PATH.exists():
        return None
    try:
        return publish.archive_summary(pd.read_parquet(archive.INDEX_PATH))
    except (OSError, ValueError, KeyError) as exc:
        raise ValueError(
            f"{archive.INDEX_PATH}: not a readable archive index, run hailprint index again"
        ) from exc


def _pipeline_doc(
    old_runs: list[dict],
    storm_dates: list[str],
    receipts: list[dict],
    summary: dict | None,
    file_count: int,
    run_time: datetime,
) -> dict:
    """Build the pipeline document: this run, the archive coverage, the sources.

    `storm_dates` are the dates of this run. `receipts` are the pairs and ZIP count receipts of
    every published storm date, so the sources cover the whole index and not this run alone.
    """
    run = publish.run_entry(storm_dates, file_count, run_time)
    return publish.pipeline_doc(
        publish.merge_runs(old_runs, run), summary, publish.sources_of(receipts), run_time
    )


def _internet_layer(path: Path) -> tuple[pd.DataFrame, publish.Doc] | None:
    """The internet frame and its source entry, or None for a missing file or an all-null one."""
    if not path.exists():
        return None
    frame = pd.read_parquet(path)
    has_ratio = bool(frame["ratio"].notna().any())
    return (frame, publish.internet_source(path)) if has_ratio else None


def publish_days(storm_dates: list[date], with_internet: bool = False) -> list[Path]:
    """Write the site data files per storm date, then the storms index, then the pipeline file.

    One run at a time: a second run that finds the lock file stops with exit 1. A date without
    an SPC daily CSV is skipped. A date that fails a check writes no file and is named in the
    final error. The index holds the dates of this run over the entries of the earlier runs.
    A malformed storms.json, pipeline.json, or archive index stops the run before any write. A
    malformed per-date file of an earlier run, or a pipeline document that fails its schema,
    stops the run before the index write. Without `with_internet` no date gets an internet.json
    and a stale one is removed.
    """
    # shortcut: internet publish gated by --with-internet, remove the gate when IODA replies
    with files.lock(SITE_DATA_DIR / LOCK_FILE):
        return _publish_days(storm_dates, with_internet)


def _publish_days(storm_dates: list[date], with_internet: bool) -> list[Path]:
    selected = _swath_files(storm_dates)
    if not candidates.CANDIDATES_PATH.exists():
        raise FileNotFoundError(f"run hailprint candidates first: {candidates.CANDIDATES_PATH}")
    facts = candidates.read_facts(candidates.CANDIDATES_PATH)
    index_path = SITE_DATA_DIR / "storms.json"
    pipeline_path = SITE_DATA_DIR / publish.PIPELINE_FILE
    old = publish.read_published(index_path, "storms")["storms"] if index_path.exists() else []
    old_runs = (
        publish.read_published(pipeline_path, "pipeline")["runs"] if pipeline_path.exists() else []
    )
    summary = _archive_summary()
    run_time = _utc_now()
    entries, written, failed = [], [], []
    file_count = 0
    for storm_date, swath_path in selected:
        try:
            text = candidates.daily_csv(storm_date, candidates.DAILY_DIR, date.today())
        except RuntimeError as exc:
            print(f"{storm_date}: SPC fetch failed, skipped: {exc!r}", file=sys.stderr)
            continue
        if text is None:
            print(f"{storm_date}: no SPC daily CSV, skipped", file=sys.stderr)
            continue
        zips_path = PARCELS_DIR / f"zip-counts-{storm_date}.parquet"
        has_zips = zips_path.exists()
        spc = publish.spc_source(storm_date)
        hcad = publish.hcad_source(zips_path.name) if has_zips else None
        warnings_path = WARNINGS_DIR / sbw.file_name(storm_date)
        has_warnings = warnings_path.exists()
        power_path = POWER_DIR / power.day_file_name(storm_date)
        has_power = power_path.exists()
        try:
            mrms, max_mesh_mm = publish.swath_source(swath_path)
            texts, entry = publish.build_day(
                storm_date,
                gpd.read_parquet(swath_path),
                reports.nearby_reports(storm_date, text),
                mrms=mrms,
                max_mesh_mm=max_mesh_mm,
                spc=spc,
                zips=pd.read_parquet(zips_path) if has_zips else None,
                hcad=hcad,
                facts=facts.get(storm_date.isoformat()),
                run_time=run_time,
                warnings=(
                    (gpd.read_parquet(warnings_path), publish.warnings_source(warnings_path))
                    if has_warnings
                    else None
                ),
                power=(
                    (pd.read_parquet(power_path), publish.power_source(power_path))
                    if has_power
                    else None
                ),
                internet=_internet_layer(INTERNET_DIR / internet.file_name(storm_date))
                if with_internet
                else None,
            )
        except ValueError as exc:
            print(f"{storm_date}: {exc}", file=sys.stderr)
            failed.append(storm_date.isoformat())
            continue
        folder = SITE_DATA_DIR / publish.STORMS_DIR / storm_date.isoformat()
        for name, body in texts.items():
            written.append(files.write_text_atomic(body, folder / name))
        if publish.ZIPS_FILE not in texts:
            (folder / publish.ZIPS_FILE).unlink(missing_ok=True)
        if publish.WARNINGS_FILE not in texts:
            (folder / publish.WARNINGS_FILE).unlink(missing_ok=True)
        if publish.POWER_FILE not in texts:
            (folder / publish.POWER_FILE).unlink(missing_ok=True)
        if publish.INTERNET_FILE not in texts:
            (folder / publish.INTERNET_FILE).unlink(missing_ok=True)
        entries.append(entry)
        file_count += len(texts)
        print(f"{storm_date}: published {len(texts)} files")
    if not entries:
        raise RuntimeError(
            "no storm date was published" + (f"; failed: {', '.join(failed)}" if failed else "")
        )
    merged = publish.merge_entries(old, entries, SITE_DATA_DIR)
    receipts = publish.index_receipts(merged, SITE_DATA_DIR)
    doc = publish.storms_doc(merged, run_time)
    this_run = [entry["storm_date"] for entry in entries]
    pipeline = _pipeline_doc(old_runs, this_run, receipts, summary, file_count, run_time)
    # both documents pass validate and dumps before the first index write
    publish.validate(doc, "storms")
    publish.validate(pipeline, "pipeline")
    index_text = publish.dumps(doc, "storms")
    pipeline_text = publish.dumps(pipeline, "pipeline")
    written.append(files.write_text_atomic(index_text, index_path))
    print(f"storms index: {len(doc['storms'])} entries")
    written.append(files.write_text_atomic(pipeline_text, pipeline_path))
    print(f"published {publish.PIPELINE_FILE} ({len(pipeline['runs'])} runs)")
    print(f"confidence: {swath.CONFIDENCE}")
    if failed:
        raise ValueError(f"publish failed for: {', '.join(failed)}")
    return written


if __name__ == "__main__":
    sys.exit(main())
