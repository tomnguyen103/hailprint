"""ODIN county outages: one snapshot of the open incidents per 15-minute slot.

ODIN shows the incidents open now and keeps no history. `snapshot` turns one grouped answer
into rows for the 8 metro counties. `merge` adds those rows to the file of the UTC day.
The sum counts every open incident, planned ones included.
"""

import http.client
import json
from datetime import UTC, date, datetime
from urllib.parse import quote, urlencode

import pandas as pd

from hailprint import county, net

# shortcut: ODIN covers CenterPoint only and keeps no history,
# upgrade when ORNL publishes an archive
ENDPOINT = (
    "https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
    "odin-real-time-outages-county/records"
)
# One request returns one row per county and utility, so a storm with thousands of incidents
# still fits the page. The query has no cause filter.
URL = (
    ENDPOINT
    + "?"
    + urlencode(
        {
            "select": "communitydescriptor,name,sum(metersaffected) as customers_out",
            "where": "communitydescriptor IN ("
            + ",".join(f'"{fips}"' for fips in sorted(county.METRO_NAMES))
            + ")",
            "group_by": "communitydescriptor,name",
            "limit": 100,
        },
        quote_via=quote,
    )
)
METADATA = {"source": "odin", "product": "odin-real-time-outages-county"}
SLOT_MINUTES = 15
NO_INCIDENT = ""  # the utility of the 0 row of a county with no open incident
COLUMNS = ("slot_utc", "fips", "utility", "customers_out")
KEY = ["slot_utc", "fips", "utility"]


def slot_of(moment: datetime) -> datetime:
    """Return the quarter hour at or before the moment, in UTC."""
    if moment.tzinfo is None:
        raise ValueError(f"the time has no time zone: {moment!r}")
    utc = moment.astimezone(UTC)
    return utc.replace(minute=utc.minute - utc.minute % SLOT_MINUTES, second=0, microsecond=0)


def file_name(day: date) -> str:
    """The name of the day file: one file per UTC day."""
    return f"odin-{day}.parquet"


def fetch() -> str:
    """Return the answer text of the grouped query."""
    try:
        return net.get(URL, timeout=30).decode("utf-8")
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"ODIN fetch failed: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise ValueError(f"ODIN answer is not UTF-8 text: {exc}") from exc


def _record(record: object, index: int) -> tuple[str, str, int]:
    """Return (fips, utility, customers_out) of one record, or raise ValueError."""
    if not isinstance(record, dict):
        raise ValueError(f"ODIN record {index} is not an object")
    fips = record.get("communitydescriptor")
    name = record.get("name")
    count = record.get("customers_out")
    if not isinstance(fips, str) or not isinstance(name, str):
        raise ValueError(f"ODIN record {index} lacks a text communitydescriptor or name")
    utility = name.split(",")[0].strip()
    if not utility:
        raise ValueError(f"ODIN record {index} has an empty utility name")
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        raise ValueError(f"ODIN record {index} lacks a whole customers_out of 0 or more")
    return fips, utility, count


def snapshot(response: str | bytes, slot: datetime) -> pd.DataFrame:
    """Return the rows of one grouped answer: the customers out per metro county and utility.

    The utility is the `name` text before the comma. Records of one county and utility sum.
    A FIPS outside the metro drops. A metro county with no record gets one row with 0 and an
    empty utility: a successful fetch found no open incident there. A body that is not an
    answer, a bad record, or a truncated answer raises ValueError, so the slot stays a gap.
    """
    try:
        document = json.loads(response)
    except ValueError as exc:
        raise ValueError(f"ODIN answer is not JSON: {exc}") from exc
    results = document.get("results") if isinstance(document, dict) else None
    if not isinstance(results, list):
        raise ValueError("ODIN answer holds no results list")
    total = document.get("total_count")
    if isinstance(total, int) and total > len(results):
        raise ValueError(f"ODIN answer is truncated: {len(results)} of {total} rows")
    sums: dict[tuple[str, str], int] = {}
    for index, record in enumerate(results):
        fips, utility, count = _record(record, index)
        if fips in county.METRO_NAMES:
            sums[fips, utility] = sums.get((fips, utility), 0) + count
    covered = {fips for fips, _ in sums}
    sums.update({(fips, NO_INCIDENT): 0 for fips in county.METRO_NAMES if fips not in covered})
    frame = pd.DataFrame(
        [(fips, utility, count) for (fips, utility), count in sorted(sums.items())],
        columns=["fips", "utility", "customers_out"],
    ).astype({"customers_out": "int64"})
    frame.insert(0, "slot_utc", pd.Timestamp(slot).as_unit("us"))
    return frame


def merge(existing: pd.DataFrame | None, fresh: pd.DataFrame) -> pd.DataFrame:
    """Return the day rows with the slot of `fresh` replaced, sorted by slot, FIPS, and utility.

    A rerun in one slot overwrites that slot, so a slot never holds two rows of one key.
    """
    if existing is None:
        return fresh
    kept = existing.assign(slot_utc=existing["slot_utc"].dt.as_unit("us"))
    kept = kept.loc[~kept["slot_utc"].isin(fresh["slot_utc"])]
    return pd.concat([kept, fresh], ignore_index=True).sort_values(KEY, ignore_index=True)
