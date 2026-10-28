"""The deploy and nightly scripts under bash, with stub executables first on PATH."""

import os
import shutil
import subprocess
from pathlib import Path

from tests.conftest import BASH, needs_bash

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"

# a stub logs its name, its arguments, a [token] marker when VERCEL_TOKEN reaches it, and its cwd
STUB = (
    "#!/usr/bin/env bash\n"
    'echo "{name}${{*:+ $*}}${{VERCEL_TOKEN:+ [token]}} @ $(basename "$PWD")" >> "$STUB_LOG"\n'
    "{body}"
)

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
        # a linked project: the live deploy preflight passes without the two ids
        self.link = self.root / ".vercel" / "project.json"
        self.link.parent.mkdir()
        self.link.write_text("{}", encoding="utf-8")
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
        for name in (
            "VERCEL_TOKEN",
            "VERCEL_ORG_ID",
            "VERCEL_PROJECT_ID",
            "MAX_INGEST",
            "PUBLISH_INTERNET",
            "STUB_MISSING",
            "STUB_FAIL",
        ):
            run_env.pop(name, None)
        run_env.update(env or {})
        assert BASH is not None
        return subprocess.run(
            [BASH, (self.root / "scripts" / script).as_posix(), *args],
            env=run_env,
            capture_output=True,
            text=True,
        )

    def dot_env(self, text: str) -> None:
        # LF on every host: the scripts refuse a CRLF .env
        (self.root / ".env").write_text(text, encoding="utf-8", newline="\n")

    def calls(self) -> list[str]:
        return self.log.read_text(encoding="utf-8").splitlines() if self.log.exists() else []


@needs_bash
def test_every_script_parses():
    assert BASH is not None
    for script in SCRIPTS.glob("*.sh"):
        done = subprocess.run([BASH, "-n", script.as_posix()], capture_output=True, text=True)
        assert done.returncode == 0, done.stderr


def test_every_script_is_executable_in_git():
    # the cron entry, the Makefile, and nightly.sh call the scripts directly: mode 100755
    done = subprocess.run(
        ["git", "ls-files", "-s", "--", "scripts/*.sh"], capture_output=True, text=True, cwd=ROOT
    )
    rows = done.stdout.split()
    assert "scripts/deploy.sh" in rows and "scripts/nightly.sh" in rows
    for line in done.stdout.splitlines():
        assert line.startswith("100755 "), line


# --- deploy.sh ---


