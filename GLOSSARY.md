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
| Neighbourhood buffer | The 50 km distance (`reports.BUFFER_KM`) around the county outline. `nearby_reports` keeps the SPC reports inside it, by distance only. `harris_reports` keeps the reports named Harris, TX, by name only. Measured in EPSG:32615 metres. |
| WCM end | The last convective day in the WCM database. Storm dates after it have no WCM row. |
| Daily-CSV fill | The Harris County, TX report count for a storm date after the WCM end, taken from the SPC preliminary daily CSV. `report_source` reads `spc-daily`; a WCM row reads `wcm`. SPC may still change a day under four days old, so such a count is preliminary. |
| Scored report | An SPC report that `score_day` keeps: the report point lies inside the scoring domain, the crop shrunk by the scoring radius and one cell. Reports outside it count as excluded. |
| Scoring radius | The distance in km (`score.DEFAULT_RADIUS_KM` = 5, at most `score.MAX_RADIUS_KM` = 20) within which a swath counts as a forecast for a report. Not the neighbourhood buffer. |
| Scoring domain | The Harris bbox shrunk by the scoring radius plus one cell (`score.EDGE_M`). The swath is only known inside the bbox, so a report near its edge is not scored. |
| Contingency table | For one size class and one scoring radius: hits, misses, false alarms, and correct negatives over the scored reports. POD, FAR, CSI, and HSS come from it. |
| Unverifiable area | The part of a swath class, in km2, farther than the scoring radius from every SPC report. No report could confirm or deny hail there. |
| Published file | One JSON or GeoJSON file under `site/data/` that `hailprint publish` writes for the site: `swath.geojson`, `reports.geojson`, `pairs.json`, `zip-counts.json` per storm date, and the `storms.json` index. Each validates against its schema in `src/hailprint/schemas/` and carries a receipt. |
| Receipt | The provenance block of a published file: `storm_date`, `sources` (each with `source`, `product`, and `file`), the one confidence band `swath.CONFIDENCE`, `run_time` (one UTC second per run), and `package_version`. |
| Edge distance | `edge_m`: the signed metre distance from a report point to the swath crop edge, positive inside the Harris bbox and negative outside. A report is scored at radius R when `edge_m > R*1000 + score.EDGE_M`. Stored per report in `pairs.json`, so the browser re-scores at any whole-kilometre radius. |
| Spike | The week-1 run, replaced by `ingest` in week 2. Its evidence stays in `docs/WEEK-01.md`. |
| Scope sidebar | The Storms page tree: storm dates grouped by year, newest first, each with a report-count badge. A 240 px pane at 1280 px and up, a 56 px rail below that, a sheet below 768 px. |
| Storm stamp | The header block of one storm date: the date in mono, the 24-cell 12Z-to-12Z bar with one cell per hour and a filled cell for each hour with a report, the report count, and the max size. |
| Size ruler | The hail-size legend: seven circles at true relative diameter, 0.75 to 2.50 in, each with its object name (penny, quarter, half dollar, walnut, golf ball, hen egg, tennis ball). Also the track of the radius and threshold sliders. |
| Contingency grid | The 2 by 2 block for one size class: hit, miss, false alarm, and unverifiable area, each cell sized by its count. |
| Receipt chip | The mono chip after a number on the site. It opens a drawer with the receipt of the published file that holds the number: source, product, file, run time, and confidence band. |
| Caveat line | The footer text on every page, exact: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm." |
| Inspector | The Storms drawer that opens on a map click: the point, the largest size class that covers it, the nearest report, and one receipt chip. Docked at 1280 px and up, an overlay below, a full-screen sheet below 768 px. |
| Basemap | The optional PMTiles file `site/public/basemap.pmtiles`, an extract of the Harris bbox from the Protomaps build. The map draws it when present and paper with the county outline when absent. |
| Pooled table | The contingency table summed over every published storm date at one scoring radius: one row per size class, the counts added, the metrics recomputed from the sums. `site/src/pool.ts` builds it in the browser; `site/scripts/pool_golden.py` is its Python oracle. |
| Threshold curve | The Scorecard chart of one metric (POD, FAR, CSI, or HSS) against the seven size classes in inches, y from 0 to 1, one marker per class; the HSS view carries the dashed literature line at 0.38. |
| Point check | The Try it tool that takes a latitude and longitude inside the Harris bbox, or a map click, and lists for every storm date the largest size class whose swath holds the point, or "below 0.75 in". |
| Swipe compare | The Try it tool that draws two storm dates on two synced maps in one frame; a native range sets the split where the right map starts. |
| Scoring radius slider | The native range on the Score pane, the Scorecard, and the Tune tool that sets the scoring radius in whole kilometres from 0 to `radius_km_max`; every table re-scores from `pairs.json` at the chosen radius. |
| Method page | One of the five reading pages under `/method/<page>`: Data, Storm date, Size classes, Scoring, Limits. Typed blocks (heading, prose, list, code, figure, caveat) from the one file `site/src/method/content.ts`, in a 680 px column. |
| Prose budget | The test on the Method content: at most 120 words above the fold per page, every sentence at most 25 words, no sentence that starts with an `-ing` form, and the forbidden word absent. `site/src/method/prose.ts`. |
| Guess-then-reveal | The Scoring page widget: a range from 0 to 1 for the pooled HSS of one size class at the default radius. Reveal shows the guess, the actual from the pooled `pairs.json`, and the signed difference. |
| Pipeline view | One of the three views under `/pipeline/<view>`: Runs, Archive, Sources. Each reads `pipeline.json`, the file `publish` writes beside `storms.json`. The sidebar lists three services with a presence dot and the age of the last run. |
| Run log | The Runs view table of publish runs, newest first: run time, package version, storm date count, file count. The pressed row opens the inspector with its storm dates. At most 50 runs, merged by `run_time`. |
| Archive coverage | The Archive view table: per year, the archive days, the days with a 12Z file, and that share as a bar; a total row closes it. Built from the archive index at publish time. |
| Replay frame | One cropped MESH frame of the 2-minute product inside a storm date, for an animation. Cut in PR G: about 720 CONUS GRIB2 files, about 1 GB per storm date (`docs/DECISIONS.md` row 8). |
| Missing candidate day | A candidate day with a 12Z file and no swath file. `hailprint candidates --missing` prints them newest first. |
| Nightly run | `scripts/nightly.sh`: index, missing candidate days, ingest, parcels, score, publish, deploy, under `data/nightly.lock`, at most `MAX_INGEST` storm dates. |
| Deploy | `scripts/deploy.sh`: the prebuilt Vercel flow from a machine that holds `site/data/`. |
| Dry run | `--dry-run`: the build into `site/dist` with the artifact check and no `vercel` call. |
| Cron entry | `scripts/hailprint.cron`: the crontab line at 14:00 UTC that starts the nightly run. |
