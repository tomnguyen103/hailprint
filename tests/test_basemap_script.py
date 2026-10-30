"""Tests for site/scripts/basemap.py PMTiles validation and atomic extraction."""

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "site" / "scripts" / "basemap.py"


def load_basemap_module():
    spec = importlib.util.spec_from_file_location("basemap_script", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["basemap_script"] = module
    spec.loader.exec_module(module)
    return module


def test_validate_pmtiles_header_accepts_valid_magic_and_rejects_corrupt(tmp_path: Path):
    mod = load_basemap_module()
    valid = tmp_path / "valid.pmtiles"
    valid.write_bytes(b"PMTiles\x03" + b"\x00" * 120)
    assert mod.validate_pmtiles_header(valid) is True

    short = tmp_path / "short.pmtiles"
    short.write_bytes(b"PMTile")
    assert mod.validate_pmtiles_header(short) is False

    html = tmp_path / "index.html"
    html.write_bytes(b"<!doctype html><html></html>")
    assert mod.validate_pmtiles_header(html) is False


def test_extract_basemap_writes_atomically_and_cleans_up_tmp_on_failure(tmp_path: Path):
    mod = load_basemap_module()
    out = tmp_path / "basemap.pmtiles"

    def bad_runner(cmd: list[str], tmp_file: Path) -> None:
        tmp_file.write_bytes(b"not-a-pmtiles-file")

    with pytest.raises(RuntimeError, match="PMTiles"):
        mod.extract_basemap(out_path=out, build="20260101.pmtiles", runner=bad_runner)

    assert not out.exists()
    assert list(tmp_path.glob("*.tmp")) == []

    recorded_cmds: list[list[str]] = []

    def good_runner(cmd: list[str], tmp_file: Path) -> None:
        recorded_cmds.append(cmd)
        tmp_file.write_bytes(b"PMTiles\x03" + b"\x00" * 120)

    written = mod.extract_basemap(out_path=out, build="20260101.pmtiles", runner=good_runner)
    assert written == out
    assert out.exists()
    assert mod.validate_pmtiles_header(out) is True
    assert list(tmp_path.glob("*.tmp")) == []
    assert len(recorded_cmds) == 1
    assert "--bbox=-96.242208,28.77556588,-94.303383,30.680284" in recorded_cmds[0]
    assert "--maxzoom=12" in recorded_cmds[0]


def test_latest_build_rejects_invalid_protomaps_build_env(monkeypatch: pytest.MonkeyPatch):
    mod = load_basemap_module()
    monkeypatch.setenv("PROTOMAPS_BUILD", "../../etc/passwd")
    with pytest.raises(ValueError, match="PROTOMAPS_BUILD"):
        mod.latest_build()

    monkeypatch.setenv("PROTOMAPS_BUILD", "20260415.pmtiles")
    assert mod.latest_build() == "20260415.pmtiles"
