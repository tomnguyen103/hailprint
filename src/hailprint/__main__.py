"""Command line entry for the hailprint commands.

The commands are ``ingest``, ``index``, ``candidates``, ``parcels``, ``score``, ``warnings``,
``eaglei``, ``power``, ``odin``, ``internet``, ``publish``, and ``cloud``.
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

from hailprint import (
    archive,
    candidates,
    cloud,
    county,
    files,
    internet,
    mesh,
    odin,
    parcels,
    paths,
    power,
    publish_run,
    reports,
    runs,
    sbw,
    score,
    swath,
)
from hailprint import plot as plot_mod

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
    ingest_cmd.add_argument(
        "--plot",
        action="store_true",
        help="also fetch SPC reports and write the week-1 diagnostic PNG",
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
        help="fetch each swath date with a closed impact window and no settled internet file",
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
    cloud_cmd = commands.add_parser(
        "cloud", help="sync state with Supabase S3 and run a scheduled cloud task"
    )
    cloud_cmd.add_argument(
        "task",
        choices=("nightly", "odin", "backfill"),
        help="cloud task to run",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command in ("warnings", "power", "internet") and bool(args.storm_dates) == args.missing:
        parser.error(f"{args.command} takes storm dates or --missing, not both and not neither")
    try:
        if args.command == "ingest":
            ingest(args.storm_dates, plot=args.plot)
        elif args.command == "index":
            index()
        elif args.command == "candidates":
            rank_candidates(args.top, args.missing)
        elif args.command == "parcels":
            count_parcels(args.storm_date)
        elif args.command == "score":
            return score_days(args.storm_dates, args.radius_km)
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
        elif args.command == "cloud":
            return cloud.run_cloud(args.task)
    except (RuntimeError, OSError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


def ingest(storm_dates: list[date], *, plot: bool = False) -> list[Path]:
    """Swath file (and optional PNG with `--plot`) per storm date from the one 12Z file."""
    mesh.download_many([mesh.key_for(d) for d in storm_dates], RAW_DIR)
    written: list[Path] = []
    for storm_date in storm_dates:
        da = mesh.daily_max(storm_date, RAW_DIR)
        max_mesh_mm = None if bool(da.isnull().all()) else round(float(da.max()), 2)
        swaths = swath.build_swaths(da, storm_date)
        swath_path = swath.write_swaths(
            swaths, DERIVED_DIR / swath.file_name(storm_date), 1, max_mesh_mm
        )
        max_text = "none (no valid cell)" if max_mesh_mm is None else f"{max_mesh_mm} mm"
        print(f"storm date: {storm_date}")
        print(f"max MESH in bbox: {max_text}")
        if plot:
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
            png = plot_mod.render(
                swaths, county.outline(), points, title, OUT_DIR / f"ingest-{storm_date}.png"
            )
            print(f"SPC hail reports in Harris County: {report_count}")
            print(png)
            written.append(png)
        else:
            written.append(swath_path)
        print(f"confidence: {swath.CONFIDENCE}")
    return written


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


def score_days(storm_dates: list[date], radius_km: float) -> int:
    """Pairs and score files per storm date, then the pooled table. A 404 day is skipped."""
    meta = {"radius_km": f"{radius_km:.15g}", "report_source": score.REPORT_SOURCE}
    tables, written = [], []
    failed = False
    for storm_date, swath_path in _swath_files(storm_dates):
        try:
            text = candidates.daily_csv(storm_date, candidates.DAILY_DIR, _utc_now().date())
        except RuntimeError as exc:
            print(f"score {storm_date}: {exc}", file=sys.stderr)
            failed = True
            continue
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
    return 1 if failed else 0


def _utc_now() -> datetime:
    return datetime.now(UTC)


def warn_days(storm_dates: list[date], missing: bool = False) -> list[Path]:
    """One warnings file per storm date from the IEM feed of the impact window.

    With `missing`, the dates are the swath dates whose window has closed and that have no
    settled warnings file. A file with zero rows settles only after `candidates.FRESH_DAYS`.
    A failed date does not stop the other dates. The run prints one line per failed date,
    then exits 1. The next `--missing` run starts again with the failed dates.
    """
    if missing:
        now = _utc_now()
        storm_dates = [
            d
            for d, _ in _swath_files([])
            if runs.window_closed(d, now) and not runs.warnings_settled(WARNINGS_DIR, d, now)
        ]
    written = []

    def build(storm_date: date) -> bool:
        frame = sbw.parse(sbw.fetch(storm_date), storm_date)
        written.append(
            files.write_atomic(frame, WARNINGS_DIR / sbw.file_name(storm_date), sbw.METADATA)
        )
        print(f"{storm_date}: {len(frame)} warnings")
        return True

    tally = runs.run_dates(storm_dates, build, errors=(RuntimeError, ValueError))
    if tally.failed:
        raise ValueError(f"warnings failed for: {', '.join(d.isoformat() for d in tally.failed)}")
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
    if missing:
        now = _utc_now()
        storm_dates = [
            d
            for d, _ in _swath_files([])
            if runs.window_closed(d, now) and runs.needs_power(d, POWER_DIR, EAGLEI_DIR)
        ]
    written = []

    def build(storm_date: date) -> bool:
        built = power.build(storm_date, EAGLEI_DIR, ODIN_DIR)
        if built is None:
            if missing:
                return False
            absent = [
                str(year)
                for year in power.years_of(storm_date)
                if not (EAGLEI_DIR / power.file_name(year)).exists()
            ]
            raise runs.NoSource(
                f"{storm_date}: no EAGLE-I file for {' and '.join(absent)} and no ODIN "
                f"snapshot in the window, run hailprint eaglei {' '.join(absent)} first"
            )
        frame, metadata = built
        written.append(
            files.write_atomic(frame, POWER_DIR / power.day_file_name(storm_date), metadata)
        )
        known = frame["customers_out"].count()
        print(f"{storm_date}: {known} of {len(frame)} county steps have a row")
        return True

    try:
        tally = runs.run_dates(storm_dates, build, errors=(RuntimeError, ValueError, OSError))
    except runs.NoSource as exc:
        raise ValueError(str(exc)) from None
    skipped = len(tally.skipped)
    if skipped:
        print(
            f"{skipped} date{'s' if skipped > 1 else ''} skipped "
            "without an EAGLE-I file or an ODIN snapshot"
        )
    if tally.failed:
        raise ValueError(f"power failed for: {', '.join(d.isoformat() for d in tally.failed)}")
    return written


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
    settled internet file. A file with no ratio at all settles only after `candidates.FRESH_DAYS`,
    so a date with no IODA signal costs no request on a later run once it is old. A failed date
    writes no file and does not stop the other dates. The run prints one line per failed date,
    then exits 1. The next `--missing` run starts again with the failed dates.
    """
    if missing:
        now = _utc_now()
        storm_dates = [
            d
            for d, _ in _swath_files([])
            if runs.window_closed(d, now) and not runs.internet_settled(INTERNET_DIR, d, now)
        ]
    written = []

    def build(storm_date: date) -> bool:
        frame = internet.build(storm_date)
        written.append(
            files.write_atomic(
                frame, INTERNET_DIR / internet.file_name(storm_date), internet.METADATA
            )
        )
        print(f"{storm_date}: {frame['ratio'].count()} of {len(frame)} county steps have a ratio")
        return True

    tally = runs.run_dates(storm_dates, build, errors=(RuntimeError, ValueError, OSError))
    if tally.failed:
        raise ValueError(f"internet failed for: {', '.join(d.isoformat() for d in tally.failed)}")
    return written


def publish_days(storm_dates: list[date], with_internet: bool = False) -> list[Path]:
    """Write the site data files per storm date, then the storms index, then the pipeline file.

    One run at a time: a second run that finds the lock file stops with exit 1.
    The run behavior is in `publish_run.run`.
    """
    with files.lock(SITE_DATA_DIR / LOCK_FILE):
        selected = _swath_files(storm_dates)
        dirs = publish_run.Dirs(PARCELS_DIR, WARNINGS_DIR, POWER_DIR, INTERNET_DIR, SITE_DATA_DIR)
        return publish_run.run(selected, dirs, with_internet=with_internet, now=_utc_now())


if __name__ == "__main__":
    sys.exit(main())
