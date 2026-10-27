"""IEM storm-based warnings for one impact window, kept as allow-listed GeoParquet rows.

The impact window runs from 12:00 UTC on the storm date to 12:00 UTC two days later.
"""

import http.client
import json
from datetime import UTC, date, datetime, timedelta

import geopandas as gpd
import pandas as pd
from shapely.errors import ShapelyError
from shapely.geometry import shape

from hailprint import county, net

URL = (
    "https://mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson"
    "?begints={begin:%Y-%m-%dT%H:%MZ}&endts={end:%Y-%m-%dT%H:%MZ}&wfo=HGX"
)
PHENOMENA = ("SV", "TO", "FF")
SIGNIFICANCE = "W"
# The feed also carries free text and tag fields. Only these properties leave this module.
ALLOWED = (
    "phenomena",
    "significance",
    "event_label",
    "eventid",
    "polygon_begin",
    "polygon_end",
    "product_id",
)
METADATA = {"source": "iem", "product": "sbw"}
WINDOW = timedelta(hours=48)


def window(storm_date: date) -> tuple[datetime, datetime]:
    """The impact window of the storm date: 12:00 UTC on D up to 12:00 UTC on D+2."""
    start = datetime(storm_date.year, storm_date.month, storm_date.day, 12, tzinfo=UTC)
    return start, start + WINDOW


def file_name(storm_date: date) -> str:
    return f"warnings-{storm_date}.parquet"


def fetch(storm_date: date) -> str:
    """Return the IEM feed text for the impact window of the storm date."""
    begin, end = window(storm_date)
    try:
        return net.get(URL.format(begin=begin, end=end), timeout=30).decode()
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"IEM warnings fetch failed for {storm_date}: {exc}") from exc


def parse(text: str, storm_date: date) -> gpd.GeoDataFrame:
    """Keep the SV, TO, and FF warnings (significance W) of the window that reach a metro county.

    A polygon is in the window when it begins before the window end and ends after the window
    start. A polygon that touches a county edge reaches that county. The rows sort by begin
    time, so the feed order never changes the file. A kept type with no geometry, a missing
    allow-listed property, or a malformed value raises ValueError that names the eventid.
    """
    try:
        document = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"IEM warnings feed is not JSON: {exc}") from exc
    if not isinstance(document, dict) or not isinstance(document.get("features"), list):
        raise ValueError("IEM warnings feed is not a FeatureCollection")
    start, end = window(storm_date)
    metro = county.metro().geometry.union_all()
    rows = []
    for feature in document["features"]:
        props = feature.get("properties") or {}
        if props.get("phenomena") not in PHENOMENA or props.get("significance") != SIGNIFICANCE:
            continue
        eventid = props.get("eventid")
        for key in ALLOWED:
            if key not in props:
                raise ValueError(f"warning {eventid} lacks {key}")
        if feature.get("geometry") is None:
            raise ValueError(f"warning {eventid} has no geometry")
        try:
            row = {key: props[key] for key in ALLOWED}
            row["eventid"] = int(row["eventid"])
            row["polygon_begin"] = pd.to_datetime(row["polygon_begin"], utc=True)
            row["polygon_end"] = pd.to_datetime(row["polygon_end"], utc=True)
            row["geometry"] = shape(feature["geometry"])
            reaches = row["geometry"].intersects(metro)
        except (ShapelyError, TypeError, ValueError, KeyError) as exc:
            raise ValueError(f"warning {eventid} has a malformed value: {exc}") from exc
        if reaches and row["polygon_begin"] < end and row["polygon_end"] > start:
            rows.append(row)
    frame = pd.DataFrame(rows, columns=[*ALLOWED, "geometry"])
    frame["eventid"] = frame["eventid"].astype("int64")
    for column in ("polygon_begin", "polygon_end"):
        frame[column] = pd.to_datetime(frame[column], utc=True)
    frame = frame.sort_values(["polygon_begin", "eventid", "phenomena", "product_id"])
    return gpd.GeoDataFrame(frame.reset_index(drop=True), geometry="geometry", crs="EPSG:4326")
