"""The deploy and nightly scripts under bash, with stub executables first on PATH."""

import os
import shutil
import subprocess
from pathlib import Path

from tests.conftest import BASH, needs_bash

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"

STUB = '#!/usr/bin/env bash\necho "{name}${{*:+ $*}} @ $(basename "$PWD")" >> "$STUB_LOG"\n{body}'

# a build writes index.html; STUB_BUILD_EMPTY=1 leaves out data/storms.json
NPM_BODY = """if [ "$1 $2" = "run build" ]; then
  mkdir -p dist/data && : > dist/index.html
  [ "${STUB_BUILD_EMPTY:-0}" = 1 ] || : > dist/data/storms.json
fi
"""

VERCEL_BODY = """if [ "$1" = build ]; then
  mkdir -p .vercel/output/static/data && : > .vercel/output/static/index.html
  [ "${STUB_BUILD_EMPTY:-0}" = 1 ] || : > .vercel/output/static/data/storms.json
fi
"""


class Tree:
    """A copy of scripts/*.sh in a tmp tree, a storms.json, and stubs under tmp/bin."""

    def __init__(self, tmp_path: Path):
        self.root = tmp_path / "tree"
        (self.root / "scripts").mkdir(parents=True)
        for script in SCRIPTS.glob("*.sh"):
            shutil.copy(script, self.root / "scripts" / script.name)
        self.site_data = self.root / "site" / "data"
        self.site_data.mkdir(parents=True)
        (self.site_data / "storms.json").write_text("{}", encoding="utf-8")
        self.bin = tmp_path / "bin"
        self.bin.mkdir()
        self.log = tmp_path / "calls.log"
        self.stub("npm", NPM_BODY)
        self.stub("vercel", VERCEL_BODY)

    def stub(
        self, name: str, body: str = "", folder: Path | None = None, filename: str | None = None
    ) -> Path:
        path = (folder or self.bin) / (filename or name)
        path.write_text(STUB.format(name=name, body=body), encoding="utf-8", newline="\n")
        path.chmod(0o755)
        return path

    def run(self, script: str, *args: str, env: dict[str, str] | None = None):
        run_env = {
            **os.environ,
            "PATH": f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            "STUB_LOG": self.log.as_posix(),
        }
        for name in ("VERCEL_TOKEN", "MAX_INGEST", "STUB_MISSING", "STUB_FAIL"):
            run_env.pop(name, None)
        run_env.update(env or {})
        assert BASH is not None
        return subprocess.run(
            [BASH, (self.root / "scripts" / script).as_posix(), *args],
            env=run_env,
            capture_output=True,
            text=True,
        )

    def calls(self) -> list[str]:
        return self.log.read_text(encoding="utf-8").splitlines() if self.log.exists() else []


@needs_bash
def test_every_script_parses():
    assert BASH is not None
    for script in SCRIPTS.glob("*.sh"):
        done = subprocess.run([BASH, "-n", script.as_posix()], capture_output=True, text=True)
        assert done.returncode == 0, done.stderr


# --- deploy.sh ---


