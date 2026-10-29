"""README names every CLI command, every week report, and the cloud tasks."""

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
    reports = sorted((paths.ROOT / "docs" / "reports").glob("week-*.md"))
    assert reports
    for path in reports:
        assert f"docs/reports/{path.name}" in README, path.name


def test_readme_names_the_cloud_tasks():
    for task in ("hailprint cloud nightly", "hailprint cloud odin", "hailprint cloud backfill"):
        assert task in README, task
    for old_script in ("scripts/deploy.sh", "scripts/nightly.sh", "scripts/hailprint.cron"):
        assert old_script not in README, old_script


def test_readme_holds_no_live_map_sentence():
    assert "live map" not in README
