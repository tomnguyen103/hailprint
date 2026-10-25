"""Every written output stays free of owner fields and the forbidden word."""

from pathlib import Path

import pyarrow.parquet as pq
import pytest

from hailprint.parcels import OWNER_FIELDS

OUTPUT_DIRS = [Path("out"), Path("data/derived")]
FORBIDDEN_WORD = "damage"


def _files():
    return [p for d in OUTPUT_DIRS if d.exists() for p in d.rglob("*") if p.is_file()]


@pytest.mark.skipif(not any(d.exists() for d in OUTPUT_DIRS), reason="no outputs written yet")
def test_outputs_contain_no_owner_field_or_forbidden_word():
    for path in _files():
        if path.suffix == ".parquet":
            schema = pq.read_schema(path)
            text = " ".join(
                schema.names + [v.decode(errors="ignore") for v in schema.metadata.values()]
            )
        else:
            text = path.read_bytes().decode(errors="ignore")
        lowered = text.lower()
        assert FORBIDDEN_WORD not in lowered, path
        for field in OWNER_FIELDS:
            assert field.lower() not in lowered, (path, field)
