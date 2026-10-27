"""README names every CLI command, every week report, and the three scripts."""

import re

from hailprint import paths
from hailprint.__main__ import build_parser

README = (paths.ROOT / "README.md").read_text(encoding="utf-8")


def test_readme_names_every_cli_command():
    match = re.search(r"\{([a-z,]+)\}", build_parser().format_help())
    assert match is not None
    for name in match.group(1).split(","):
        assert f"hailprint {name}" in README, name


def test_readme_names_every_week_report():
    for path in (paths.ROOT / "docs").glob("WEEK-*.md"):
        assert path.name in README, path.name


def test_readme_names_the_three_scripts():
    for script in ("scripts/deploy.sh", "scripts/nightly.sh", "scripts/hailprint.cron"):
        assert script in README, script


def test_readme_holds_no_live_map_sentence():
    assert "live map" not in README
