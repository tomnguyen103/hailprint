# Glossary

Domain terms for Hailprint. Code, tests, docs, commits, and chat use these names.

| Term | Meaning |
|---|---|
| MESH | Maximum Estimated Size of Hail. The MRMS radar product that estimates hail diameter in millimetres per grid cell. |
| MRMS | Multi-Radar Multi-Sensor. The NOAA system that publishes MESH on a 0.01 degree CONUS grid every 2 minutes. |
| Daily max | The cell-wise maximum of every `MESH_Max_1440min_00.50` file stamped on one UTC date. One raster per storm date. |
| Storm date | The UTC calendar date of a daily max. Named `YYYY-MM-DD` in files and `storm_date` in tables. |
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
| Spike | The week-1 run: one storm date from bucket to PNG. |