@needs_bash
def test_deploy_dry_run_builds_in_site_and_calls_no_vercel(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", "--dry-run")

    assert done.returncode == 0, done.stderr
    assert tree.calls() == ["npm ci @ site", "npm run build @ site"]
    assert "deploy:" in done.stdout


LIVE_WITH_TOKEN = [
    "vercel pull --yes --environment=production [token] @ tree",
    "vercel build --prod --yes @ tree",
    "vercel deploy --prebuilt --prod --archive=tgz --yes [token] @ tree",
]
LIVE_WITHOUT_TOKEN = [
    "vercel pull --yes --environment=production @ tree",
    "vercel build --prod --yes @ tree",
    "vercel deploy --prebuilt --prod --archive=tgz --yes @ tree",
]


@needs_bash
def test_deploy_live_passes_the_token_to_pull_and_deploy_only(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh", env={"VERCEL_TOKEN": "t-test"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == LIVE_WITH_TOKEN
    assert "t-test" not in done.stdout + done.stderr


@needs_bash
def test_deploy_live_reads_the_token_from_dot_env(tmp_path):
    tree = Tree(tmp_path)
    tree.dot_env("VERCEL_TOKEN=t-test\n")

    done = tree.run("deploy.sh")

    assert done.returncode == 0, done.stderr
    assert tree.calls() == LIVE_WITH_TOKEN
    assert "t-test" not in done.stdout + done.stderr


@needs_bash
def test_deploy_live_refuses_a_dot_env_line_outside_name_value(tmp_path):
    tree = Tree(tmp_path)
    # a bare value would run as a command and print itself; the refusal names the line only
    tree.dot_env("VERCEL_ORG_ID=o-test\nt-secret-value\n")

    done = tree.run("deploy.sh")

    assert done.returncode == 1
    assert ".env line 2" in done.stderr
    assert "t-secret-value" not in done.stdout + done.stderr
    assert tree.calls() == []


@needs_bash
def test_deploy_live_refuses_an_export_line_and_crlf_in_dot_env(tmp_path):
    tree = Tree(tmp_path)

    tree.dot_env("export VERCEL_TOKEN=t-test\n")
    exported = tree.run("deploy.sh")
    # a shell character in the value would run on source; the charset keeps it out
    tree.dot_env("VERCEL_ORG_ID=o-test\nX=a;echo${IFS}t-test>&2\n")
    shell = tree.run("deploy.sh")
    (tree.root / ".env").write_bytes(b"VERCEL_TOKEN=t-test\r\n")
    crlf = tree.run("deploy.sh")

    assert exported.returncode == 1 and ".env line 1" in exported.stderr
    assert shell.returncode == 1 and ".env line 2" in shell.stderr
    assert crlf.returncode == 1 and "CRLF" in crlf.stderr
    for done in (exported, shell, crlf):
        assert "t-test" not in done.stdout + done.stderr
    assert tree.calls() == []


@needs_bash
def test_deploy_live_without_a_token_runs_on_the_login_session(tmp_path):
    tree = Tree(tmp_path)

    done = tree.run("deploy.sh")

    assert done.returncode == 0, done.stderr
    assert tree.calls() == LIVE_WITHOUT_TOKEN


@needs_bash
def test_deploy_live_refuses_without_a_link_or_both_ids(tmp_path):
    tree = Tree(tmp_path)
    tree.link.unlink()

    done = tree.run("deploy.sh", env={"VERCEL_PROJECT_ID": "p-test"})

    assert done.returncode == 1
    assert "VERCEL_ORG_ID" in done.stderr
    assert "vercel link" in done.stderr
    assert tree.calls() == []


@needs_bash
def test_deploy_live_runs_without_a_link_when_both_ids_are_set(tmp_path):
    tree = Tree(tmp_path)
    tree.link.unlink()

    done = tree.run("deploy.sh", env={"VERCEL_ORG_ID": "o-test", "VERCEL_PROJECT_ID": "p-test"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == LIVE_WITHOUT_TOKEN


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
    "uv run hailprint ingest 2026-01-05 @ tree",
    "uv run hailprint parcels 2026-01-05 @ tree",
    "uv run hailprint ingest 2024-06-01 @ tree",
    "uv run hailprint parcels 2024-06-01 @ tree",
]
INGEST_ONLY = [INGEST[0], INGEST[2]]
TAIL = [
    "uv run hailprint score @ tree",
    "uv run hailprint warnings --missing @ tree",
    "uv run hailprint power --missing @ tree",
    "uv run hailprint internet --missing @ tree",
    "uv run hailprint publish @ tree",
]


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
    assert tree.calls() == HEAD + INGEST_ONLY + TAIL + ["deploy @ tree"]
    assert "parcels skipped" in done.stdout


@needs_bash
def test_nightly_skips_a_failed_ingest_day_and_goes_on(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": MISSING_TWO, "STUB_FAIL": "ingest"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + INGEST_ONLY + TAIL + ["deploy @ tree"]
    assert done.stdout.count("failed; skipped") == 2


@needs_bash
def test_nightly_logs_a_failed_parcels_run_and_goes_on(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": MISSING_TWO, "STUB_FAIL": "parcels"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + INGEST + TAIL + ["deploy @ tree"]
    assert "rerun by hand: uv run hailprint parcels 2026-01-05" in done.stdout


@needs_bash
def test_nightly_stops_when_candidates_fails(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": MISSING_TWO, "STUB_FAIL": "candidates"})

    assert done.returncode == 3
    assert tree.calls() == HEAD
    assert not (tree.root / "data" / "nightly.lock").exists()


@needs_bash
def test_nightly_keeps_the_dot_env_token_out_of_the_uv_steps(tmp_path):
    tree = nightly_tree(tmp_path)
    tree.dot_env("VERCEL_TOKEN=t-test\n")

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    assert not any("[token]" in call for call in tree.calls())
    assert "t-test" not in done.stdout + done.stderr


@needs_bash
def test_nightly_refuses_a_bad_dot_env_before_any_step(tmp_path):
    tree = nightly_tree(tmp_path)

    tree.dot_env("export MAX_INGEST=2\n")
    exported = tree.run("nightly.sh", env={"STUB_MISSING": ""})
    (tree.root / ".env").write_bytes(b"MAX_INGEST=2\r\n")
    crlf = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert exported.returncode == 1 and ".env line 1" in exported.stderr
    assert crlf.returncode == 1 and "CRLF" in crlf.stderr
    assert tree.calls() == []
    assert not (tree.root / "data" / "nightly.lock").exists()


@needs_bash
def test_nightly_refuses_a_max_ingest_that_is_not_a_count(tmp_path):
    tree = nightly_tree(tmp_path)

    word = tree.run("nightly.sh", env={"STUB_MISSING": "", "MAX_INGEST": "abc"})
    zero = tree.run("nightly.sh", env={"STUB_MISSING": "", "MAX_INGEST": "0"})

    assert word.returncode == 1 and "MAX_INGEST" in word.stderr
    assert zero.returncode == 1 and "MAX_INGEST" in zero.stderr
    # a shifted .env line can put a token in MAX_INGEST, so the message carries no value
    assert "abc" not in word.stderr
    assert tree.calls() == []
    assert not (tree.root / "data" / "nightly.lock").exists()


@needs_bash
def test_nightly_max_ingest_caps_the_candidates_call(tmp_path):
    tree = nightly_tree(tmp_path)

    tree.run("nightly.sh", env={"STUB_MISSING": "", "MAX_INGEST": "2"})

    assert "uv run hailprint candidates --missing --top 2 @ tree" in tree.calls()


@needs_bash
def test_nightly_reads_max_ingest_from_dot_env(tmp_path):
    tree = nightly_tree(tmp_path)
    tree.dot_env("MAX_INGEST=1\n")

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
def test_nightly_logs_a_failed_warnings_run_and_publishes(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": "", "STUB_FAIL": "warnings"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + TAIL + ["deploy @ tree"]
    assert "warnings failed; publish goes on" in done.stdout


@needs_bash
def test_nightly_runs_power_between_warnings_and_publish(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    calls = tree.calls()
    power = calls.index("uv run hailprint power --missing @ tree")
    assert calls[power - 1] == "uv run hailprint warnings --missing @ tree"
    assert calls[power + 1] == "uv run hailprint internet --missing @ tree"
    assert calls[power + 2] == "uv run hailprint publish @ tree"


@needs_bash
def test_nightly_logs_a_failed_internet_run_and_publishes(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": "", "STUB_FAIL": "internet"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + TAIL + ["deploy @ tree"]
    assert "internet failed; publish goes on" in done.stdout
    assert "power failed" not in done.stdout


@needs_bash
def test_nightly_publishes_without_the_internet_flag_by_default(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    assert not any("--with-internet" in call for call in tree.calls())


@needs_bash
def test_nightly_adds_the_internet_flag_when_dot_env_opts_in(tmp_path):
    tree = nightly_tree(tmp_path)
    tree.dot_env("PUBLISH_INTERNET=1\n")

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == (
        HEAD + TAIL[:-1] + ["uv run hailprint publish --with-internet @ tree", "deploy @ tree"]
    )


@needs_bash
def test_nightly_leaves_the_internet_flag_off_for_any_other_opt_in_value(tmp_path):
    tree = nightly_tree(tmp_path)
    tree.dot_env("PUBLISH_INTERNET=yes\n")

    done = tree.run("nightly.sh", env={"STUB_MISSING": ""})

    assert done.returncode == 0, done.stderr
    assert not any("--with-internet" in call for call in tree.calls())


@needs_bash
def test_nightly_logs_a_failed_power_run_and_publishes(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": "", "STUB_FAIL": "power"})

    assert done.returncode == 0, done.stderr
    assert tree.calls() == HEAD + TAIL + ["deploy @ tree"]
    assert "power failed; publish goes on" in done.stdout
    assert "warnings failed" not in done.stdout


@needs_bash
def test_nightly_max_ingest_limits_ingest_only_and_impact_steps_run_once(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", env={"STUB_MISSING": MISSING_TWO, "MAX_INGEST": "1"})

    assert done.returncode == 0, done.stderr
    calls = tree.calls()
    assert "uv run hailprint candidates --missing --top 1 @ tree" in calls
    for step in ("warnings", "power", "internet"):
        assert calls.count(f"uv run hailprint {step} --missing @ tree") == 1
        assert not any(
            call.startswith(f"uv run hailprint {step}") and "--top" in call for call in calls
        )


@needs_bash
def test_nightly_rejects_an_unknown_argument_with_usage(tmp_path):
    tree = nightly_tree(tmp_path)

    done = tree.run("nightly.sh", "--bogus")

    assert done.returncode == 2
    assert "usage:" in done.stderr
    assert tree.calls() == []


def cron_lines():
    lines = (SCRIPTS / "hailprint.cron").read_text(encoding="utf-8").splitlines()
    entries = [
        ln for ln in lines if ln and not ln.startswith("#") and not ln.split("=")[0].isupper()
    ]
    return lines, entries


def test_cron_entry_starts_the_nightly_run_at_14_utc():
    lines, entries = cron_lines()

    nightly = [ln for ln in entries if "scripts/nightly.sh" in ln]
    assert len(nightly) == 1
    assert nightly[0].startswith("0 14 * * *")
    assert "CRON_TZ=UTC" in lines
    assert any(ln.startswith("PATH=") for ln in lines)


def test_cron_file_holds_the_15_minute_odin_line():
    lines, entries = cron_lines()

    odin = [ln for ln in entries if "hailprint odin" in ln]
    assert len(entries) == 2
    assert odin == [
        "*/15 * * * * cd /path/to/hailprint && uv run hailprint odin >> data/odin.log 2>&1"
    ]
    assert any(ln.startswith("#") and "ODIN" in ln for ln in lines)
