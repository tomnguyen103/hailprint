import hashlib
import subprocess
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pytest

from hailprint import __main__ as cli
from hailprint import cloud, paths


class FakeS3:
    def __init__(self, initial: dict[tuple[str, str], bytes] | None = None) -> None:
        self.objects: dict[tuple[str, str], bytes] = dict(initial or {})
        self.puts: list[tuple[str, str, dict[str, str]]] = []
        self.deletes: list[tuple[str, str]] = []
        self.events: list[tuple[str, str, str]] = []

    def list_objects_v2(
        self,
        *,
        Bucket: str,
        Prefix: str = "",
        ContinuationToken: str | None = None,
    ) -> dict:
        keys = sorted(k for (b, k) in self.objects if b == Bucket and k.startswith(Prefix))
        start = int(ContinuationToken) if ContinuationToken is not None else 0
        page = keys[start : start + 2]
        out: dict = {"Contents": [{"Key": k} for k in page]}
        if start + 2 < len(keys):
            out["IsTruncated"] = True
            out["NextContinuationToken"] = str(start + 2)
        else:
            out["IsTruncated"] = False
        return out

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        body = self.objects[(Bucket, Key)]
        return {"Body": BytesIO(body)}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, **extra: str) -> None:
        self.objects[(Bucket, Key)] = Body
        self.puts.append((Bucket, Key, extra))
        self.events.append(("put", Bucket, Key))

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.objects.pop((Bucket, Key), None)
        self.deletes.append((Bucket, Key))
        self.events.append(("delete", Bucket, Key))


VALID_ENV = {
    "SUPABASE_S3_ENDPOINT": "https://example.supabase.co/storage/v1/s3",
    "SUPABASE_S3_REGION": "us-east-1",
    "SUPABASE_S3_ACCESS_KEY_ID": "ak_test_id",
    "SUPABASE_S3_SECRET_ACCESS_KEY": "sk_super_secret_value",
    "HAILPRINT_STATE_BUCKET": "hailprint-state",
    "HAILPRINT_PUBLIC_BUCKET": "hailprint-public",
}


def test_config_from_env_reads_all_six_variables():
    cfg = cloud.Config.from_env(VALID_ENV)

    assert cfg.endpoint == "https://example.supabase.co/storage/v1/s3"
    assert cfg.region == "us-east-1"
    assert cfg.access_key_id == "ak_test_id"
    assert cfg.secret_access_key == "sk_super_secret_value"
    assert cfg.state_bucket == "hailprint-state"
    assert cfg.public_bucket == "hailprint-public"


def test_config_from_env_rejects_missing_vars_without_leaking_values():
    env = dict(VALID_ENV)
    del env["SUPABASE_S3_SECRET_ACCESS_KEY"]
    env["HAILPRINT_PUBLIC_BUCKET"] = ""

    with pytest.raises(ValueError) as exc_info:
        cloud.Config.from_env(env)

    msg = str(exc_info.value)
    assert "SUPABASE_S3_SECRET_ACCESS_KEY" in msg
    assert "HAILPRINT_PUBLIC_BUCKET" in msg
    assert "sk_super_secret_value" not in msg
    assert "ak_test_id" not in msg


def test_sync_down_and_sync_up_skip_unchanged_and_order_public_uploads(tmp_path: Path):
    s3 = FakeS3(
        {
            ("hailprint-state", "raw/spc/1955-2025_hail.csv.zip"): b"wcm-bytes",
            ("hailprint-state", "derived/index/candidate-days.csv"): b"storm_date\n2024-05-28\n",
            ("hailprint-public", "storms/2024-05-28/swath.geojson"): b'{"old":1}',
            ("hailprint-public", "storms.json"): b'{"storms":["2024-05-28"]}',
        }
    )
    data_dir = tmp_path / "data"
    site_dir = tmp_path / "site" / "data"

    state = cloud.sync_down(s3, "hailprint-state", ("raw/spc/", "derived/"), data_dir)
    pub_state = cloud.sync_down(s3, "hailprint-public", ("",), site_dir)

    assert (data_dir / "raw" / "spc" / "1955-2025_hail.csv.zip").read_bytes() == b"wcm-bytes"
    assert (
        state.digests[("hailprint-state", "raw/spc/1955-2025_hail.csv.zip")]
        == hashlib.sha256(b"wcm-bytes").hexdigest()
    )

    # Mutate candidate-days.csv; keep wcm-bytes unchanged
    (data_dir / "derived" / "index" / "candidate-days.csv").write_bytes(
        b"storm_date\n2024-05-28\n2025-05-01\n"
    )
    uploaded_state = cloud.sync_up(s3, "hailprint-state", ("raw/spc/", "derived/"), data_dir, state)
    assert uploaded_state == ["derived/index/candidate-days.csv"]

    # Add a new storm date and update root index files in site/data
    new_storm_dir = site_dir / "storms" / "2025-05-01"
    new_storm_dir.mkdir(parents=True, exist_ok=True)
    (new_storm_dir / "swath.geojson").write_bytes(b'{"type":"FeatureCollection"}')
    (new_storm_dir / "pairs.json").write_bytes(b'{"pairs":[]}')
    (site_dir / "storms.json").write_bytes(b'{"storms":["2025-05-01","2024-05-28"]}')
    (site_dir / "pipeline.json").write_bytes(b'{"runs":[]}')

    s3.puts.clear()
    uploaded_pub = cloud.sync_up(s3, "hailprint-public", ("",), site_dir, pub_state, public=True)

    assert uploaded_pub == [
        "storms/2025-05-01/pairs.json",
        "storms/2025-05-01/swath.geojson",
        "pipeline.json",
        "storms.json",
    ]
    put_meta = {key: extra for (_, key, extra) in s3.puts}
    assert put_meta["storms/2025-05-01/swath.geojson"] == {
        "CacheControl": "max-age=60",
        "ContentType": "application/geo+json",
    }
    assert put_meta["storms.json"] == {
        "CacheControl": "max-age=60",
        "ContentType": "application/json",
    }


