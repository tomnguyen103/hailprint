"""Command line entry: ``hailprint ingest|index|candidates|parcels``."""

import argparse
import re
import sys
from datetime import date, datetime
from pathlib import Path

from hailprint import county, mesh, plot, reports, swath

RAW_DIR = Path("data/raw/mesh")
DERIVED_DIR = Path("data/derived/swaths")
OUT_DIR = Path("out")


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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "ingest":
            ingest(args.storm_dates)
    except (RuntimeError, FileNotFoundError) as exc:
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


if __name__ == "__main__":
    sys.exit(main())
