"""README names every CLI command, every week report, and the cloud tasks."""

import json
import re

from hailprint import mesh, paths
from hailprint.__main__ import build_parser

README = (paths.ROOT / "README.md").read_text(encoding="utf-8")
GLOSSARY = (paths.ROOT / "GLOSSARY.md").read_text(encoding="utf-8")
DESIGN = (paths.ROOT / "design.md").read_text(encoding="utf-8")
VERCEL = json.loads((paths.ROOT / "vercel.json").read_text(encoding="utf-8"))


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


def test_readme_glossary_and_design_match_shipped_features():
    assert "six short pages" in README
    assert "impacts" in README
    assert "hit, miss, false alarm, and correct negatives" in GLOSSARY
    assert "hit, miss, false alarm, correct negatives" in DESIGN
    assert "max report size" in DESIGN
    assert not hasattr(mesh, "prefix")
    assert not (paths.ROOT / "site" / "src" / "areas" / "storms.tsx").exists()


def test_vercel_json_serves_security_headers():
    headers_blocks = VERCEL.get("headers", [])
    assert headers_blocks
    headers = {h["key"]: h["value"] for b in headers_blocks for h in b.get("headers", [])}
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    csp = headers.get("Content-Security-Policy", "")
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert "https://*.supabase.co" in csp
    assert "blob:" in csp
    assert "img-src 'self' data: blob: https://protomaps.github.io;" in csp
    assert (
        "connect-src 'self' https://*.supabase.co "
        "https://*.protomaps.com https://protomaps.github.io;"
    ) in csp


def test_basemap_pmtiles_exists_and_has_valid_magic_header():
    basemap = paths.ROOT / "site" / "public" / "basemap.pmtiles"
    assert basemap.exists()
    with basemap.open("rb") as fh:
        assert fh.read(8) == b"PMTiles\x03"
    gitignore = (paths.ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "!site/public/basemap.pmtiles" in gitignore.splitlines()
    site_readme = (paths.ROOT / "site" / "README.md").read_text(encoding="utf-8")
    assert "!site/public/basemap.pmtiles" in site_readme
    assert "The file is gitignored." not in site_readme
