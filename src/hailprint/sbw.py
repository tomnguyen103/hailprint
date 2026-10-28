"""IEM storm-based warnings for one impact window, kept as allow-listed GeoParquet rows.

The impact window runs from 12:00 UTC on the storm date to 12:00 UTC two days later.
"""

import http.client
import json
from datetime import date

import geopandas as gpd
import pandas as pd
from shapely.errors import ShapelyError
from shapely.geometry import shape

from hailprint import county, impact, net

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
# The feed names the polygon times with a `utc_` prefix. The output columns drop it.
FEED_KEY = {"polygon_begin": "utc_polygon_begin", "polygon_end": "utc_polygon_end"}
GEOMETRY_TYPES = ("Polygon", "MultiPolygon")
METADATA = {"source": "iem", "product": "sbw"}


def file_name(storm_date: date) -> str:
    return f"warnings-{storm_date}.parquet"


def fetch(storm_date: date) -> str:
    """Return the IEM feed text for the impact window of the storm date."""
    begin, end = impact.window(storm_date)
    try:
        return net.get(URL.format(begin=begin, end=end), timeout=30).decode()
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"IEM warnings fetch failed for {storm_date}: {exc}") from exc


def _show(value: object) -> str:
    """A feed value for an error message: its repr cut to 40 characters."""
    return _clip(repr(value))


def _clip(text: str) -> str:
    return text if len(text) <= 40 else text[:37] + "..."


def parse(text: str, storm_date: date) -> gpd.GeoDataFrame:
    """Keep the SV, TO, and FF warnings (significance W) of the window that reach a metro county.

    A polygon is in the window when it begins before the window end and ends after the window
    start. A polygon that touches a county edge reaches that county. The rows sort by begin
    time, so the feed order never changes the file. A kept type with no geometry, a missing
    allow-listed property, a null or empty event_label or product_id, or a malformed value
    raises ValueError that names the eventid. The message cuts each feed value to 40 characters.
    """
    try:
        document = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"IEM warnings feed is not JSON: {exc}") from exc
    if not isinstance(document, dict) or not isinstance(document.get("features"), list):
        raise ValueError("IEM warnings feed is not a FeatureCollection")
    start, end = impact.window(storm_date)
    metro = county.metro().geometry.union_all()
    rows = []
    for feature in document["features"]:
        if not isinstance(feature, dict) or not isinstance(feature.get("properties") or {}, dict):
            raise ValueError("IEM warnings feed holds a feature that is not an object")
        props = feature.get("properties") or {}
        if props.get("phenomena") not in PHENOMENA or props.get("significance") != SIGNIFICANCE:
            continue
        eventid = props.get("eventid")
        for key in ALLOWED:
            if FEED_KEY.get(key, key) not in props:
                raise ValueError(f"warning {_show(eventid)} lacks {FEED_KEY.get(key, key)}")
        for key in ("event_label", "product_id"):
            if props[key] is None:
                raise ValueError(f"warning {_show(eventid)} has a null {key}")
            if props[key] == "":
                raise ValueError(f"warning {_show(eventid)} has an empty {key}")
        geometry = feature.get("geometry")
        if geometry is None:
            raise ValueError(f"warning {_show(eventid)} has no geometry")
        try:
            row = {key: props[FEED_KEY.get(key, key)] for key in ALLOWED}
            row["eventid"] = int(row["eventid"])
            row["polygon_begin"] = pd.to_datetime(row["polygon_begin"], utc=True)
            row["polygon_end"] = pd.to_datetime(row["polygon_end"], utc=True)
            if pd.isna(row["polygon_begin"]) or pd.isna(row["polygon_end"]):
                raise ValueError("polygon time is empty")
            if geometry.get("type") not in GEOMETRY_TYPES:
                raise ValueError(f"geometry type {_show(geometry.get('type'))} is not a polygon")
            row["geometry"] = shape(geometry)
            reaches = row["geometry"].intersects(metro)
        except (ShapelyError, TypeError, ValueError, KeyError, AttributeError) as exc:
            raise ValueError(
                f"warning {_show(eventid)} has a malformed value: {_clip(str(exc))}"
            ) from exc
        if reaches and row["polygon_begin"] < end and row["polygon_end"] > start:
            rows.append(row)
    frame = pd.DataFrame(rows, columns=[*ALLOWED, "geometry"])
    frame["eventid"] = frame["eventid"].astype("int64")
    for column in ("polygon_begin", "polygon_end"):
        frame[column] = pd.to_datetime(frame[column], utc=True)
    frame = frame.sort_values(["polygon_begin", "eventid", "phenomena", "product_id"])
    return gpd.GeoDataFrame(frame.reset_index(drop=True), geometry="geometry", crs="EPSG:4326")
