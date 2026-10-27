"""Every written output stays free of owner fields and the forbidden word."""

import pyarrow.parquet as pq
import pytest

from hailprint import paths
from hailprint.parcels import OWNER_FIELDS
from hailprint.swath import FORBIDDEN_WORD

OUTPUT_DIRS = [paths.OUT_DIR, paths.DERIVED_DIR, paths.SITE_DATA_DIR]
SITE_SRC = paths.ROOT / "site" / "src"
SITE_SUFFIXES = (".ts", ".tsx", ".css")
# JSON has no NaN or Infinity literal; a browser JSON.parse rejects both
NON_JSON_TOKENS = ("NaN", "Infinity")


def _files():
    return [p for d in OUTPUT_DIRS if d.exists() for p in d.rglob("*") if p.is_file()]


@pytest.mark.skipif(not any(d.exists() for d in OUTPUT_DIRS), reason="no outputs written yet")
def test_outputs_contain_no_owner_field_or_forbidden_word():
    for path in _files():
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
        assert FORBIDDEN_WORD not in lowered, path
        for field in OWNER_FIELDS:
            assert field.lower() not in lowered, (path, field)


@pytest.mark.skipif(not paths.SITE_DATA_DIR.exists(), reason="no published files yet")
def test_published_files_hold_no_non_json_token():
    for path in paths.SITE_DATA_DIR.rglob("*.*json"):
        text = path.read_text(encoding="utf-8")
        for token in NON_JSON_TOKENS:
            assert token not in text, (path, token)


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
    for path in paths.DERIVED_DIR.rglob("*.parquet"):
        meta = pq.read_schema(path).metadata or {}
        for key in (b"source", b"product", b"confidence"):
            assert key in meta, (path, key)