@needs_bash
def test_deploy_dry_run_builds_in_site_and_calls_no_vercel(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", "--dry-run")

    assert done.returncode == 0, done.stderr
    assert tree.calls() == ["npm ci @ site", "npm run build @ site"]
    assert "deploy:" in done.stdout


@needs_bash
def test_deploy_live_runs_pull_build_deploy_with_the_token(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", env={"VERCEL_TOKEN": "t-test"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == [
        "vercel pull --yes --environment=production --token t-test @ tree",
        "vercel build --prod --yes --token t-test @ tree",
        "vercel deploy --prebuilt --prod --archive=tgz --yes --token t-test @ tree",
    ]
    assert "t-test" not in done.stdout + done.stderr


@needs_bash
def test_deploy_live_without_a_token_omits_the_flag(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh")

    assert done.returncode == 0, done.stderr
    assert tree.calls() == [
        "vercel pull --yes --environment=production @ tree",
        "vercel build --prod --yes @ tree",
        "vercel deploy --prebuilt --prod --archive=tgz --yes @ tree",
    ]


@needs_bash
def test_deploy_refuses_without_the_published_index(tmp_path):
    tree = Tree(tmp_path)
    (tree.site_data / "storms.json").unlink()

    done = tree.run("deploy.sh", "--dry-run")

    assert done.returncode == 1
    assert "site/data/storms.json" in done.stderr
    assert "hailprint publish" in done.stderr
    assert done.stdout == ""
    assert tree.calls() == []


@needs_bash
def test_deploy_refuses_during_a_publish(tmp_path):
    tree = Tree(tmp_path)
    (tree.site_data / "publish.lock").write_text("1", encoding="utf-8")

    done = tree.run("deploy.sh")

    assert done.returncode == 1
    assert "publish.lock" in done.stderr
    assert done.stdout == ""
    assert tree.calls() == []


@needs_bash
def test_deploy_rejects_an_unknown_argument_with_usage(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", "--bogus")

    assert done.returncode == 2
    assert "usage:" in done.stderr
    assert done.stdout == ""
    assert tree.calls() == []


@needs_bash
def test_deploy_dry_run_fails_when_the_build_lacks_the_index(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", "--dry-run", env={"STUB_BUILD_EMPTY": "1"})

    assert done.returncode == 1
    assert "storms.json" in done.stderr


@needs_bash
def test_deploy_live_stops_before_deploy_when_the_build_lacks_the_index(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", env={"STUB_BUILD_EMPTY": "1"})

    assert done.returncode == 1
    assert "storms.json" in done.stderr
    assert not any(call.startswith("vercel deploy") for call in tree.calls())


# --- nightly.sh ---

# the uv stub prints STUB_MISSING on `candidates` and exits 3 on the STUB_FAIL command
UV_BODY = """if [ "$2 $3" = "hailprint candidates" ]; then printf '%s\\n' "${STUB_MISSING:-}"; fi
if [ "$2 $3" = "hailprint ${STUB_FAIL:-none}" ]; then exit 3; fi
"""
MISSING_TWO = "2026-01-05\n2024-06-01"
HEAD = ["uv run hailprint index @ tree", "uv run hailprint candidates --missing --top 5 @ tree"]
INGEST = [
    "uv run hailprint ingest 2026-01-05 2024-06-01 @ tree",
    "uv run hailprint parcels 2026-01-05 @ tree",
    "uv run hailprint parcels 2024-06-01 @ tree",
]
TAIL = ["uv run hailprint score @ tree", "uv run hailprint publish @ tree"]


def nightly_tree(tmp_path: Path, gdb: bool = True) -> Tree:
    tree = Tree(tmp_path)
    tree.stub("uv", UV_BODY)
    tree.stub("deploy", folder=tree.root / "scripts", filename="deploy.sh")
    if gdb:
        (tree.root / "data" / "raw" / "hcad" / "extracted" / "Parcels.gdb").mkdir(parents=True)
    return tree


@needs_bash
def test_nightly_runs_every_step_in_order(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": MISSING_TWO})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + INGEST + TAIL + ["deploy @ tree"]
    assert not (tree.root / "data" / "nightly.lock").exists()


@needs_bash
def test_nightly_skips_ingest_and_parcels_without_a_missing_day(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + TAIL + ["deploy @ tree"]
    assert "no missing candidate day" in done.stdout


@needs_bash
def test_nightly_skips_parcels_without_the_hcad_gdb(tmp_path):
    tree = nightly_tree(tmp_path, gdb=False)

    done = tree.run("nightly.sh", env={"STUB_MISSING": MISSING_TWO})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + INGEST[:1] + TAIL + ["deploy @ tree"]
    assert "parcels skipped" in done.stdout


@needs_bash
def test_nightly_max_ingest_caps_the_candidates_call(tmp_path):
    tree = nightly_tree(tmp_path)

    tree.run("nightly.sh", env={"STUB_MISSING": "", "MAX_INGEST": "2"})

    assert "uv run hailprint candidates --missing --top 2 @ tree" in tree.calls()


@needs_bash
def test_nightly_reads_max_ingest_from_dot_env(tmp_path):
    tree = nightly_tree(tmp_path)
    (tree.root / ".env").write_text("MAX_INGEST=1\n", encoding="utf-8")

    tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert "uv run hailprint candidates --missing --top 1 @ tree" in tree.calls()


@needs_bash
def test_nightly_passes_dry_run_to_the_deploy(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", "--dry-run", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    assert tree.calls()[-1] == "deploy --dry-run @ tree"


@needs_bash
def test_nightly_refuses_when_the_lock_is_present_and_keeps_it(tmp_path):
    tree = nightly_tree(tmp_path)
    lock = tree.root / "data" / "nightly.lock"
    lock.mkdir(parents=True)

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 1
    assert "nightly.lock" in done.stderr
    assert done.stdout == ""
    assert tree.calls() == []
    assert lock.is_dir()


@needs_bash
def test_nightly_stops_on_a_failed_score_and_removes_the_lock(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": "", "STUB_FAIL": "score"})

    assert done.returncode == 3
    assert tree.calls() == HEAD + TAIL[:1]
    assert not (tree.root / "data" / "nightly.lock").exists()


@needs_bash
def test_nightly_rejects_an_unknown_argument_with_usage(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", "--bogus")

    assert done.returncode == 2
    assert "usage:" in done.stderr
    assert tree.calls() == []


def test_cron_entry_starts_the_nightly_run_at_14_utc():
    lines = (SCRIPTS / "hailprint.cron").read_text(encoding="utf-8").splitlines()
    entries = [
        ln for ln in lines if ln and not ln.startswith("#") and not ln.split("=")[0].isupper()
    ]

    assert len(entries) == 1
    assert entries[0].startswith("0 14 * * *")
    assert "scripts/nightly.sh" in entries[0]
    assert "CRON_TZ=UTC" in lines
