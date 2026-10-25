"""Command line entry: ``python -m hailprint spike YYYY-MM-DD``."""

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
    spike = commands.add_parser("spike", help="run one storm date from bucket to PNG")
    spike.add_argument("storm_date", type=_storm_date, help="UTC storm date, YYYY-MM-DD")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "spike":
        spike(args.storm_date)
    return 0


def spike(storm_date: date) -> Path:
    """One storm date from bucket to PNG. Prints the max MESH, the report count, and the path."""
    mesh.download(storm_date, RAW_DIR)
    da, file_count = mesh.daily_max(storm_date, RAW_DIR)
    max_mesh_mm = None if bool(da.isnull().all()) else round(float(da.max()), 2)
    swaths = swath.build_swaths(da, storm_date)
    swath.write_swaths(
        swaths, DERIVED_DIR / f"swaths-{storm_date}.parquet", file_count, max_mesh_mm
    )
    try:
        points = reports.harris_reports(storm_date)
        report_count = str(len(points))
    except Exception:  # noqa: BLE001 - the picture still lands without points
        points = None
        report_count = "unknown (fetch failed)"
    title = (
        f"Hailprint spike {storm_date} — radar-estimated hail size "
        f"(MESH daily max, {file_count} files)"
    )
    png = plot.render(swaths, county.outline(), points, title, OUT_DIR / f"spike-{storm_date}.png")
    print(f"max MESH in bbox: {max_mesh_mm} mm")
    print(f"SPC hail reports in Harris County: {report_count}")
    print(png)
    return png


if __name__ == "__main__":
    sys.exit(main())