def test_sync_down_and_sync_up_on_empty_or_clean_tree_perform_zero_puts(tmp_path: Path):
    s3 = FakeS3()
    data_dir = tmp_path / "data"

    state = cloud.sync_down(s3, "hailprint-state", ("raw/spc/", "derived/"), data_dir)
    assert state.digests == {}

    uploaded = cloud.sync_up(s3, "hailprint-state", ("raw/spc/", "derived/"), data_dir, state)
    assert uploaded == []
    assert s3.puts == []


def test_sync_down_rejects_unsafe_keys(tmp_path: Path):
    for bad_key in ("../escape.txt", "/abs/path.txt", "C:/win/escape.txt", "a\\b.txt"):
        s3 = FakeS3({("hailprint-state", bad_key): b"bad"})
        with pytest.raises(ValueError, match="unsafe S3 key"):
            cloud.sync_down(s3, "hailprint-state", ("",), tmp_path / "data")


def test_sync_up_excludes_odin_prefix_on_state_upload(tmp_path: Path):
    s3 = FakeS3()
    data_dir = tmp_path / "data"
    state = cloud.sync_down(s3, "hailprint-state", ("raw/spc/", "derived/"), data_dir)

    (data_dir / "derived" / "odin").mkdir(parents=True)
    (data_dir / "derived" / "odin" / "odin-2026-10-29.parquet").write_bytes(b"odin")
    (data_dir / "derived" / "scores.parquet").write_bytes(b"scores")

    uploaded = cloud.sync_up(
        s3,
        "hailprint-state",
        ("raw/spc/", "derived/"),
        data_dir,
        state,
        exclude_prefixes=("derived/odin/",),
    )

    assert uploaded == ["derived/scores.parquet"]
    assert ("hailprint-state", "derived/odin/odin-2026-10-29.parquet") not in s3.objects


def test_sync_up_mirror_deletes_stale_public_objects_after_index_upload(tmp_path: Path):
    s3 = FakeS3(
        {
            ("hailprint-public", "storms/2024-05-28/swath.geojson"): b'{"swath":1}',
            ("hailprint-public", "storms/2024-05-28/internet.json"): b'{"internet":1}',
            ("hailprint-public", "storms.json"): b'{"old":true}',
        }
    )
    site_dir = tmp_path / "site" / "data"
    pub_state = cloud.sync_down(s3, "hailprint-public", ("",), site_dir)

    # Simulate publish removing stale internet.json and updating storms.json + swath.geojson
    (site_dir / "storms" / "2024-05-28" / "internet.json").unlink()
    (site_dir / "storms" / "2024-05-28" / "swath.geojson").write_bytes(b'{"swath":2}')
    (site_dir / "storms.json").write_bytes(b'{"old":false}')

    s3.events.clear()
    cloud.sync_up(s3, "hailprint-public", ("",), site_dir, pub_state, public=True, mirror=True)

    assert s3.events == [
        ("put", "hailprint-public", "storms/2024-05-28/swath.geojson"),
        ("put", "hailprint-public", "storms.json"),
        ("delete", "hailprint-public", "storms/2024-05-28/internet.json"),
    ]
    assert ("hailprint-public", "storms/2024-05-28/internet.json") not in s3.objects


def test_parse_max_ingest_accepts_default_and_positive_integers_and_rejects_bad_values():
    assert cloud.parse_max_ingest({}) == 5
    assert cloud.parse_max_ingest({"MAX_INGEST": "1"}) == 1
    assert cloud.parse_max_ingest({"MAX_INGEST": "12"}) == 12

    for bad in ("0", "-2", "abc", "", "5;rm"):
        with pytest.raises(ValueError) as exc_info:
            cloud.parse_max_ingest({"MAX_INGEST": bad})
        assert str(exc_info.value) == "MAX_INGEST must be a whole number from 1"
        if bad:
            assert bad not in str(exc_info.value)


def test_nightly_runs_pipeline_in_order_and_skips_parcels_without_gdb(tmp_path: Path):
    calls: list[list[str]] = []

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n"
                "2025-05-01,10,2.0,True,wcm\n"
                "2024-05-28,9,2.0,True,wcm\n",
                encoding="utf-8",
            )
        return 0

    rc = cloud.nightly(fake_cli, tmp_path, env={"MAX_INGEST": "2"})

    assert rc == 0
    assert calls == [
        ["index"],
        ["candidates", "--missing", "--top", "2"],
        ["ingest", "2025-05-01"],
        ["ingest", "2024-05-28"],
        ["score"],
        ["warnings", "--missing"],
        ["power", "--missing"],
        ["internet", "--missing"],
        ["publish"],
    ]


def test_nightly_runs_parcels_when_gdb_present_and_passes_with_internet(tmp_path: Path):
    (tmp_path / "data" / "raw" / "hcad" / "extracted" / "Parcels.gdb").mkdir(parents=True)
    calls: list[list[str]] = []

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n"
                "2025-05-01,10,2.0,True,wcm\n",
                encoding="utf-8",
            )
        return 0

    rc = cloud.nightly(fake_cli, tmp_path, env={"MAX_INGEST": "1", "PUBLISH_INTERNET": "1"})

    assert rc == 0
    assert calls == [
        ["index"],
        ["candidates", "--missing", "--top", "1"],
        ["ingest", "2025-05-01"],
        ["parcels", "2025-05-01"],
        ["score"],
        ["warnings", "--missing"],
        ["power", "--missing"],
        ["internet", "--missing"],
        ["publish", "--with-internet"],
    ]


