"""Tests for site/scripts/basemap.py PMTiles validation and atomic extraction."""

import hashlib
import importlib.util
import io
import sys
import zipfile
from contextlib import contextmanager
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
    """Verify atomic extraction, header and CLI verification, and temp-file cleanup on failure."""
    mod = load_basemap_module()
    out = tmp_path / "basemap.pmtiles"
    out.write_bytes(b"existing-basemap")

    def bad_header_runner(cmd: list[str], tmp_file: Path) -> None:
        if "extract" in cmd:
            tmp_file.write_bytes(b"not-a-pmtiles-file")

    with pytest.raises(RuntimeError, match="PMTiles"):
        mod.extract_basemap(out_path=out, build="20260101.pmtiles", runner=bad_header_runner)

    assert out.read_bytes() == b"existing-basemap"
    assert list(tmp_path.glob("*.tmp")) == []

    def bad_verify_runner(cmd: list[str], tmp_file: Path) -> None:
        if "extract" in cmd:
            tmp_file.write_bytes(b"PMTiles\x03" + b"\x00" * 120)
        elif "verify" in cmd:
            raise RuntimeError("pmtiles verify failed: no root directory")

    with pytest.raises(RuntimeError, match="verify failed"):
        mod.extract_basemap(out_path=out, build="20260101.pmtiles", runner=bad_verify_runner)

    assert out.read_bytes() == b"existing-basemap"
    assert list(tmp_path.glob("*.tmp")) == []

    recorded_cmds: list[list[str]] = []

    def good_runner(cmd: list[str], tmp_file: Path) -> None:
        recorded_cmds.append(cmd)
        if "extract" in cmd:
            tmp_file.write_bytes(b"PMTiles\x03" + b"\x00" * 120)

    written = mod.extract_basemap(out_path=out, build="20260101.pmtiles", runner=good_runner)
    assert written == out
    assert out.exists()
    assert mod.validate_pmtiles_header(out) is True
    assert list(tmp_path.glob("*.tmp")) == []
    assert len(recorded_cmds) == 2
    assert "--bbox=-96.242208,28.77556588,-94.303383,30.680284" in recorded_cmds[0]
    assert "--maxzoom=12" in recorded_cmds[0]
    assert recorded_cmds[1][:2] == ["pmtiles", "verify"]


def test_latest_build_rejects_invalid_protomaps_build_env(monkeypatch: pytest.MonkeyPatch):
    mod = load_basemap_module()
    monkeypatch.setenv("PROTOMAPS_BUILD", "../../etc/passwd")
    with pytest.raises(ValueError, match="PROTOMAPS_BUILD"):
        mod.latest_build()

    monkeypatch.setenv("PROTOMAPS_BUILD", "20260415.pmtiles")
    assert mod.latest_build() == "20260415.pmtiles"


def _make_zip_bytes(exe_name: str, payload: bytes = b"fake-pmtiles-bin") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(exe_name, payload)
    return buf.getvalue()


def test_ensure_pmtiles_binary_verifies_sha256_and_reuses_existing_binary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    mod = load_basemap_module()
    monkeypatch.setattr(mod.shutil, "which", lambda _name: None)
    monkeypatch.setattr(mod.platform, "system", lambda: "Windows")
    monkeypatch.setattr(mod.platform, "machine", lambda: "AMD64")

    asset_name = f"go-pmtiles_{mod.PMTILES_VERSION}_Windows_x86_64.zip"
    archive_bytes = _make_zip_bytes("pmtiles.exe")
    digest = hashlib.sha256(archive_bytes).hexdigest()
    monkeypatch.setitem(mod.PMTILES_SHA256, asset_name, digest)

    urls: list[str] = []

    @contextmanager
    def fake_urlopen(req, timeout=None):
        urls.append(req.full_url)
        yield io.BytesIO(archive_bytes)

    monkeypatch.setattr(mod.urllib.request, "urlopen", fake_urlopen)

    bin_path = Path(mod.ensure_pmtiles_binary(tmp_path))
    assert bin_path == tmp_path / "pmtiles.exe"
    assert bin_path.read_bytes() == b"fake-pmtiles-bin"
    assert list(tmp_path.glob("*.zip")) == []
    assert urls == [
        f"https://github.com/protomaps/go-pmtiles/releases/download/v{mod.PMTILES_VERSION}/{asset_name}"
    ]

    # Second call with existing local_bin makes zero network requests
    assert mod.ensure_pmtiles_binary(tmp_path) == str(bin_path)
    assert len(urls) == 1


def test_ensure_pmtiles_binary_rejects_sha256_mismatch_and_unlinks_archive(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    mod = load_basemap_module()
    monkeypatch.setattr(mod.shutil, "which", lambda _name: None)
    monkeypatch.setattr(mod.platform, "system", lambda: "Windows")
    monkeypatch.setattr(mod.platform, "machine", lambda: "AMD64")

    archive_bytes = _make_zip_bytes("pmtiles.exe")

    @contextmanager
    def fake_urlopen(req, timeout=None):
        yield io.BytesIO(archive_bytes)

    monkeypatch.setattr(mod.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(RuntimeError, match="SHA-256 mismatch"):
        mod.ensure_pmtiles_binary(tmp_path)

    assert not (tmp_path / "pmtiles.exe").exists()
    assert list(tmp_path.glob("*")) == []


def test_ensure_pmtiles_binary_rejects_archive_exceeding_max_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    mod = load_basemap_module()
    monkeypatch.setattr(mod.shutil, "which", lambda _name: None)
    monkeypatch.setattr(mod.platform, "system", lambda: "Windows")
    monkeypatch.setattr(mod.platform, "machine", lambda: "AMD64")
    monkeypatch.setattr(mod, "MAX_ARCHIVE_BYTES", 10)

    @contextmanager
    def fake_urlopen(req, timeout=None):
        yield io.BytesIO(b"0123456789X")

    monkeypatch.setattr(mod.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(RuntimeError, match="exceeds 10 bytes"):
        mod.ensure_pmtiles_binary(tmp_path)

    assert list(tmp_path.glob("*")) == []


def test_basemap_sh_delegates_to_basemap_py_and_glossary_matches_odin_schedule():
    sh_text = (ROOT / "site" / "scripts" / "basemap.sh").read_text(encoding="utf-8")
    expected = 'exec uv run --no-project --python 3.12 python "$(dirname "$0")/basemap.py" "$@"'
    assert expected in sh_text

    glossary = (ROOT / "GLOSSARY.md").read_text(encoding="utf-8")
    assert "trigger/odin.ts" in glossary

