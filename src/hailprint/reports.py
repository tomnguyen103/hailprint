"""SPC preliminary hail reports for one storm date: all rows, near the county, or in Harris."""

import csv
import io
from datetime import date

import geopandas as gpd
import pandas as pd

from hailprint import county, net

SPC_URL = "https://www.spc.noaa.gov/climo/reports/{storm_date:%y%m%d}_rpts_hail.csv"
COLUMNS = ["time", "location", "county", "state", "size_in"]
# shortcut: BUFFER_KM is one constant; upgrade when the scorer needs a per-call radius above 50 km
BUFFER_KM = 50


def fetch_hail_csv(storm_date: date) -> str:
    """Return the SPC hail CSV text for the date."""
    return net.get(SPC_URL.format(storm_date=storm_date), timeout=30).decode()


def parse(text: str) -> gpd.GeoDataFrame:
    """Parse every row into points in EPSG:4326 with time, location, county, state, size_in."""
    rows = [
        {
            "time": row["Time"],
            "location": row["Location"],
            "county": row["County"],
            "state": row["State"],
            # SPC Size is hundredths of an inch
            "size_in": int(row["Size"]) / 100,
            "lat": float(row["Lat"]),
            "lon": float(row["Lon"]),
        }
        for row in csv.DictReader(io.StringIO(text))
    ]
    frame = pd.DataFrame(rows, columns=[*COLUMNS, "lat", "lon"])
    return gpd.GeoDataFrame(
        frame[COLUMNS],
        geometry=gpd.points_from_xy(frame["lon"], frame["lat"]),
        crs="EPSG:4326",
    )


def nearby_reports(storm_date: date, text: str | None = None) -> gpd.GeoDataFrame:
    """Reports within BUFFER_KM of the Harris County outline, measured in EPSG:32615 metres."""
    reports = parse(fetch_hail_csv(storm_date) if text is None else text)
    reach = county.outline().to_crs("EPSG:32615").geometry.union_all().buffer(BUFFER_KM * 1000)
    inside = reports.to_crs("EPSG:32615").geometry.within(reach)
    return reports.loc[inside].reset_index(drop=True)


def harris_reports(storm_date: date, text: str | None = None) -> gpd.GeoDataFrame:
    """The nearby reports whose county is Harris and state is TX."""
    nearby = nearby_reports(storm_date, text)
    keep = (nearby["county"] == "Harris") & (nearby["state"] == "TX")
    return nearby.loc[keep].reset_index(drop=True)
