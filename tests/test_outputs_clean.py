"""Every written output stays free of owner fields and the forbidden word."""

import json

import pandas as pd
import pyarrow.parquet as pq
import pytest

from hailprint import files, odin, paths, power
from hailprint.parcels import OWNER_FIELDS
from hailprint.swath import FORBIDDEN_WORD

OUTPUT_DIRS = [paths.OUT_DIR, paths.DERIVED_DIR, paths.SITE_DATA_DIR]
SITE_SRC = paths.ROOT / "site" / "src"
SITE_SUFFIXES = (".ts", ".tsx", ".css")
# JSON has no NaN or Infinity literal; a browser JSON.parse rejects both
NON_JSON_TOKENS = ("NaN", "Infinity")
# Byte ceiling of each per-date impact file (spec Q13). The first real build re-checks them.
SIZE_CEILINGS = {"warnings.geojson": 400_000, "power.json": 60_000, "internet.json": 80_000}


PROVENANCE_KEYS = (b"source", b"product", b"confidence")


def output_files(dirs):
    return [p for d in dirs if d.exists() for p in sorted(d.rglob("*")) if p.is_file()]


def scan(dirs):
    """One `<path>: <hit>` row per output file that holds the forbidden word or an owner field."""
    hits = []
    for path in output_files(dirs):
        if path.suffix == ".parquet":
            schema = pq.read_schema(path)
            meta = schema.metadata or {}
            text = " ".join(
                schema.names
                + [k.decode(errors="ignore") for k in meta]
                + [v.decode(errors="ignore") for v in meta.values()]
            )
        else:
            text = path.read_bytes().decode(errors="ignore")
        lowered = text.lower()
        if FORBIDDEN_WORD in lowered:
            hits.append(f"{path}: {FORBIDDEN_WORD}")
        hits += [f"{path}: {field}" for field in OWNER_FIELDS if field.lower() in lowered]
    return hits


def missing_keys(root):
    """One `(path, key)` row per Parquet under the root that lacks a provenance key."""
    return [
        (path, key)
        for path in sorted(root.rglob("*.parquet"))
        for key in PROVENANCE_KEYS
        if key not in (pq.read_schema(path).metadata or {})
    ]


@pytest.mark.skipif(not any(d.exists() for d in OUTPUT_DIRS), reason="no outputs written yet")
def test_outputs_contain_no_owner_field_or_forbidden_word():
    assert scan(OUTPUT_DIRS) == []


@pytest.mark.skipif(not paths.SITE_DATA_DIR.exists(), reason="no published files yet")
def test_published_files_hold_no_non_json_token():
    for path in paths.SITE_DATA_DIR.rglob("*.*json"):
        text = path.read_text(encoding="utf-8")
        for token in NON_JSON_TOKENS:
            assert token not in text, (path, token)


@pytest.mark.skipif(not paths.SITE_DATA_DIR.exists(), reason="no published files yet")
def test_published_impact_files_stay_under_their_size_ceiling():
    for name, ceiling in SIZE_CEILINGS.items():
        for path in paths.SITE_DATA_DIR.rglob(name):
            assert path.stat().st_size < ceiling, path


@pytest.mark.skipif(not paths.SITE_DATA_DIR.exists(), reason="no published files yet")
def test_published_zip_counts_only_hold_houston_77xxx_or_unknown():
    bad = []
    for path in sorted(paths.SITE_DATA_DIR.rglob("zip-counts.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for row in doc.get("zips", []):
            z = row["zip"]
            if z != "unknown" and not (len(z) == 5 and z.startswith("77") and z.isdigit()):
                bad.append((path.name, z))
    assert bad == []


def test_site_source_holds_no_forbidden_word():
    hits = [
        path
        for path in SITE_SRC.rglob("*")
        if path.suffix in SITE_SUFFIXES
        and FORBIDDEN_WORD in path.read_text(encoding="utf-8").lower()
    ]
    assert hits == []


@pytest.mark.skipif(
    not list(paths.DERIVED_DIR.rglob("*.parquet")), reason="no derived Parquet written yet"
)
def test_every_derived_parquet_carries_the_provenance_keys():
    assert missing_keys(paths.DERIVED_DIR) == []


def write_power_files(root):
    """Write one file of each power kind through `write_atomic` with its real metadata."""
    frame = pd.DataFrame({"fips": ["48201"], "customers_out": pd.array([None], dtype="Int64")})
    odin_meta = {**odin.METADATA, "utilities": json.dumps(["CENTERPOINT ENERGY"])}
    kinds = {
        "eaglei/eaglei-2025.parquet": power.METADATA,
        "odin/odin-2026-10-27.parquet": odin.METADATA,
        "power/power-2025-05-20.parquet": power.METADATA,
        "power/power-2026-10-26.parquet": odin_meta,
    }
    for name, metadata in kinds.items():
        files.write_atomic(frame, root / name, metadata)
    return root


def test_the_scan_reads_the_eaglei_odin_and_power_files(tmp_path):
    root = write_power_files(tmp_path)

    found = {p.relative_to(root).as_posix() for p in output_files([root])}

    assert found == {
        "eaglei/eaglei-2025.parquet",
        "odin/odin-2026-10-27.parquet",
        "power/power-2025-05-20.parquet",
        "power/power-2026-10-26.parquet",
    }
    assert scan([root]) == []
    assert missing_keys(root) == []


def test_the_scan_flags_the_forbidden_word_in_a_power_file_metadata(tmp_path):
    root = write_power_files(tmp_path)
    bad = root / "power" / "power-2026-10-26.parquet"
    table = pq.read_table(bad)
    note = {b"note": f"a {FORBIDDEN_WORD} count".encode()}
    pq.write_table(table.replace_schema_metadata({**table.schema.metadata, **note}), bad)

    assert scan([root]) == [f"{bad}: {FORBIDDEN_WORD}"]


def test_the_scan_flags_a_power_file_without_the_provenance_keys(tmp_path):
    root = write_power_files(tmp_path)
    bare = root / "odin" / "odin-2026-10-27.parquet"
    pq.write_table(pq.read_table(bare).replace_schema_metadata({b"source": b"odin"}), bare)

    assert missing_keys(root) == [(bare, b"product"), (bare, b"confidence")]