def test_nightly_continues_when_one_ingest_or_addon_layer_fails(tmp_path: Path, capsys):
    calls: list[list[str]] = []

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n"
                "2025-05-02,10,2.0,True,wcm\n"
                "2025-05-01,9,2.0,True,wcm\n",
                encoding="utf-8",
            )
            return 0
        if argv == ["ingest", "2025-05-02"]:
            return 1
        if argv[0] in ("warnings", "power", "internet"):
            return 1
        return 0

    rc = cloud.nightly(fake_cli, tmp_path, env={})
    err = capsys.readouterr().err

    assert rc == 0
    assert ["ingest", "2025-05-01"] in calls
    assert ["publish"] in calls
    assert "ingest 2025-05-02 failed; skipped" in err
    assert "warnings failed; publish goes on" in err
    assert "power failed; publish goes on" in err
    assert "internet failed; publish goes on" in err


def test_backfill_fetches_only_missing_eaglei_years_and_publishes(tmp_path: Path):
    eaglei_dir = tmp_path / "data" / "derived" / "eaglei"
    eaglei_dir.mkdir(parents=True)
    (eaglei_dir / "eaglei-2023.parquet").write_bytes(b"2023")
    calls: list[list[str]] = []

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        return 0

    rc = cloud.backfill(fake_cli, tmp_path, env={"PUBLISH_INTERNET": "1"})

    assert rc == 0
    assert calls == [
        ["warnings", "--missing"],
        ["eaglei", "2020", "2021", "2022", "2024", "2025"],
        ["power", "--missing"],
        ["internet", "--missing"],
        ["publish", "--with-internet"],
    ]


def test_run_cloud_nightly_syncs_down_runs_and_syncs_up_without_odin(tmp_path: Path):
    s3 = FakeS3(
        {
            ("hailprint-state", "raw/spc/1955-2025_hail.csv.zip"): b"wcm",
            ("hailprint-public", "storms/2024-05-28/internet.json"): b'{"old":1}',
            ("hailprint-public", "storms.json"): b'{"storms":[]}',
        }
    )
    calls: list[list[str]] = []

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n",
                encoding="utf-8",
            )
        if argv == ["publish"]:
            # Simulate publish writing a new file, updating storms.json, removing internet.json
            (tmp_path / "data" / "derived" / "scores").mkdir(parents=True, exist_ok=True)
            (tmp_path / "data" / "derived" / "scores" / "pooled.parquet").write_bytes(b"pooled")
            (tmp_path / "data" / "derived" / "odin").mkdir(parents=True, exist_ok=True)
            (tmp_path / "data" / "derived" / "odin" / "odin-2026-10-29.parquet").write_bytes(
                b"should-not-upload"
            )
            (tmp_path / "site" / "data" / "storms" / "2024-05-28" / "internet.json").unlink()
            (tmp_path / "site" / "data" / "storms" / "2024-05-28" / "swath.geojson").write_bytes(
                b'{"type":"FeatureCollection"}'
            )
            (tmp_path / "site" / "data" / "storms.json").write_bytes(b'{"storms":["2024-05-28"]}')
        return 0

    rc = cloud.run_cloud(
        "nightly",
        client=s3,
        root=tmp_path,
        env=VALID_ENV,
        run_cli=fake_cli,
    )

    assert rc == 0
    assert ("hailprint-state", "derived/scores/pooled.parquet") in s3.objects
    assert ("hailprint-state", "derived/odin/odin-2026-10-29.parquet") not in s3.objects
    assert ("hailprint-public", "storms/2024-05-28/swath.geojson") in s3.objects
    assert ("hailprint-public", "storms/2024-05-28/internet.json") not in s3.objects


def test_run_cloud_odin_syncs_only_todays_odin_file_and_skips_upload_on_failure(tmp_path: Path):
    now = datetime(2026, 10, 29, 14, 7, tzinfo=UTC)
    odin_key = "derived/odin/odin-2026-10-29.parquet"
    s3 = FakeS3(
        {
            ("hailprint-state", odin_key): b"slot-1",
            ("hailprint-state", "raw/spc/1955-2025_hail.csv.zip"): b"wcm",
        }
    )

    def ok_cli(argv: list[str]) -> int:
        assert argv == ["odin"]
        (tmp_path / "data" / odin_key).write_bytes(b"slot-1+slot-2")
        return 0

    rc = cloud.run_cloud("odin", client=s3, root=tmp_path, env=VALID_ENV, run_cli=ok_cli, now=now)
    assert rc == 0
    assert not (tmp_path / "data" / "raw" / "spc" / "1955-2025_hail.csv.zip").exists()
    assert s3.objects[("hailprint-state", odin_key)] == b"slot-1+slot-2"

    s3.puts.clear()

    def fail_cli(argv: list[str]) -> int:
        return 1

    rc_fail = cloud.run_cloud(
        "odin", client=s3, root=tmp_path, env=VALID_ENV, run_cli=fail_cli, now=now
    )
    assert rc_fail == 1
    assert s3.puts == []


def test_cli_cloud_subcommand_routes_to_run_cloud(monkeypatch):
    recorded: list[str] = []

    def fake_run_cloud(task: str) -> int:
        recorded.append(task)
        return 0

    monkeypatch.setattr(cloud, "run_cloud", fake_run_cloud)

    assert cli.main(["cloud", "nightly"]) == 0
    assert cli.main(["cloud", "odin"]) == 0
    assert cli.main(["cloud", "backfill"]) == 0
    assert recorded == ["nightly", "odin", "backfill"]


