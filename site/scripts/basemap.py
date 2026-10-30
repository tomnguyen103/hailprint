"""Extract the metro county basemap from the Protomaps daily build.

Output: site/public/basemap.pmtiles. The site builds and runs without it.
Override the build with PROTOMAPS_BUILD=YYYYMMDD.pmtiles.
"""

import hashlib
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
PMTILES_VERSION = "1.31.2"
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
PMTILES_ASSETS: dict[tuple[str, str], str] = {
    ("Darwin", "arm64"): f"go-pmtiles-{PMTILES_VERSION}_Darwin_arm64.zip",
    ("Darwin", "x86_64"): f"go-pmtiles-{PMTILES_VERSION}_Darwin_x86_64.zip",
    ("Linux", "arm64"): f"go-pmtiles_{PMTILES_VERSION}_Linux_arm64.tar.gz",
    ("Linux", "x86_64"): f"go-pmtiles_{PMTILES_VERSION}_Linux_x86_64.tar.gz",
    ("Windows", "arm64"): f"go-pmtiles_{PMTILES_VERSION}_Windows_arm64.zip",
    ("Windows", "x86_64"): f"go-pmtiles_{PMTILES_VERSION}_Windows_x86_64.zip",
}
PMTILES_SHA256: dict[str, str] = {
    "go-pmtiles-1.31.2_Darwin_arm64.zip": (
        "40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d"
    ),
    "go-pmtiles-1.31.2_Darwin_x86_64.zip": (
        "1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b"
    ),
    "go-pmtiles_1.31.2_Linux_arm64.tar.gz": (
        "f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1"
    ),
    "go-pmtiles_1.31.2_Linux_x86_64.tar.gz": (
        "3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f"
    ),
    "go-pmtiles_1.31.2_Windows_arm64.zip": (
        "8780a17453c63af757917a694cbbb50b943db89cc3f1b07e6fd62c1ff8e6963b"
    ),
    "go-pmtiles_1.31.2_Windows_x86_64.zip": (
        "a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1"
    ),
}
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
        if not re.fullmatch(r"[0-9]{8}\.pmtiles", env_build):
            raise ValueError(f"invalid PROTOMAPS_BUILD {env_build!r}: expected YYYYMMDD.pmtiles")
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
    sys_name = platform.system()
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "x86_64"
    asset_name = PMTILES_ASSETS.get((sys_name, arch))
    expected_sha256 = PMTILES_SHA256.get(asset_name or "")
    if not asset_name or not expected_sha256:
        raise RuntimeError(f"no go-pmtiles binary asset for {sys_name} {arch}")

    asset_url = (
        f"https://github.com/protomaps/go-pmtiles/releases/download/v{PMTILES_VERSION}/{asset_name}"
    )
    archive_path = bin_dir / asset_name
    dl_req = urllib.request.Request(asset_url, headers={"User-Agent": "hailprint-basemap/0.1"})
    try:
        hasher = hashlib.sha256()
        total = 0
        with (
            urllib.request.urlopen(dl_req, timeout=60) as resp,
            archive_path.open("wb") as out_file,
        ):
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_ARCHIVE_BYTES:
                    raise RuntimeError(f"archive exceeds {MAX_ARCHIVE_BYTES} bytes")
                hasher.update(chunk)
                out_file.write(chunk)
        if hasher.hexdigest() != expected_sha256:
            raise RuntimeError(f"SHA-256 mismatch for {asset_name}")
        if asset_name.endswith(".zip"):
            with zipfile.ZipFile(archive_path) as zf:
                zf.extract(exe_name, path=bin_dir)
        else:
            with tarfile.open(archive_path, "r:gz") as tf:
                tf.extract(exe_name, path=bin_dir, filter="data")
    finally:
        archive_path.unlink(missing_ok=True)

    if platform.system() != "Windows":
        local_bin.chmod(0o755)
    return str(local_bin)


def _default_runner(cmd: list[str], tmp_file: Path) -> None:
    """Run a pmtiles CLI command and raise on a non-zero exit code."""
    subprocess.run(cmd, check=True)


def extract_basemap(
    out_path: Path = OUT_PATH,
    build: str | None = None,
    runner: Callable[[list[str], Path], None] | None = None,
) -> Path:
    """Extract the metro bbox PMTiles to a temp file, verify the archive, and replace out_path."""
    target_build = build or latest_build()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_name(f"{out_path.name}.{os.getpid()}.tmp")
    try:
        binary = "pmtiles" if runner is not None else ensure_pmtiles_binary()
        run_cmd = runner if runner is not None else _default_runner
        cmd = [
            binary,
            "extract",
            f"{BUILDS_URL}/{target_build}",
            str(tmp_path),
            f"--bbox={BBOX}",
            f"--maxzoom={MAXZOOM}",
        ]
        run_cmd(cmd, tmp_path)
        if not validate_pmtiles_header(tmp_path):
            raise RuntimeError(f"invalid PMTiles magic header in {tmp_path}")
        run_cmd([binary, "verify", str(tmp_path)], tmp_path)
        os.replace(tmp_path, out_path)
        return out_path
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def main() -> None:
    """Resolve the newest Protomaps build and write the metro basemap archive."""
    build = latest_build()
    out = extract_basemap(OUT_PATH, build=build)
    print(f"basemap: wrote {out} from {build} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
