"""The site source never claims that hail caused an outage, and never says "internet down"."""

import re
from collections.abc import Iterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SITE_SRC = ROOT / "site" / "src"
METHOD_CONTENT = SITE_SRC / "method" / "content.ts"
SUFFIXES = {".ts", ".tsx", ".css", ".html", ".json", ".md", ".svg"}
PHRASES = ("caused by hail", "because of hail", "internet down")


def source_files(root: Path) -> Iterator[Path]:
    return (path for path in sorted(root.rglob("*")) if path.is_file() and path.suffix in SUFFIXES)


def phrase_pattern(phrase: str) -> re.Pattern[str]:
    # a line break or a run of spaces inside the phrase still counts
    return re.compile(r"\s+".join(map(re.escape, phrase.split())), re.IGNORECASE)


def find_phrases(root: Path) -> list[str]:
    """One `<file>: <phrase>` row for each file and each phrase that the scan finds."""
    hits = []
    for path in source_files(root):
        text = path.read_text(encoding="utf-8")
        hits += [
            f"{path.relative_to(root).as_posix()}: {phrase}"
            for phrase in PHRASES
            if phrase_pattern(phrase).search(text)
        ]
    return hits


def test_site_source_holds_no_causal_phrase_and_no_internet_down():
    hits = find_phrases(SITE_SRC)

    assert hits == [], "\n".join(hits)


def test_the_scan_reads_the_method_content():
    assert METHOD_CONTENT in set(source_files(SITE_SRC))


@pytest.mark.parametrize("phrase", PHRASES)
def test_the_scan_names_the_file_and_the_phrase(tmp_path, phrase):
    (tmp_path / "pages").mkdir()
    (tmp_path / "pages" / "claim.tsx").write_text(
        f"<p>The outage is {phrase.upper()}.</p>\n", encoding="utf-8"
    )
    (tmp_path / "clean.ts").write_text("export const copy = 'Radar-estimated hail size';\n")

    assert find_phrases(tmp_path) == [f"pages/claim.tsx: {phrase}"]


def test_the_scan_finds_a_phrase_that_wraps_over_two_lines(tmp_path):
    (tmp_path / "wrapped.tsx").write_text(
        "<p>Power loss, caused by\n  hail.</p>\n", encoding="utf-8"
    )

    assert find_phrases(tmp_path) == ["wrapped.tsx: caused by hail"]
