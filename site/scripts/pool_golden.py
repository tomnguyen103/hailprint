"""The pooled table at every whole radius, the oracle for site/src/pool.test.ts.

Run with `uv run python site/scripts/pool_golden.py`. The output is `site/data/pooled-golden.json`,
gitignored like the rest of `site/data/`.
"""

import json
from typing import Any

import pandas as pd

from hailprint import files, paths, publish, score

GOLDEN_FILE = "pooled-golden.json"
ROW_KEYS = [
    *score.CLASS_COLUMNS,
    "report_count",
    *score.COUNT_COLUMNS,
    *score.METRIC_COLUMNS,
    *score.AREA_COLUMNS,
]


def _cell(value: Any) -> Any:
    if isinstance(value, str):
        return value
    if pd.isna(value):
        return None
    return float(value) if isinstance(value, float) else int(value)


def rows(table: pd.DataFrame) -> list[dict[str, Any]]:
    """The PooledRow keys in order; a count stays an int, a NaN metric becomes null."""
    return [{key: _cell(record[key]) for key in ROW_KEYS} for record in table.to_dict("records")]


def main() -> None:
    storms_dir = paths.SITE_DATA_DIR / publish.STORMS_DIR
    docs = [
        json.loads(path.read_text("utf-8"))
        for path in sorted(storms_dir.glob(f"*/{publish.PAIRS_FILE}"))
    ]
    if not docs:
        raise SystemExit(f"no {publish.PAIRS_FILE} under {storms_dir}")
    tops = {doc["radius_km_max"] for doc in docs}
    if len(tops) != 1:
        raise SystemExit(f"mixed radius_km_max across pairs files: {sorted(tops)}")
    top = tops.pop()
    radii = {
        str(radius): rows(score.pool([publish.rescore(doc, radius) for doc in docs]))
        for radius in range(top + 1)
    }
    text = json.dumps({"radius_km_max": top, "radii": radii}, indent=1, allow_nan=False)
    out = files.write_text_atomic(text + "\n", paths.SITE_DATA_DIR / GOLDEN_FILE)
    print(f"{out}: {len(docs)} storm dates, R 0..{top}")


if __name__ == "__main__":
    main()
