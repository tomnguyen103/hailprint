"""Command line entry: ``hailprint ingest|index|candidates|parcels``."""

import argparse
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
    swath,
)

RAW_DIR = paths.RAW_DIR / "mesh"
DERIVED_DIR = paths.DERIVED_DIR / "swaths"
OUT_DIR = paths.OUT_DIR
PARCELS_GDB = paths.RAW_DIR / "hcad" / "extracted" / "Parcels.gdb"
PARCELS_DIR = paths.DERIVED_DIR / "parcels"


def _storm_date(text: str) -> date:
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise ValueError(text)
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {text!r}") from exc


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
    """WCM database joined with the archive index. Writes the full CSV and prints the top rows."""
    if not archive.INDEX_PATH.exists():
        raise FileNotFoundError(f"run hailprint index first: {archive.INDEX_PATH}")
    index_df = pd.read_parquet(archive.INDEX_PATH)
    ranked = candidates.rank(candidates.harris_days(candidates.fetch_database()), index_df)
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


if __name__ == "__main__":
    sys.exit(main())
