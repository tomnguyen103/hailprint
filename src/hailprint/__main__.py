"""Command line entry: ``python -m hailprint spike YYYY-MM-DD``."""

import argparse
import re
import sys
from datetime import date, datetime


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
        raise NotImplementedError("spike lands in ticket 06")
    return 0


if __name__ == "__main__":
    sys.exit(main())