def test_requirements_txt_matches_uv_export():
    req_path = paths.ROOT / "requirements.txt"
    assert req_path.is_file()
    proc = subprocess.run(
        ["uv", "export", "--no-dev", "--no-hashes"],
        cwd=paths.ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert req_path.read_text(encoding="utf-8") == proc.stdout


def test_trigger_project_files_and_schedules_exist():
    cfg = (paths.ROOT / "trigger.config.ts").read_text(encoding="utf-8")
    assert 'requirementsFile: "./requirements.txt"' in cfg
    assert 'dirs: ["./trigger"]' in cfg
    assert "maxDuration: 3600" in cfg

    nightly_ts = (paths.ROOT / "trigger" / "nightly.ts").read_text(encoding="utf-8")
    assert 'id: "nightly"' in nightly_ts
    assert "30 13 * * *" in nightly_ts
    assert "medium-1x" in nightly_ts
    assert "concurrencyLimit: 1" in nightly_ts
    assert '"cloud", "nightly"' in nightly_ts

    odin_ts = (paths.ROOT / "trigger" / "odin.ts").read_text(encoding="utf-8")
    assert 'id: "odin"' in odin_ts
    assert "0 * * * *" in odin_ts
    assert "small-1x" in odin_ts
    assert "concurrencyLimit: 1" in odin_ts
    assert '"cloud", "odin"' in odin_ts

    backfill_ts = (paths.ROOT / "trigger" / "backfill.ts").read_text(encoding="utf-8")
    assert 'id: "backfill"' in backfill_ts
    assert "medium-1x" in backfill_ts
    assert "concurrencyLimit: 1" in backfill_ts
    assert '"cloud", "backfill"' in backfill_ts

    hello_ts = (paths.ROOT / "trigger" / "hello.ts").read_text(encoding="utf-8")
    assert 'id: "hello"' in hello_ts

    for removed in (
        paths.ROOT / "scripts" / "nightly.sh",
        paths.ROOT / "scripts" / "deploy.sh",
        paths.ROOT / "scripts" / "hailprint.cron",
        paths.ROOT / "tests" / "test_scripts.py",
    ):
        assert not removed.exists(), f"{removed} should be removed"


def test_s3_client_exchanges_session_token_when_access_key_has_colon_credentials(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch(project_ref: str, anon_key: str, email: str, password: str) -> str:
        captured["fetch"] = (project_ref, anon_key, email, password)
        return "jwt-token-123"

    def fake_boto3_client(service: str, **kwargs: object) -> dict[str, object]:
        captured["boto"] = (service, kwargs)
        return kwargs

    monkeypatch.setattr(cloud, "_fetch_session_token", fake_fetch)
    monkeypatch.setattr(cloud.boto3, "client", fake_boto3_client)

    cfg = cloud.Config(
        endpoint="https://ref.storage.supabase.co/storage/v1/s3",
        region="us-east-1",
        access_key_id="ref:worker@example.com:s3cret",
        secret_access_key="anon-jwt",
        state_bucket="hailprint-state",
        public_bucket="hailprint-public",
    )
    cloud.s3_client(cfg)
    assert captured["fetch"] == ("ref", "anon-jwt", "worker@example.com", "s3cret")
    service, kwargs = captured["boto"]  # type: ignore[misc]
    assert service == "s3"
    assert kwargs["aws_access_key_id"] == "ref"  # type: ignore[index]
    assert kwargs["aws_secret_access_key"] == "anon-jwt"  # type: ignore[index]
    assert kwargs["aws_session_token"] == "jwt-token-123"  # type: ignore[index]


def test_s3_client_rejects_malformed_project_ref():
    cfg = cloud.Config(
        endpoint="https://ref.storage.supabase.co/storage/v1/s3",
        region="us-east-1",
        access_key_id="bad@evil.com:worker@example.com:s3cret",
        secret_access_key="anon-jwt",
        state_bucket="hailprint-state",
        public_bucket="hailprint-public",
    )
    with pytest.raises(ValueError, match="project_ref"):
        cloud.s3_client(cfg)


def test_sync_down_rejects_oversized_s3_object_and_disallowed_public_key(tmp_path: Path):
    s3_big = FakeS3({("hailprint-state", "raw/spc/big.bin"): b"12345678901"})
    with pytest.raises(RuntimeError, match="exceeds"):
        cloud.sync_down(s3_big, "hailprint-state", ("raw/spc/",), tmp_path / "data", max_bytes=10)
    assert not (tmp_path / "data" / "raw" / "spc" / "big.bin").exists()

    s3_bad_pub = FakeS3({("hailprint-public", "storms/2024-05-28/evil.html"): b"<html>"})
    with pytest.raises(ValueError, match="unsafe S3 key"):
        cloud.sync_down(
            s3_bad_pub, "hailprint-public", ("",), tmp_path / "site" / "data", public=True
        )


def test_collect_local_keys_ignores_symlinks(tmp_path: Path):
    base = tmp_path / "site" / "data"
    base.mkdir(parents=True)
    secret = tmp_path / "secret.txt"
    secret.write_text("top-secret", encoding="utf-8")
    (base / "storms.json").write_text("{}", encoding="utf-8")
    link = base / "leak.json"
    try:
        link.symlink_to(secret)
    except OSError:
        pytest.skip("symlinks not supported in this environment")
    keys = cloud._collect_local_keys(base, ("",), ())
    assert keys == ["storms.json"]


def test_run_cloud_propagates_custom_root_and_now_to_default_cli(tmp_path: Path, monkeypatch):
    s3 = FakeS3()
    fixed_now = datetime(2026, 10, 29, 23, 59, 59, tzinfo=UTC)
    monkeypatch.setattr(
        cli.odin,
        "fetch",
        lambda: '{"total_count": 0, "results": []}',
    )
    rc = cloud.run_cloud("odin", client=s3, root=tmp_path, env=VALID_ENV, now=fixed_now)
    assert rc == 0
    expected_key = "derived/odin/odin-2026-10-29.parquet"
    assert (tmp_path / "data" / expected_key).exists()
    assert ("hailprint-state", expected_key) in s3.objects


def test_run_cloud_odin_syncs_both_days_across_midnight(tmp_path: Path):
    pre_now = datetime(2026, 10, 29, 23, 59, 59, tzinfo=UTC)
    day1_key = "derived/odin/odin-2026-10-29.parquet"
    day2_key = "derived/odin/odin-2026-10-30.parquet"
    s3 = FakeS3(
        {
            ("hailprint-state", day1_key): b"day1",
            ("hailprint-state", day2_key): b"existing-day2",
        }
    )

    def midnight_cli(argv: list[str]) -> int:
        assert argv == ["odin"]
        assert (tmp_path / "data" / day2_key).read_bytes() == b"existing-day2"
        (tmp_path / "data" / day2_key).write_bytes(b"existing-day2+midnight")
        return 0

    rc = cloud.run_cloud(
        "odin", client=s3, root=tmp_path, env=VALID_ENV, run_cli=midnight_cli, now=pre_now
    )
    assert rc == 0
    assert s3.objects.get(("hailprint-state", day2_key)) == b"existing-day2+midnight"


def test_run_cloud_nightly_skips_sync_up_when_cli_returns_nonzero_even_with_existing_storms_json(
    tmp_path: Path,
):
    s3 = FakeS3({("hailprint-public", "storms.json"): b'{"storms":[]}'})

    def partial_cli(argv: list[str]) -> int:
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n",
                encoding="utf-8",
            )
        if argv == ["publish"]:
            storm_dir = tmp_path / "site" / "data" / "storms" / "2024-05-28"
            storm_dir.mkdir(parents=True, exist_ok=True)
            (storm_dir / "swath.geojson").write_bytes(b'{"type":"FeatureCollection"}')
            return 1
        return 0

    rc = cloud.run_cloud("nightly", client=s3, root=tmp_path, env=VALID_ENV, run_cli=partial_cli)
    assert rc == 1
    assert s3.puts == []
    assert ("hailprint-public", "storms/2024-05-28/swath.geojson") not in s3.objects


def _publish_cli(tmp_path: Path, publish_rc: int, calls: list[list[str]]):
    """A fake CLI: an empty candidate file, and a publish that writes one file and exits rc."""

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n",
                encoding="utf-8",
            )
        if argv == ["publish"]:
            storm_dir = tmp_path / "site" / "data" / "storms" / "2024-05-28"
            storm_dir.mkdir(parents=True, exist_ok=True)
            (storm_dir / "swath.geojson").write_bytes(b'{"type":"FeatureCollection"}')
            scores = tmp_path / "data" / "derived" / "scores"
            scores.mkdir(parents=True, exist_ok=True)
            (scores / "pooled.parquet").write_bytes(b"pooled")
            return publish_rc
        return 0

    return fake_cli


