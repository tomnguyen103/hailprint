# Glossary

Domain terms for Hailprint. Code, tests, docs, commits, and chat use these names.

| Term | Meaning |
|---|---|
| MESH | Maximum Estimated Size of Hail. The MRMS radar product that estimates hail diameter in millimetres per grid cell. |
| MRMS | Multi-Radar Multi-Sensor. The NOAA system that publishes MESH on a 0.01 degree CONUS grid every 2 minutes. |
| Daily max | The one `MESH_Max_1440min_00.50` file stamped D+1 12:00 UTC. It holds the cell-wise maximum over the SPC convective day D. One raster per storm date. |
| Storm date | The SPC convective day of a daily max. Named `YYYY-MM-DD` in files and `storm_date` in tables. |
| Convective day | The SPC day D: 12:00 UTC on D to 12:00 UTC on D+1. A CST report time minus 6 hours gives its date. |
| 12Z file | The MESH file stamped `-120000` in the folder D+1. The only file `ingest` reads for storm date D. |
| Archive index | One row per MESH archive day: `storm_date`, `file_count`, `bytes`, `has_12z`. Built by `hailprint index` from one bucket listing. |
| Candidate day | One storm date in the archive era with at least one Harris County, TX hail report in the WCM database or the daily-CSV fill, ranked by report count then max size. |
| Parcel count | The number of distinct `hcad_num` values whose parcel intersects one size class. One row per class per storm date. |
| WCM database | The SPC Warning Coordination Meteorologist hail file `1955-2025_hail.csv.zip`: the quality-controlled record of hail reports with county FIPS in `f1..f4`. |
| Sentinel | A negative MRMS cell value that is not a size: `-3` means no radar coverage, `-1` means no data. Masked before any arithmetic. |
| Harris bbox | The bounds of the Harris County outline padded by 0.05 degree. Every raster is cropped to it. |
| County outline | The Harris County polygon, GEOID `48201`, from the Census cartographic boundary file `cb_2024_us_county_500k`. |
| Size class | One hail-size threshold in millimetres: 19.05, 25.4, 31.75, 38.1, 44.45, 50.8, 63.5 (0.75 to 2.5 inch). |
| Swath | The dissolved polygon of every cell whose daily max is at or above one size class. Classes nest. |
| Swath file | One GeoParquet per storm date, one row per size class, with the confidence metadata. |
| Radar-estimated hail size | The only phrase that describes a swath or a parcel value. Never "damaged" or "damage". |
| Confidence band | The literature skill note attached to every output: HSS about 0.38 at 30 mm against dense ground truth (Ortega 2018). |
| SPC report | One row of the SPC preliminary hail CSV for a day: time, size in hundredths of an inch, location, county, state, lat, lon. |
| Parcel | One HCAD parcel polygon in EPSG:2278 keyed by the 13-digit `hcad_num`. |
| Owner fields | HCAD columns that identify or reach a person: `CurrOwner`, `mail_addr_1`, `mail_addr_2`, `mail_city`, `mail_state`, `mail_zip`, `LocAddr`, `LocNum`, `LocName`. Dropped at load, never written. |
| Parcel allow-list | The HCAD columns that survive load: `HCAD_NUM_1`, `LOWPARCELID`, `zip`, `city`, `yr_impr`, `StatedArea`, `Stacked`, geometry. |
| Neighbourhood buffer | The 50 km distance (`reports.BUFFER_KM`) around the county outline. `nearby_reports` keeps the SPC reports inside it, by distance only. `harris_reports` keeps the
reports named Harris, TX, by name only. Measured in EPSG:32615 metres. |
| WCM end | The last convective day in the WCM database. Storm dates after it have no WCM row. |
| Daily-CSV fill | The Harris County, TX report count for a storm date after the WCM end, taken from the SPC preliminary daily CSV. `report_source` reads `spc-daily`; a WCM row reads `wcm`. SPC may still change a day under
four days old, so such a count is preliminary. |
| Spike | The week-1 run, replaced by `ingest` in week 2. Its evidence stays in `docs/WEEK-01.md`. |
