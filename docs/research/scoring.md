# v4 scoring (2026-10-24)

Weights sum to 19, so the maximum is 95 (v4-criteria.md said 85; that was wrong).

| Criterion (weight) | A ERCOT coincident-peak predictor | B Hail swath + parcel exposure mapper | C Cartonization engine |
|---|---|---|---|
| Not LLM-substitutable (3) | 4 | 5 | 4 |
| Surprise to hiring manager (3) | 3 | 5 | 2 |
| Business credibility with dollars (3) | 5 | 4 | 4 |
| Self-generating public proof (2) | 5 | 5 | 3 |
| Technical depth (2) | 3 | 5 | 4 |
| Feasibility in 150 h (2) | 3 | 4 | 3 |
| 2-minute demo (1.5) | 4 | 5 | 4 |
| No gate / no overlap / not rejected (1.5) | 3 | 4 | 2 |
| Houston or Texas fit (1) | 5 | 4 | 2 |
| Weighted (max 95) | 73.5 | 87.5 | 61 |

Why B wins
- A: commodity alert market (TXU free, Amperon, Enverus, Grid Status, Gridium); the official interval is unknowable in real time; PUCT Project 58000 replaces 4CP with 12CP at 30-minute intervals, likely by 2026-12-31, so the headline could be stale at launch.
- C: Paccurate patent US11216774B2 covers the exact pitch (rank containers, pick minimum cost from a carrier rate table, visualise); six open libraries already ship 3D viewers; Shopify adjacency sits on the rejected list.
- B: a chat LLM cannot decode GRIB2 nightly, join swaths to over a million parcels, and score itself against NOAA reports over seasons. Zero-star repos only; vendors charge $999-$2,999 per year and publish no verification. Every Texas storm adds proof.

Pick: B. Working name undecided (collision check for "Hailprint" and "Hailscore" not run: WebSearch limit hit).

Critique pass on B
1. "Just ask Claude?" No: the product is a running pipeline plus a published scorecard, not an answer.
2. "Interactive Hail Maps exists." They charge $999-$1,999/yr, publish no skill scores, and sell meteorologist review. This is open, parcel-level, and self-verifying.
3. "Meteorology expertise gate." Use NOAA MRMS MESH (an operational product), take thresholds from Witt 1998, Ortega 2018, Wendt and Jirak 2021, and publish POD/FAR/CSI per storm. Honesty is the differentiator.
4. "HSS 0.38 ceiling." Lead with it. Label outputs "radar-estimated hail size" with a confidence band, never "damaged". Report an "unverifiable" class where SPC/NCEI reports are sparse.
5. "Privacy and legal." Strip HCAD owner names and mailing addresses before any publish; keep parcel ID, geometry, land use, year built, improvement area. Texas hail-claim litigation climate is hostile; no homeowner contact data, ever.
6. "Licensing." Footprint-derived tiles are ODbL share-alike (fine for open source) or skip footprints in v1 and use HCAD improvement attributes. HCAD reuse terms unverified: email HCAD GIS in week 1.
7. "Scope overrun." v1 = Harris County, MESH-based, nightly batch, SPC plus NCEI verification, PMTiles map, scorecard, 2020-10 to 2026-10 backtest. v2 = Level II dual-pol, statewide, alerts.
8. "Someone ships first." diamondstatepdr/hailmap was pushed 2026-10-24. Differentiate on parcel join, verification table, and multi-season backtest; ship the scorecard by week 6.
9. "Employer IP." TRP builds a medical PMS and revenue portal; unrelated. Read the IP assignment clause before the first commit.

v1 module budget (150 h, 12 weeks at about 12.5 h/week)
- M1 Ingest MRMS MESH from noaa-mrms-pds (MESH_Max_1440min daily, 2-min MESH on storm days), GRIB2 decode via cfgrib/xarray, crop to Harris County bbox: 18 h
- M2 Swath builder: contours at 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5+ inch, polygonize, dissolve, simplify, GeoParquet per storm day: 16 h
- M3 Parcel join: HCAD parcels (EPSG 2278 to 4326), owner fields stripped, per-parcel max MESH per storm day, counts by size class and ZIP: 20 h
- M4 Verification: SPC daily CSV same day, NCEI Storm Events at 75-90 days, neighborhood matching, POD/FAR/CSI/HSS per threshold per storm, preliminary vs final scorecard: 22 h
- M5 Backtest 2020-10 to 2026-10 (about 2,200 daily max files, about 1.8 GB), calibration table threshold vs POD/FAR as the headline figure: 16 h
- M6 Tiles and map: tippecanoe to PMTiles, MapLibre with storm-date picker, swath and parcel layers, scorecard panel, Protomaps basemap: 24 h
- M7 Scheduler and ops: nightly job (GitHub Actions on a public repo, or a small VPS), publish tiles and scorecard JSON to static hosting, status page: 12 h
- M8 Per-storm exposure report generator (the $230 single-storm-map analog) and methodology page: 12 h
- M9 Demo video, README, resume lines: 10 h

Stack: Python (xarray, cfgrib, rasterio, shapely, geopandas, duckdb) for the pipeline; TypeScript plus MapLibre for the map; PMTiles on Cloudflare R2 or Pages. Budget about $5/month.

Resume lines (draft)
- Built an open hail-exposure pipeline that ingests NOAA MRMS radar (GRIB2) nightly, maps hail swaths onto every Harris County parcel, and scores itself against NOAA storm reports.
- Published a six-season verification table (POD, FAR, CSI at 25.4 mm and 30 mm) and a per-storm scorecard; incumbents at $999-$2,999 per year publish none.

Still to write: reports/<name>-plan-v4.md at v3 depth (17 sections), the HTML artifact page, memory update, send file.