@pytest.mark.parametrize("task", ["nightly", "backfill"])
def test_run_cloud_uploads_state_and_public_files_after_a_partial_publish_and_returns_3(
    tmp_path: Path, task: str
):
    s3 = FakeS3({("hailprint-public", "storms.json"): b'{"storms":[]}'})
    calls: list[list[str]] = []

    rc = cloud.run_cloud(
        task, client=s3, root=tmp_path, env=VALID_ENV, run_cli=_publish_cli(tmp_path, 3, calls)
    )

    assert rc == 3
    assert ["publish"] in calls
    assert ("hailprint-state", "derived/scores/pooled.parquet") in s3.objects
    assert ("hailprint-public", "storms/2024-05-28/swath.geojson") in s3.objects


def test_run_cloud_nightly_uploads_nothing_when_index_fails_before_publish(tmp_path: Path):
    s3 = FakeS3({("hailprint-public", "storms.json"): b'{"storms":[]}'})
    calls: list[list[str]] = []
    publish_cli = _publish_cli(tmp_path, 0, calls)

    def failing_index(argv: list[str]) -> int:
        return 1 if argv == ["index"] else publish_cli(argv)

    rc = cloud.run_cloud("nightly", client=s3, root=tmp_path, env=VALID_ENV, run_cli=failing_index)

    assert rc == 1
    assert calls == []
    assert s3.puts == []


@pytest.mark.parametrize("task", ["nightly", "backfill"])
def test_run_cloud_builds_a_fresh_client_for_the_upload_phase(
    tmp_path: Path, monkeypatch, task: str
):
    built: list[FakeS3] = []

    def fake_s3_client(config: cloud.Config) -> FakeS3:
        built.append(FakeS3({("hailprint-public", "storms.json"): b'{"storms":[]}'}))
        return built[-1]

    monkeypatch.setattr(cloud, "s3_client", fake_s3_client)
    calls: list[list[str]] = []

    rc = cloud.run_cloud(
        task, root=tmp_path, env=VALID_ENV, run_cli=_publish_cli(tmp_path, 0, calls)
    )

    assert rc == 0
    assert len(built) == 2
    assert built[0].puts == []
    assert ("hailprint-public", "storms/2024-05-28/swath.geojson") in built[1].objects


def test_run_cloud_with_an_injected_client_serves_both_phases_with_it(tmp_path: Path, monkeypatch):
    def no_client(config: cloud.Config) -> FakeS3:
        raise AssertionError("an injected client builds no other client")

    monkeypatch.setattr(cloud, "s3_client", no_client)
    s3 = FakeS3({("hailprint-public", "storms.json"): b'{"storms":[]}'})
    calls: list[list[str]] = []

    rc = cloud.run_cloud(
        "nightly", client=s3, root=tmp_path, env=VALID_ENV, run_cli=_publish_cli(tmp_path, 0, calls)
    )

    assert rc == 0
    assert ("hailprint-public", "storms/2024-05-28/swath.geojson") in s3.objects


