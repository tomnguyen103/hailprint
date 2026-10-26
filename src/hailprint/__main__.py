"""Command line entry: ``hailprint ingest|index|candidates|parcels|score``."""

import argparse
import math
import re
import sys
from datetime import date, datetime
from pathlib import Path

import geopandas as gpd
import pandas as pd

from hailprint import (
    archive,
    candidates,
    county,
    files,
    mesh,
    parcels,
    paths,
    plot,
    reports,
    score,
    swath,
)

RAW_DIR = paths.RAW_DIR / "mesh"
DERIVED_DIR = paths.DERIVED_DIR / "swaths"
OUT_DIR = paths.OUT_DIR
PARCELS_GDB = paths.RAW_DIR / "hcad" / "extracted" / "Parcels.gdb"
PARCELS_DIR = paths.DERIVED_DIR / "parcels"
SCORES_DIR = paths.DERIVED_DIR / "scores"


def _storm_date(text: str) -> date:
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise ValueError(text)
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {text!r}") from exc


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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "ingest":
            ingest(args.storm_dates)
        elif args.command == "index":
            index()
        elif args.command == "candidates":
            rank_candidates(args.top)
        elif args.command == "parcels":
            count_parcels(args.storm_date)
        elif args.command == "score":
            score_days(args.storm_dates, args.radius_km)
    except (RuntimeError, FileNotFoundError, ValueError) as exc:
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
        swath.write_swaths(swaths, DERIVED_DIR / f"swaths-{storm_date}.parquet", 1, max_mesh_mm)
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


def rank_candidates(top: int) -> Path:
    """Rank WCM days and the daily-CSV fill against the archive index.

    Writes the full CSV and prints the top rows.
    """
    if not archive.INDEX_PATH.exists():
        raise FileNotFoundError(f"run hailprint index first: {archive.INDEX_PATH}")
    index_df = pd.read_parquet(archive.INDEX_PATH)
    ranked = candidates.rank(candidates.all_days(candidates.fetch_database(), index_df), index_df)
    path = files.write_atomic(ranked, candidates.CANDIDATES_PATH)
    print(ranked.head(top).to_string(index=False))
    return path


def count_parcels(storm_date: date) -> Path:
    """Parcels per size class from the swath file and the masked HCAD read."""
    swath_path = DERIVED_DIR / f"swaths-{storm_date}.parquet"
    if not swath_path.exists():
        raise FileNotFoundError(f"run hailprint ingest first: {swath_path}")
    swaths = gpd.read_parquet(swath_path)
    counts = parcels.count_parcels(swaths, PARCELS_GDB)
    path = files.write_atomic(counts, PARCELS_DIR / f"parcel-counts-{storm_date}.parquet")
    for threshold_in, parcel_count in zip(
        counts["threshold_in"], counts["parcel_count"], strict=True
    ):
        print(f">= {threshold_in:.2f} in: {parcel_count} parcels")
    print(f"confidence: {swath.CONFIDENCE}")
    return path


def _swath_files(storm_dates: list[date]) -> list[tuple[date, Path]]:
    """The swath file per storm date. An empty list selects every swath file, oldest first."""
    if storm_dates:
        found = [(d, DERIVED_DIR / f"swaths-{d}.parquet") for d in sorted(set(storm_dates))]
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
    print(f"pooled over {len(tables)} storm dates, radius {radius_km:g} km")
    table = pooled[shown].astype({c: object for c in score.AREA_COLUMNS + score.METRIC_COLUMNS})
    for column in score.AREA_COLUMNS:
        table[column] = [f"{v:.0f}" for v in pooled[column]]
    for column in score.METRIC_COLUMNS:
        table[column] = [f"{v:.2f}" for v in pooled[column]]
    print(table.to_string(index=False))
    if bool((pooled["correct_negatives"] == 0).to_numpy().any()):
        print(
            "note: a row with 0 correct negatives has no report below its class, "
            "so its FAR and HSS hold by construction"
        )
    print(f"confidence: {swath.CONFIDENCE}")
    return written


if __name__ == "__main__":
    sys.exit(main())
