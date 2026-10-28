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
| Metro counties | Harris and its seven neighbours: Fort Bend, Montgomery, Brazoria, Galveston, Waller, Liberty, and Chambers. The scope of the impact layers only. Hail, scoring, and parcels stay Harris only (`docs/DECISIONS.md` row 11). |
| Metro outlines | The 8 county polygons of the metro counties, from `cb_2024_us_county_500k`. `county.metro()` returns them. `County outline` keeps its meaning: the Harris polygon. |
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
| Published file | One JSON or GeoJSON file under `site/data/` that `hailprint publish` writes for the site: `swath.geojson`, `reports.geojson`, `pairs.json`, `zip-counts.json`, `warnings.geojson` (only where `warnings` ran and the file reads), `power.json` (only where `power` ran and the file reads), and `internet.json` (only where `internet` ran, the file reads, and `publish` used `--with-internet`) per storm date, and the `storms.json` index. Each validates against its schema in `src/hailprint/schemas/` and carries a receipt. |
| Stale file | An existing ZIP count, warnings, power, or internet file of a date that the run published and did not write. A run without `--with-internet` also adds every `internet.json`. `publish` removes each stale file after it writes `storms.json`, and the index lists it as null. |
| Receipt | The provenance block of a published file: `storm_date`, `sources` (each with `source`, `product`, and `file`), the one confidence band `swath.CONFIDENCE`, `run_time` (one UTC second per run), and `package_version`. |
| Edge distance | `edge_m`: the signed metre distance from a report point to the swath crop edge, positive inside the Harris bbox and negative outside. A report is scored at radius R when `edge_m > R*1000 + score.EDGE_M`. Stored per report in `pairs.json`, so the browser re-scores at any whole-kilometre radius. |
| Spike | The week-1 run, replaced by `ingest` in week 2. Its evidence stays in `docs/reports/week-01.md`. |
| Scope sidebar | The Storms page tree: storm dates grouped by year, newest first, each with a report-count badge. A 240 px pane at 1280 px and up, a 56 px rail below that, a sheet below 768 px. |
| Storm stamp | The header block of one storm date: the date in mono, the 24-cell 12Z-to-12Z bar with one cell per hour and a filled cell for each hour with a report, the report count, and the max size. |
| Size ruler | The hail-size legend: seven circles at true relative diameter, 0.75 to 2.50 in, each with its object name (penny, quarter, half dollar, walnut, golf ball, hen egg, tennis ball). Also the track of the radius and threshold sliders. |
| Contingency grid | The 2 by 2 block for one size class: hit, miss, false alarm, and unverifiable area, each cell sized by its count. |
| Receipt chip | The mono chip after a number on the site. It opens a drawer with the receipt of the published file that holds the number: source, product, file, run time, and confidence band. |
| Caveat line | The footer text on every page, exact: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm." |
| Inspector | The Storms drawer that opens on a map click: the point, the largest size class that covers it, the nearest report, and one receipt chip. Docked at 1280 px and up, an overlay below, a full-screen sheet below 768 px. |
| Basemap | The optional PMTiles file `site/public/basemap.pmtiles`, an extract of the metro bbox, the Metro outlines padded by 0.05 degree, from the Protomaps build. The map draws it when present and paper with the county outline when absent. |
| Pooled table | The contingency table summed over every published storm date at one scoring radius: one row per size class, the counts added, the metrics recomputed from the sums. `site/src/pool.ts` builds it in the browser; `site/scripts/pool_golden.py` is its Python oracle. |
| Threshold curve | The Scorecard chart of one metric (POD, FAR, CSI, or HSS) against the seven size classes in inches, y from 0 to 1, one marker per class; the HSS view carries the dashed literature line at 0.38. |
| Point check | The Try it tool that takes a latitude and longitude inside the Harris bbox, or a map click, and lists for every storm date the largest size class whose swath holds the point, or "below 0.75 in". |
| Swipe compare | The Try it tool that draws two storm dates on two synced maps in one frame; a native range sets the split where the right map starts. |
| Scoring radius slider | The native range on the Score pane, the Scorecard, and the Tune tool that sets the scoring radius in whole kilometres from 0 to `radius_km_max`; every table re-scores from `pairs.json` at the chosen radius. |
| Method page | One of the six reading pages under `/method/<page>`: Data, Storm date, Size classes, Scoring, Limits, Impacts. Typed blocks (heading, prose, list, code, figure, caveat) from the one file `site/src/method/content.ts`, in a 680 px column. |
| Prose budget | The test on the Method content: at most 120 words above the fold per page, every sentence at most 25 words, no sentence that starts with an `-ing` form, and the forbidden word absent. `site/src/method/prose.ts`. |
| Guess-then-reveal | The Scoring page widget: a range from 0 to 1 for the pooled HSS of one size class at the default radius. Reveal shows the guess, the actual from the pooled `pairs.json`, and the signed difference. |
| Pipeline view | One of the three views under `/pipeline/<view>`: Runs, Archive, Sources. Each reads `pipeline.json`, the file `publish` writes beside `storms.json`. The sidebar lists three services with a presence dot and the age of the last run. |
| Run log | The Runs view table of publish runs, newest first: run time, package version, storm date count, file count. The pressed row opens the inspector with its storm dates. At most 50 runs, merged by `run_time`. |
| Archive coverage | The Archive view table: per year, the archive days, the days with a 12Z file, and that share as a bar; a total row closes it. Built from the archive index at publish time. |
| Replay frame | One cropped MESH frame of the 2-minute product inside a storm date, for an animation. Cut in PR G: about 720 CONUS GRIB2 files, about 1 GB per storm date (`docs/DECISIONS.md` row 8). |
| Impact window | 12:00 UTC on storm date D to 12:00 UTC on D+2: 192 steps of 15 minutes. The first 96 steps are the convective day. |
| Step | One 15-minute interval of the impact window, named by its start time in UTC and numbered 0 to 191. Step 0 starts at 12:00 UTC on D. |
| Slot | The quarter hour at or before the fetch time of an ODIN snapshot, in UTC (`odin.slot_of`). A rerun of a slot replaces its rows. A step reads the snapshot whose slot equals the step start. |
| Warning polygon | One NWS storm-based warning polygon (`SV`, `TO`, or `FF`, significance `W`) from WFO HGX, with its begin and end time. `hailprint warnings` stores them per storm date. |
| Impact layer | A map layer with a time axis. The warnings layer is the first one. |
| Time slider | The native range under the map over the 192 steps of the impact window. The step in the path `/storms/<date>/map/<step>` is its value. |
| Storm timeline | The chart under the time slider with strips on the 48-hour axis: power, the share out of the picked county; internet, the drop of the picked county; warnings, one bar per warning polygon; and report times, one tick per SPC report. A cursor marks the slider step, and a click on a strip moves it. |
| EAGLE-I | The ORNL record of customers out per county, one CSV per year, every 15 minutes, in UTC. `hailprint eaglei <year>` stores the metro rows. |
| ODIN | The ORNL open outage feed. It gives open incidents now and holds no history. `hailprint odin` stores one snapshot every 15 minutes. In the metro it holds CenterPoint customers only. |
| MCC | The EAGLE-I file `MCC.csv`: customers per county as of 2022. Its value is the denominator of the share out for every year. |
| Customers out | The count of customers without power in one county at one step, from EAGLE-I or ODIN. A count, never a cause. |
| Share out | Customers out divided by the MCC value of the county, at one step. A null step has no share. The share stops at 1, because the MCC is a modelled count that a utility count can pass. |
| Power file | `power.json` of one storm date: per metro county, the share out and the customers out at each of the 192 steps, and one source, `eaglei` or `odin`. A file never mixes the two. |
| Power layer | The county fill of the share out at the slider step, and the power strip of the storm timeline. The fill control picks none or power. With an internet file on the date, it also picks internet. |
| CenterPoint customers only | The label on every value of an ODIN-sourced power file. Such a value is a lower bound. |
| IODA | The Georgia Tech Internet Outage Detection and Analysis service. Its `ping-slash24` signal counts the /24 address blocks in a county that answer active pings, every 10 minutes. Only 2022-03 to 2024-05 has a county signal. |
| Baseline | The median of the IODA signal over the 7 days before the impact window starts. A county with fewer than half of the 1008 baseline points has no baseline, and no ratio. |
| Ratio | The IODA signal of one step divided by the baseline, rounded to 3 places. The step value is the median of the signal points inside the step. A step with no point has a null ratio. |
| Reachability | The level of the IODA signal of one county at one step, against its baseline. The site words it as "internet reachability below baseline". It states a level, never a cause, and never says the internet is down. |
| Drop | 1 minus the ratio, never below zero. The site words it as "internet reachability below baseline". A drop states a level, never a cause. |
| Internet file | `internet.json` of one storm date: per metro county, the baseline and the ratio at each of the 192 steps, with the signal `ping-slash24`. `publish` writes it only with `--with-internet` (`docs/DECISIONS.md` row 14). |
| Internet layer | The county fill of the drop at the slider step, and the internet strip of the storm timeline. The fill bins are 0, under 2, 2 to 5, 5 to 10, 10 to 20, and 20 percent and up. |
| Missing candidate day | A candidate day with a 12Z file and no swath file. `hailprint candidates --missing` prints them newest first. |
| Nightly run | `scripts/nightly.sh`: index, missing candidate days, ingest, parcels, score, warnings, power, internet, publish, deploy, under `data/nightly.lock`, at most `MAX_INGEST` storm dates. A failed warnings, power, or internet step logs one line, and `publish` still runs. The script passes `--with-internet` only when `.env` sets `PUBLISH_INTERNET=1`. |
| Deploy | `scripts/deploy.sh`: the prebuilt Vercel flow from a machine that holds `site/data/`. |
| Dry run | `--dry-run`: the build into `site/dist` with the artifact check and no `vercel` call. |
| Cron entry | `scripts/hailprint.cron`: two crontab lines. One starts the nightly run at 14:00 UTC. One runs `hailprint odin` every 15 minutes. |
| Tile error | A MapLibre `error` event that carries a `tile` field: one map tile failed to load. It leaves a gap, logs one console warning, and never fails the map load. An error without `tile`, or no `load` within `LOAD_TIMEOUT_MS` (15 000 ms), fails the load and releases the map. The timeout runs only while the tab is visible, and each return to visible restarts it. |
| Area boundary | `AreaBoundary` in `site/src/shell/area-boundary.tsx`. It wraps the page body inside the layout. A render throw shows the error state with Retry under the top bar, not a blank page. A new route path renders the page again. |