def test_run_cloud_odin_uploads_its_own_day_keys_and_never_a_stale_local_odin_file(
    tmp_path: Path,
):
    now = datetime(2026, 10, 29, 14, 7, tzinfo=UTC)
    odin_key = "derived/odin/odin-2026-10-29.parquet"
    stale = tmp_path / "data" / "derived" / "odin" / "odin-2020-01-01.parquet"
    stale.parent.mkdir(parents=True)
    stale.write_bytes(b"stale")
    s3 = FakeS3()

    def ok_cli(argv: list[str]) -> int:
        (tmp_path / "data" / odin_key).write_bytes(b"slot")
        return 0

    rc = cloud.run_cloud("odin", client=s3, root=tmp_path, env=VALID_ENV, run_cli=ok_cli, now=now)

    assert rc == 0
    assert [key for _, key, _ in s3.puts] == [odin_key]


def test_sync_up_enforces_max_bytes_boundary(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(cloud, "MAX_BYTES", 10)
    s3 = FakeS3()
    data_dir = tmp_path / "data"
    state = cloud.SyncState()
    raw_dir = data_dir / "raw" / "spc"
    raw_dir.mkdir(parents=True)

    (raw_dir / "exact.bin").write_bytes(b"0123456789")
    uploaded = cloud.sync_up(s3, "hailprint-state", ("raw/spc/",), data_dir, state)
    assert uploaded == ["raw/spc/exact.bin"]

    (raw_dir / "a_small.bin").write_bytes(b"ok")
    (raw_dir / "big.bin").write_bytes(b"0123456789X")
    with pytest.raises(RuntimeError, match="local file raw/spc/big.bin exceeds 10 bytes"):
        cloud.sync_up(s3, "hailprint-state", ("raw/spc/",), data_dir, state)
    assert ("hailprint-state", "raw/spc/big.bin") not in s3.objects
    assert ("hailprint-state", "raw/spc/a_small.bin") not in s3.objects


def test_operations_doc_describes_user_token_fallback():
    ops_text = (paths.ROOT / "docs" / "operations.md").read_text(encoding="utf-8")
    assert "project_ref:email:password" in ops_text


def test_nightly_calls_candidates_missing_days_directly_when_candidate_csv_exists(
    tmp_path: Path,
):
    cand_dir = tmp_path / "data" / "derived" / "index"
    cand_dir.mkdir(parents=True)
    (cand_dir / "candidate-days.csv").write_text(
        "storm_date,report_count,max_size_in,has_12z,report_source\n"
        "2025-05-01,8,2.0,True,wcm\n"
        "2024-05-28,5,1.5,True,wcm\n",
        encoding="utf-8",
    )
    calls: list[list[str]] = []

    def silent_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        return 0

    rc = cloud.nightly(silent_cli, tmp_path, env={"MAX_INGEST": "1"})
    assert rc == 0
    assert ["ingest", "2025-05-01"] in calls


def test_trigger_tasks_share_pipeline_queue_and_pin_uv():
    cfg = (paths.ROOT / "trigger.config.ts").read_text(encoding="utf-8")
    assert "ghcr.io/astral-sh/uv:0.7.2" in cfg
    assert "ghcr.io/astral-sh/uv:latest" not in cfg
    assert "cp -a /opt/python/cpython-*/* /usr/local/" in cfg

    nightly_ts = (paths.ROOT / "trigger" / "nightly.ts").read_text(encoding="utf-8")
    backfill_ts = (paths.ROOT / "trigger" / "backfill.ts").read_text(encoding="utf-8")
    assert 'name: "pipeline"' in nightly_ts
    assert 'name: "pipeline"' in backfill_ts


def test_sync_up_public_skips_disallowed_keys(tmp_path: Path):
    s3 = FakeS3()
    site_dir = tmp_path / "site" / "data"
    pub_state = cloud.sync_down(s3, "hailprint-public", ("",), site_dir)
    site_dir.mkdir(parents=True, exist_ok=True)

    (site_dir / "storms.json").write_bytes(b'{"storms":[]}')
    (site_dir / ".DS_Store").write_bytes(b"junk")
    (site_dir / "notes.txt").write_bytes(b"junk")

    uploaded = cloud.sync_up(s3, "hailprint-public", ("",), site_dir, pub_state, public=True)
    assert uploaded == ["storms.json"]
    assert ("hailprint-public", ".DS_Store") not in s3.objects
    assert ("hailprint-public", "notes.txt") not in s3.objects


def test_nightly_returns_nonzero_when_candidate_csv_missing_after_candidates(
    tmp_path: Path, capsys
):
    rc = cloud.nightly(lambda _argv: 0, tmp_path, env={"MAX_INGEST": "1"})
    assert rc == 1
    assert "no candidate-days.csv" in capsys.readouterr().err


def test_config_from_env_rejects_non_https_endpoint():
    env = dict(VALID_ENV)
    env["SUPABASE_S3_ENDPOINT"] = "http://example.supabase.co/storage/v1/s3"
    with pytest.raises(ValueError, match="SUPABASE_S3_ENDPOINT must start with https://"):
        cloud.Config.from_env(env)


def test_s3_client_rejects_single_colon_access_key_id():
    cfg = cloud.Config(
        endpoint="https://ref.storage.supabase.co/storage/v1/s3",
        region="us-east-1",
        access_key_id="ref:only_one_colon",
        secret_access_key="anon-jwt",
        state_bucket="hailprint-state",
        public_bucket="hailprint-public",
    )
    with pytest.raises(
        ValueError,
        match="SUPABASE_S3_ACCESS_KEY_ID with ':' must have format project_ref:email:password",
    ):
        cloud.s3_client(cfg)


def test_nightly_and_backfill_continue_when_score_or_eaglei_fails(tmp_path: Path, capsys):
    cand_dir = tmp_path / "data" / "derived" / "index"
    cand_dir.mkdir(parents=True)
    (cand_dir / "candidate-days.csv").write_text(
        "storm_date,report_count,max_size_in,has_12z,report_source\n",
        encoding="utf-8",
    )
    nightly_calls: list[list[str]] = []

    def fail_score_cli(argv: list[str]) -> int:
        nightly_calls.append(list(argv))
        return 1 if argv == ["score"] else 0

    assert cloud.nightly(fail_score_cli, tmp_path, env={}) == 0
    assert ["publish"] in nightly_calls
    assert "score failed; publish goes on" in capsys.readouterr().err

    backfill_calls: list[list[str]] = []

    def fail_eaglei_cli(argv: list[str]) -> int:
        backfill_calls.append(list(argv))
        return 1 if argv[0] == "eaglei" else 0

    assert cloud.backfill(fail_eaglei_cli, tmp_path, env={}) == 0
    assert ["publish"] in backfill_calls
    assert "eaglei failed; publish goes on" in capsys.readouterr().err


LIVE_NAMES = ("now.json", "swath.geojson", "reports.geojson", "warnings.geojson")


def test_public_key_re_live_names(tmp_path: Path):
    for name in LIVE_NAMES:
        cloud._validate_key(f"live/{name}", tmp_path, public=True)
    for bad in ("live/notes.json", "live/x/now.json", "live/now.json.tmp", "live/", "now.json"):
        with pytest.raises(ValueError, match="unsafe S3 key"):
            cloud._validate_key(bad, tmp_path, public=True)


def _write_live(site_dir: Path, tag: bytes) -> None:
    live_dir = site_dir / "live"
    live_dir.mkdir(parents=True, exist_ok=True)
    for name in LIVE_NAMES:
        (live_dir / name).write_bytes(tag + name.encode())


def test_live_syncs_only_live_prefix(tmp_path: Path):
    s3 = FakeS3(
        {
            ("hailprint-state", "raw/spc/1955-2025_hail.csv.zip"): b"wcm",
            ("hailprint-public", "storms.json"): b'{"storms":[]}',
            ("hailprint-public", "live/swath.geojson"): b"same:swath.geojson",
        }
    )
    site_dir = tmp_path / "site" / "data"
    calls: list[list[str]] = []

    def fake_cli(argv: list[str]) -> int:
        calls.append(list(argv))
        assert (site_dir / "live" / "swath.geojson").read_bytes() == b"same:swath.geojson"
        _write_live(site_dir, b"new:")
        (site_dir / "live" / "swath.geojson").write_bytes(b"same:swath.geojson")
        (site_dir / "live" / "extra.json").write_bytes(b"junk")
        return 0

    rc = cloud.run_cloud("live", client=s3, root=tmp_path, env=VALID_ENV, run_cli=fake_cli)

    assert rc == 0
    assert calls == [["live"]]
    assert not (site_dir / "storms.json").exists()
    assert not (tmp_path / "data").exists()
    # the unchanged swath file stays; now.json uploads last
    assert [key for _, key, _ in s3.puts] == [
        "live/reports.geojson",
        "live/warnings.geojson",
        "live/now.json",
    ]
    assert all(b == "hailprint-public" for b, _, _ in s3.puts)
    assert all(extra["CacheControl"] == "max-age=60" for _, _, extra in s3.puts)
    assert s3.deletes == []


def test_live_first_run_uploads_all_four(tmp_path: Path):
    s3 = FakeS3()

    def fake_cli(argv: list[str]) -> int:
        _write_live(tmp_path / "site" / "data", b"new:")
        return 0

    assert cloud.run_cloud("live", client=s3, root=tmp_path, env=VALID_ENV, run_cli=fake_cli) == 0
    keys = [key for _, key, _ in s3.puts]
    assert sorted(keys) == sorted(f"live/{name}" for name in LIVE_NAMES)
    assert keys[-1] == "live/now.json"


def test_live_failure_uploads_nothing(tmp_path: Path):
    s3 = FakeS3({("hailprint-public", "live/now.json"): b"old"})

    def fail_cli(argv: list[str]) -> int:
        _write_live(tmp_path / "site" / "data", b"partial:")
        return 1

    rc = cloud.run_cloud("live", client=s3, root=tmp_path, env=VALID_ENV, run_cli=fail_cli)

    assert rc == 1
    assert s3.puts == []
    assert s3.objects[("hailprint-public", "live/now.json")] == b"old"


@pytest.mark.parametrize("task", ["nightly", "backfill"])
def test_nightly_excludes_live_prefix(tmp_path: Path, task: str):
    s3 = FakeS3(
        {
            ("hailprint-public", "storms.json"): b'{"storms":[]}',
            ("hailprint-public", "live/now.json"): b"live-owned",
            ("hailprint-public", "live/swath.geojson"): b"live-owned",
        }
    )
    site_dir = tmp_path / "site" / "data"

    def fake_cli(argv: list[str]) -> int:
        if argv[:2] == ["candidates", "--missing"]:
            cand_dir = tmp_path / "data" / "derived" / "index"
            cand_dir.mkdir(parents=True, exist_ok=True)
            (cand_dir / "candidate-days.csv").write_text(
                "storm_date,report_count,max_size_in,has_12z,report_source\n", encoding="utf-8"
            )
        if argv[0] == "publish":
            (site_dir / "storms.json").write_bytes(b'{"storms":["2024-05-28"]}')
            # a local live file (a manual run) never uploads from nightly or backfill
            _write_live(site_dir, b"local:")
        return 0

    rc = cloud.run_cloud(task, client=s3, root=tmp_path, env=VALID_ENV, run_cli=fake_cli)

    assert rc == 0
    assert [key for b, key, _ in s3.puts if b == "hailprint-public"] == ["storms.json"]
    assert s3.deletes == []
    assert s3.objects[("hailprint-public", "live/now.json")] == b"live-owned"
    assert s3.objects[("hailprint-public", "live/swath.geojson")] == b"live-owned"


def test_trigger_live_task_runs_every_10_minutes_on_its_own_queue():
    live_ts = (paths.ROOT / "trigger" / "live.ts").read_text(encoding="utf-8")
    assert 'id: "live"' in live_ts
    assert 'cron: "*/10 * * * *"' in live_ts
    assert 'machine: "small-2x"' in live_ts
    assert 'name: "live"' in live_ts
    assert "concurrencyLimit: 1" in live_ts
    assert '"cloud", "live"' in live_ts


def test_cli_cloud_live_routes_to_run_cloud(monkeypatch):
    recorded: list[str] = []
    monkeypatch.setattr(cloud, "run_cloud", lambda task: recorded.append(task) or 0)

    assert cli.main(["cloud", "live"]) == 0
    assert recorded == ["live"]


def test_config_repr_hides_credentials_and_sync_down_rejects_out_of_prefix_keys(tmp_path: Path):
    cfg = cloud.Config.from_env(VALID_ENV)
    assert VALID_ENV["SUPABASE_S3_ACCESS_KEY_ID"] not in repr(cfg)
    assert VALID_ENV["SUPABASE_S3_SECRET_ACCESS_KEY"] not in repr(cfg)

    class RogueS3(FakeS3):
        def list_objects_v2(
            self,
            *,
            Bucket: str,
            Prefix: str = "",
            ContinuationToken: str | None = None,
        ) -> dict:
            return {"Contents": [{"Key": "other/secret.bin", "Size": 2}], "IsTruncated": False}

    s3 = RogueS3({("hailprint-state", "other/secret.bin"): b"no"})
    with pytest.raises(ValueError, match="unsafe S3 key"):
        cloud.sync_down(s3, "hailprint-state", ("raw/spc/",), tmp_path / "data")


def test_sync_down_skips_get_object_when_local_md5_matches_single_part_etag(tmp_path: Path):
    payload = b"cached-wcm-bytes"
    etag = f'"{hashlib.md5(payload).hexdigest()}"'  # noqa: S324

    class ETagS3(FakeS3):
        def list_objects_v2(
            self,
            *,
            Bucket: str,
            Prefix: str = "",
            ContinuationToken: str | None = None,
        ) -> dict:
            return {
                "Contents": [
                    {"Key": "raw/spc/1955-2025_hail.csv.zip", "Size": len(payload), "ETag": etag}
                ],
                "IsTruncated": False,
            }

        def get_object(self, *, Bucket: str, Key: str) -> dict:
            raise AssertionError("get_object should be skipped when local MD5 matches ETag")

    data_dir = tmp_path / "data"
    local_file = data_dir / "raw" / "spc" / "1955-2025_hail.csv.zip"
    local_file.parent.mkdir(parents=True, exist_ok=True)
    local_file.write_bytes(payload)

    s3 = ETagS3({("hailprint-state", "raw/spc/1955-2025_hail.csv.zip"): payload})
    state = cloud.sync_down(s3, "hailprint-state", ("raw/spc/",), data_dir)
    assert (
        state.digests[("hailprint-state", "raw/spc/1955-2025_hail.csv.zip")]
        == hashlib.sha256(payload).hexdigest()
    )


def test_sync_down_skips_prior_state_digest_and_fetches_remaining_in_parallel(
    tmp_path: Path,
):
    payload_a = b"cached-by-sha256"
    payload_b = b"remote-file-b"
    payload_c = b"remote-file-c"
    data_dir = tmp_path / "data"
    local_a = data_dir / "derived" / "a.parquet"
    local_a.parent.mkdir(parents=True, exist_ok=True)
    local_a.write_bytes(payload_a)

    prior = cloud.SyncState(
        digests={("hailprint-state", "derived/a.parquet"): hashlib.sha256(payload_a).hexdigest()}
    )
    fetched: list[str] = []

    class TrackingS3(FakeS3):
        def get_object(self, *, Bucket: str, Key: str) -> dict:
            fetched.append(Key)
            return super().get_object(Bucket=Bucket, Key=Key)

    s3 = TrackingS3(
        {
            ("hailprint-state", "derived/a.parquet"): payload_a,
            ("hailprint-state", "derived/b.parquet"): payload_b,
            ("hailprint-state", "derived/c.parquet"): payload_c,
        }
    )
    state = cloud.sync_down(
        s3, "hailprint-state", ("derived/",), data_dir, prior_state=prior
    )
    assert "derived/a.parquet" not in fetched
    assert sorted(fetched) == ["derived/b.parquet", "derived/c.parquet"]
    assert (data_dir / "derived" / "b.parquet").read_bytes() == payload_b
    assert (data_dir / "derived" / "c.parquet").read_bytes() == payload_c
    assert len(state.digests) == 3


def test_trigger_tasks_handle_partial_exit_3_and_hello_checks_env():
    nightly_ts = (paths.ROOT / "trigger" / "nightly.ts").read_text(encoding="utf-8")
    backfill_ts = (paths.ROOT / "trigger" / "backfill.ts").read_text(encoding="utf-8")
    hello_ts = (paths.ROOT / "trigger" / "hello.ts").read_text(encoding="utf-8")

    assert "PARTIAL_EXIT = 3" in nightly_ts
    assert "partial: true" in nightly_ts
    assert "console.warn" in nightly_ts
    assert "PARTIAL_EXIT = 3" in backfill_ts
    assert "partial: true" in backfill_ts
    assert "console.warn" in backfill_ts
    assert "REQUIRED_ENV" in hello_ts
    assert "envReady" in hello_ts
    assert "versions" in hello_ts

