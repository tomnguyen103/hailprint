import hashlib
from io import BytesIO
from pathlib import Path

import pytest

from hailprint import cloud


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
    s3 = FakeS3({("hailprint-state", "../escape.txt"): b"bad"})

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
