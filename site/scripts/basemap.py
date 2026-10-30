"""Extract the metro county basemap from the Protomaps daily build.

Output: site/public/basemap.pmtiles. The site builds and runs without it.
Override the build with PROTOMAPS_BUILD=YYYYMMDD.pmtiles.
"""

import json
import os
import platform
import re
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "site" / "public" / "basemap.pmtiles"
BIN_DIR = ROOT / ".scratch" / "bin"
BBOX = "-96.242208,28.77556588,-94.303383,30.680284"
MAXZOOM = 12
BUILDS_URL = "https://build.protomaps.com"
BUILDS_INDEX_URLS = (
    "https://build-metadata.protomaps.dev/builds.json",
    "https://build.protomaps.com/builds.json",
)
GITHUB_API_LATEST = "https://api.github.com/repos/protomaps/go-pmtiles/releases/latest"
PMTILES_MAGIC = b"PMTiles"


def validate_pmtiles_header(path: Path) -> bool:
    """Return True when path exists, has at least 127 bytes, and starts with the PMTiles magic."""
    if not path.is_file():
        return False
    try:
        with path.open("rb") as handle:
            head = handle.read(127)
        return len(head) >= 127 and head.startswith(PMTILES_MAGIC)
    except OSError:
        return False


def latest_build(index_urls: tuple[str, ...] = BUILDS_INDEX_URLS) -> str:
    """Return the newest YYYYMMDD.pmtiles key from the Protomaps builds index."""
    env_build = os.environ.get("PROTOMAPS_BUILD", "").strip()
    if env_build:
        return env_build
    last_err: Exception | None = None
    for url in index_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "hailprint-basemap/0.1"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8")
            matches = sorted(set(re.findall(r"[0-9]{8}\.pmtiles", text)))
            if matches:
                return matches[-1]
        except Exception as err:
            last_err = err
    raise RuntimeError(f"no build listed at {index_urls}: {last_err}")


def ensure_pmtiles_binary(bin_dir: Path = BIN_DIR) -> str:
    """Return the path to the pmtiles CLI, downloading go-pmtiles into bin_dir when absent."""
    found = shutil.which("pmtiles")
    if found:
        return found
    exe_name = "pmtiles.exe" if platform.system() == "Windows" else "pmtiles"
    local_bin = bin_dir / exe_name
    if local_bin.is_file():
        return str(local_bin)

    bin_dir.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        GITHUB_API_LATEST,
        headers={"User-Agent": "hailprint-basemap/0.1"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        release = json.loads(resp.read().decode("utf-8"))

    sys_name = platform.system()
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "x86_64"
    assets = release.get("assets", [])
    asset_url = None
    asset_name = ""
    for asset in assets:
        name = asset.get("name", "")
        is_archive = name.endswith(".zip") or name.endswith(".tar.gz")
        if sys_name in name and arch in name and is_archive:
            asset_url = asset.get("browser_download_url")
            asset_name = name
            break
    if not asset_url:
        raise RuntimeError(f"no go-pmtiles binary asset for {sys_name} {arch}")

    archive_path = bin_dir / asset_name
    urllib.request.urlretrieve(asset_url, archive_path)
    try:
        if asset_name.endswith(".zip"):
            with zipfile.ZipFile(archive_path) as zf:
                zf.extract(exe_name, path=bin_dir)
        else:
            with tarfile.open(archive_path, "r:gz") as tf:
                tf.extract(exe_name, path=bin_dir)
    finally:
        archive_path.unlink(missing_ok=True)

    if platform.system() != "Windows":
        local_bin.chmod(0o755)
    return str(local_bin)


def _default_runner(cmd: list[str], tmp_file: Path) -> None:
    subprocess.run(cmd, check=True)


def extract_basemap(
    out_path: Path = OUT_PATH,
    build: str | None = None,
    runner: Callable[[list[str], Path], None] | None = None,
) -> Path:
    """Extract the metro bbox PMTiles to a temp file, verify the header, and replace out_path."""
    target_build = build or latest_build()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_name(f"{out_path.name}.{os.getpid()}.tmp")
    try:
        if runner is not None:
            cmd = ["pmtiles", "extract", f"{BUILDS_URL}/{target_build}", str(tmp_path)]
            runner(cmd, tmp_path)
        else:
            binary = ensure_pmtiles_binary()
            cmd = [
                binary,
                "extract",
                f"{BUILDS_URL}/{target_build}",
                str(tmp_path),
                f"--bbox={BBOX}",
                f"--maxzoom={MAXZOOM}",
            ]
            _default_runner(cmd, tmp_path)
        if not validate_pmtiles_header(tmp_path):
            raise RuntimeError(f"invalid PMTiles magic header in {tmp_path}")
        os.replace(tmp_path, out_path)
        return out_path
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def main() -> None:
    build = latest_build()
    out = extract_basemap(OUT_PATH, build=build)
    print(f"basemap: wrote {out} from {build} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
