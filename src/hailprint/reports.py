"""SPC preliminary hail reports for one storm date, filtered to Harris County, TX."""

import csv
import io
import urllib.request
from datetime import date

import geopandas as gpd
import pandas as pd

SPC_URL = "https://www.spc.noaa.gov/climo/reports/{storm_date:%y%m%d}_rpts_hail.csv"
COLUMNS = ["time", "location", "size_in"]


def fetch_hail_csv(storm_date: date) -> str:
    """Return the SPC hail CSV text for the date."""
    with urllib.request.urlopen(SPC_URL.format(storm_date=storm_date), timeout=30) as response:
        return response.read().decode()


def harris_reports(storm_date: date, text: str | None = None) -> gpd.GeoDataFrame:
    """Parse the Harris, TX rows into points in EPSG:4326 with time, location, size_in."""
    text = fetch_hail_csv(storm_date) if text is None else text
    rows = [
        {
            "time": row["Time"],
            "location": row["Location"],
            # SPC Size is hundredths of an inch
            "size_in": int(row["Size"]) / 100,
            "lat": float(row["Lat"]),
            "lon": float(row["Lon"]),
        }
        for row in csv.DictReader(io.StringIO(text))
        if row["County"] == "Harris" and row["State"] == "TX"
    ]
    frame = pd.DataFrame(rows, columns=[*COLUMNS, "lat", "lon"])
    return gpd.GeoDataFrame(
        frame[COLUMNS],
        geometry=gpd.points_from_xy(frame["lon"], frame["lat"]),
        crs="EPSG:4326",
    )
