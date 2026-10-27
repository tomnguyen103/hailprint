# Hailprint: an open hail-exposure map that grades itself (plan v4, 2026-10-24)

Working name: Hailprint (web search on 2026-10-24 found no product with this name; domain and trademark not checked). Replaces Sheetlint (v3, rejected: a chat LLM already handles spreadsheets) and PayerLens TX (v2, rejected: medical and generic).

## 1. Pitch

Hailprint pulls NOAA's hail-size radar product every night, draws the hail swath over every parcel in Harris County, and then grades its own map against NOAA storm reports. Every Texas storm adds a swath, a comparison, and a score, with no manual input. Roofers and insurers pay $999 to $2,999 per year for closed versions of this map that publish no accuracy numbers. Hailprint is open, parcel-level, and self-verifying.

One-line demo: pick a storm date, watch the swath land on the parcels, read the scorecard.

## 2. Why this stands out

- A chat LLM cannot do it. The product is a running pipeline (GRIB2 decoding, raster-to-vector, spatial joins over more than a million parcels, nightly scheduling) plus a scorecard that only exists after seasons of operation. Claude can write the code; it cannot be the system.
- Nobody open has done it. GitHub holds three zero-star hail-map repos (one pushed 2026-10-24) and none publishes verification scores. Incumbents (Interactive Hail Maps, HailTrace, HailStrike, HailWatch, CoreLogic, Verisk) all start from the same free NEXRAD feed and sell meteorologist review on top.
- The money is loud and local. State Farm alone paid more than $5.6B in hail claims in 2025, $1.4B of it in Texas. CoreLogic counts 2,134,409 Houston homes at moderate-or-higher hail risk, $728.4B of replacement value. Texas has been the hail-damage capital for 11 straight years.
- The honesty is the moat. The published skill ceiling for radar hail estimates is low (Heidke skill score 0.38 at best). Hailprint leads with that number and shows per-storm precision instead of claiming accuracy. Every vendor hides it; a hiring manager sees judgment.
- It reads as five skills in one repo: data engineering, geospatial computation, statistics, product sense with a dollar figure, and a shipped front end.

## 3. Problem evidence

Claims and exposure
- State Farm paid over $5.6B in hail claims in 2025; Texas led all states at $1.4B (State Farm newsroom).
- Cotality 2026 severe-convective-storm report: more than 235,000 Texas homes hit by damaging hail in 2025; 142 damaging-hail days nationally; Texas Triangle more than $2.2T of exposed replacement value.
- CoreLogic 2025 SCS report: Houston metro 2,134,409 homes at moderate or higher hail risk, $728.4B reconstruction value.
- Roofing contractors: $92.5B industry, about 109,000 firms (IBISWorld).

What buyers pay today
| Vendor | Price | Note |
|---|---|---|
| Interactive Hail Maps / Hail Recon | $999/yr one state, $1,499 three, $1,999 nationwide | plus $799/yr/state for homeowner contacts |
| HailTrace | quote-only subscription; $40 / $150 / $1,000 per report | single storm map about $230; "not automated radar scraping", in-house meteorologists |
| HailStrike | $149-249/month; Litigation tier $2,500/yr | CertainTeed partner |
| HailMate | $79-499/month | |
| AnythingWeather | $1,899 state, $2,999 national | |
| GAF WeatherHub | $349 / $499 / $649 per year (unverified, page 403) | GAF also publishes a free historical hail map, no parcel join, no scores |

What users say
- HailTrace review: "Definitely worth the money instead of driving around wasting time" (2024-04-27). The most common frustration in a roofing-software review roundup: subscription cost "steep for small teams". Hail Recon sits at 3.0 stars from 85 App Store reviews; HailTrace at 3.3 from 24, with lag and crashes as the negatives.
- Decisions the map drives: where a roofing crew canvasses first and how many leads to expect; date-of-loss documentation for adjuster meetings; on the insurer side, date-of-loss confirmation and fraud screening at footprints of 0.75 inch and above.

The science ceiling (the number to lead with)
- Ortega 2018 (21,184 SHAVE reports plus 2,814 Storm Data reports): MESH at 30 mm is the best severe-hail threshold with HSS 0.38; no product scores above 0.2 for significant-severe hail; skill against Storm Data alone is "far lower".
- Wendt and Jirak 2021: severe thresholds of 29 mm (MESH-Witt), 40 mm (MESH75), 64 mm (MESH95); MESH-Witt gives the higher CSI at 25.4 and 50.8 mm; "MESH likely overestimating severe hail to some degree".
- Kopp et al. 2024 (Swiss): false alarm ratio above 0.6, best CSI 0.25 at 2 cm.

## 4. Who it serves

| Audience | What they get | Dollar anchor |
|---|---|---|
| Roofing contractors (Houston) | Next-morning swath over parcels, counts by ZIP and size class, a per-storm exposure report | replaces a $999-$1,999/yr subscription or a $230 single-storm map |
| Insurance adjusters and SIU | Date-of-loss check for a parcel: which storm days had radar hail at or above 0.75 inch there, with the score for that storm | per-report prices of $40-$1,000 at HailTrace |
| Hiring managers | A repo with a live map, a six-season verification table, and a methodology page | shows pipeline, geospatial, statistics, and front-end work in one artifact |

Hiring targets (Texas presence, not verified as hiring today): Cotality (formerly CoreLogic, Irving), Verisk, USAA (San Antonio), State Farm (Richardson), Allstate (Irving), Hippo (Austin), Texas Windstorm Insurance Association (Austin), ICEYE, ZestyAI, Arturo, Cape Analytics, Nearmap, roofing SaaS (AccuLynx, JobNimbus, Roofr), and Houston energy and logistics firms that run weather-driven operations.

## 5. What ships in v1

Scope: Harris County, MRMS MESH (not raw Level II), nightly batch, SPC plus NCEI verification, static tiles, scorecard, 2020-10 to 2026-10 backtest.

| Module | Hours |
|---|---|
| M1 Ingest: MRMS MESH from the `noaa-mrms-pds` bucket (`MESH_Max_1440min` daily, 2-minute MESH on storm days), GRIB2 decode with cfgrib/xarray, crop to the Harris County bounding box, store per-day rasters | 18 |
| M2 Swath builder: contours at 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5+ inch, polygonize, dissolve, simplify, GeoParquet per storm day | 16 |
| M3 Parcel join: HCAD parcels (EPSG 2278 to 4326), owner fields stripped, per-parcel maximum MESH per storm day, counts by size class and ZIP | 20 |
| M4 Verification: SPC daily hail CSV the same day, NCEI Storm Events at 75-90 days, neighborhood matching, POD / FAR / CSI / HSS per threshold per storm, preliminary-vs-final scorecard | 22 |
| M5 Backtest 2020-10 to 2026-10: about 2,200 daily-max files (about 1.8 GB), calibration table of threshold vs POD/FAR, the headline figure | 16 |
| M6 Tiles and map: tippecanoe to PMTiles, MapLibre with storm-date picker, swath and parcel layers, scorecard panel, Protomaps basemap | 24 |
| M7 Scheduler and ops: nightly job, publish tiles and scorecard JSON to static hosting, status page with last-run time | 12 |
| M8 Per-storm exposure report (HTML and PDF) and methodology page | 12 |
| M9 Demo video, README, resume lines | 10 |
| Total | 150 |

Out of v1 (v2 candidates): raw Level II dual-pol processing with Py-ART and pyhail, statewide coverage, push alerts, footprint-level roof areas, insurer API.

## 6. Scorecard design

- Ground truth: SPC preliminary reports (`spc.noaa.gov/climo/reports/yesterday_hail.csv`, hundredths of an inch, 12Z-12Z day) the next morning; NCEI Storm Events (bulk CSV) when the month closes 75-90 days later. The scorecard shows both columns so the preliminary-vs-final drift is visible.
- Matching: a report counts as hit when a swath pixel at or above the threshold lies within a neighborhood radius (default 5 km) and within the storm day. Swath area with no report within the radius counts as a false alarm only where report density is adequate; sparse areas get an "unverifiable" class instead of a false alarm. This follows the neighborhood method in Ortega 2018.
- Metrics per storm and per season: probability of detection, false alarm ratio, critical success index, Heidke skill score, at 25.4 mm and 30 mm, plus the swath area in square kilometers and the parcel count per size class.
- Acceptance: the six-season table reproduces the literature ceiling (HSS between 0.25 and 0.45 at 30 mm against SPC reports). A result far above the literature means a matching bug, not a breakthrough; the plan treats it that way.

## 7. Architecture

```
noaa-mrms-pds (S3, public)  ->  M1 ingest (Python: boto3, cfgrib, xarray)
                                 crop to bbox, per-day NetCDF/Zarr
                             ->  M2 swaths (rasterio.features, shapely) -> GeoParquet
HCAD parcels (quarterly)     ->  M3 join (DuckDB spatial or GeoPandas STRtree)
                                 owner fields dropped at load
SPC csv, NCEI csv            ->  M4 verify (pandas, shapely) -> scorecard.json
                             ->  M5 backtest runs M1-M4 over 2020-10..2026-10
GeoParquet + scorecard       ->  M6 tippecanoe -> PMTiles -> Cloudflare R2
                                 MapLibre GL + pmtiles protocol, static site
Nightly cron (M7)            ->  runs M1-M4 for yesterday, republishes tiles
```

- Pipeline language: Python. GRIB2 tooling (cfgrib, wgrib2, xarray, rasterio) is mature there and poor in JavaScript.
- Front end: TypeScript, MapLibre GL JS, PMTiles protocol, no tile server. Reuse the design tokens from the user's design-system repo for the panel and report.
- Storage: daily rasters cropped to the county are a few megabytes; the full backtest archive is under 2 GB of source files and a few hundred megabytes of outputs.

## 8. Data sources and licences

| Source | Access | Licence / terms | Volume |
|---|---|---|---|
| MRMS MESH (`noaa-mrms-pds`, us-east-1) | anonymous S3 | NOAA Open Data Dissemination, open, attribution requested | `MESH_Max_1440min_00.50`: 48 files/day at about 0.8 MB; 2-minute `MESH_00.50`: 720 files/day at about 58 KB; archive from 2020-10-14 |
| MRMS before 2020-10 | Iowa Environmental Mesonet archive | same product, mirror | optional extension of the backtest |
| SPC storm reports | daily CSV, no key | public, preliminary | one small CSV per day |
| NCEI Storm Events | bulk CSV | public, final after 75-90 days | one file per month |
| HCAD parcels | shapefile/FGDB download, quarterly, EPSG 2278, 13-digit HCAD_NUM | disclaimer only ("informational purposes"); no licence or redistribution text found; email HCAD GIS in week 1 | hundreds of MB |
| Building footprints (Microsoft or Overture) | download | ODbL, share-alike on derived databases | optional in v1 |
| NEXRAD Level II (`unidata-nexrad-level2`) | anonymous S3 | open | about 1.1 GB/day for KHGX alone; v2 only |

Privacy rule: HCAD parcel attributes include owner names and mailing addresses. The loader drops them before anything is written to disk for publishing. The public map carries parcel ID, geometry, land-use class, year built, and improvement area only. No homeowner contact data, ever, including as a paid add-on.

Legal wording rule: outputs say "radar-estimated hail size at this parcel" with a confidence band. The word "damaged" never appears. Texas has a hostile hail-claim litigation history (SB 1060 and SB 1628 in 2015-2017, a roofer class action over hail solicitation in 2017); the map is an exposure estimate, not a damage finding.

## 9. Metrics and acceptance

| Metric | Target | How checked |
|---|---|---|
| Nightly run reliability | 95% of nights complete by 06:00 CT | status page log over 30 days |
| Backtest coverage | every day 2020-10-14 to 2026-10-31 processed | file count equals calendar days |
| Verification | six-season POD / FAR / CSI / HSS at 25.4 and 30 mm published | scorecard JSON plus methodology page |
| Map performance | first tile paint under 2 s on a 4G phone; PMTiles under 200 MB total | Lighthouse and tile size report |
| Parcel join scale | all HCAD parcels joined per storm day in under 5 minutes | timed run |
| Report generator | one exposure report per storm, HTML and PDF | sample report in the repo |

## 10. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Low radar skill (HSS about 0.38) reads as failure | High | lead with the literature ceiling; the scorecard is the product; label as exposure, not damage |
| Sparse reports inflate false alarms in suburbs | High | "unverifiable" class; report density map; neighborhood radius documented |
| HCAD reuse terms unknown | Medium | email HCAD GIS in week 1; fall back to publishing aggregates by ZIP and census block if redistribution is barred |
| ODbL share-alike on footprints | Medium | skip footprints in v1; if used, publish derived tiles under ODbL |
| Litigation-sensitive wording | Medium | wording rule in section 8; disclaimer on every page and report |
| Expertise gate (thresholds, melting, underestimation modes) | Medium | thresholds and caveats cited from Witt 1998, Ortega 2018, Wendt and Jirak 2021; no custom meteorology |
| Someone ships first | Medium | zero-star repos exist; ship the scorecard by week 6 and the live map by week 8 |
| AWS bucket churn (NEXRAD bucket deprecated 2025-09-01) | Low | bucket names in config; IEM mirror as fallback |
| Employer IP overlap | Low | TRP builds a medical PMS and revenue portal; unrelated; read the IP clause before the first commit |
| Name collision | Low | "Hailprint" clean on web search; check USPTO and domain in week 1; backup names ready |

## 11. Twelve-week schedule (about 12.5 hours per week)

| Week | Work | Exit check |
|---|---|---|
| 1 | Spike: pull one Harris County hail day, decode GRIB2, draw one contour over the county outline; download HCAD parcels; email HCAD on reuse; name and IP checks | one PNG of a swath over the county |
| 2 | M1 ingest; download the daily-max archive 2020-10 to now | about 2,200 daily files indexed |
| 3 | M2 swaths for every day with at least 0.75 inch anywhere in the bbox | GeoParquet of swaths; storm-day count |
| 4 | M3 parcel join with owner fields stripped | per-parcel table for one storm; counts by ZIP |
| 5 | M4 verification against SPC and NCEI | POD/FAR/CSI for three storms |
| 6 | M5 backtest over six seasons | calibration table published as JSON and a page |
| 7 | M6 tiles: tippecanoe, PMTiles, R2 | tiles load in a bare MapLibre page |
| 8 | M6 map UI: date picker, layers, scorecard panel, mobile | hosted map live |
| 9 | M7 nightly scheduler and status page | seven consecutive nightly runs logged |
| 10 | M8 exposure report and methodology page | one report for a named storm |
| 11 | Hardening: a11y, performance, README, tests on the matcher | Lighthouse pass; matcher unit tests green |
| 12 | Demo video, resume lines, launch posts | video under 2 minutes; posts drafted |

## 12. Distribution and launch

- Repo public from week 1 with the methodology page first; the scorecard page at week 6; the map at week 8.
- Launch posts: Show HN, LinkedIn with the two-minute video, Texas GIS and Houston data groups, roofing and insurance forums with the exposure report for a recent storm. No homeowner outreach, no lead selling.
- A per-storm post the morning after each Houston hail day: swath, parcel counts, score. The cadence is the content.

## 13. Budget

| Item | Cost |
|---|---|
| Domain | about $12/yr |
| Cloudflare R2 (tiles) and Pages | free tier (10 GB) |
| Nightly job: GitHub Actions on a public repo (free) or a small VPS (Hetzner CX22, about EUR 3.79/month) | $0-50/yr |
| AWS egress from the NOAA public buckets | $0 (Open Data program) |
| Total | under $70/yr |

## 14. Resume lines and interview stories

- Built an open hail-exposure pipeline that ingests NOAA MRMS radar (GRIB2) nightly, maps hail swaths onto every Harris County parcel, and scores itself against NOAA storm reports.
- Published a six-season verification table (POD, FAR, CSI, HSS at 25.4 mm and 30 mm) and per-storm scorecards; incumbents at $999-$2,999 per year publish none.
- Served county-wide parcel and swath layers as PMTiles on static hosting with a MapLibre front end, no tile server.

Interview stories: why preliminary and final ground truth disagree and how the scorecard shows both; why sparse reports force an "unverifiable" class instead of a false alarm; how the neighborhood radius changes the score; why owner fields are dropped at load; why PMTiles beat a tile server for a solo project; what the HSS ceiling says about selling radar hail maps.

## 15. Alternatives considered

Weights: not LLM-substitutable 3, surprise 3, business credibility with dollars 3, self-generating proof 2, technical depth 2, feasibility in 150 h 2, 2-minute demo 1.5, no gate / no overlap / not rejected 1.5, Houston fit 1. Maximum 95.

| Candidate | Score | Why not |
|---|---|---|
| Hailprint (hail swath + parcel exposure, self-graded) | 87.5 | picked |
| ERCOT coincident-peak predictor | 73.5 | commodity alert market (TXU free, Amperon, Enverus, Grid Status, Gridium); the official interval is unknowable in real time; PUCT Project 58000 replaces 4CP with 12CP at 30-minute intervals, likely by 2026-12-31 |
| Cartonization engine (3D bin packing + DIM pricing) | 61 | Paccurate patent US11216774B2 covers the pitch; six open libraries ship 3D viewers; Shopify adjacency |
| Sheetlint (v3) | rejected | a chat LLM handles spreadsheets |
| PayerLens TX (v2) | rejected | medical and generic |

## 16. Decisions for Tom

1. Name: Hailprint, or pick another before the repo goes public (domain and USPTO check still to run).
2. Scheduler: GitHub Actions on a public repo (free, but you have disabled Actions on your account before) or a small VPS.
3. Footprints in v1 (ODbL share-alike) or HCAD improvement attributes only. Recommendation: HCAD only.
4. Scope: Harris County only, or the nine-county Houston metro (each county has its own appraisal district download). Recommendation: Harris only.
5. Pipeline language: Python for the pipeline, TypeScript for the map. Recommendation: yes.
6. Approve the twelve-week plan and start week 1.

## 17. Sources

- State Farm newsroom, "State Farm paid over $5.6 billion in hail claims in 2025".
- Cotality press release, "Hail now a leading driver of insured losses, on par with major hurricanes" (2026 SCS report).
- CoreLogic, 2025 Severe Convective Storm Risk Report, "The SCS risk landscape".
- IBISWorld, Roofing Contractors in the US.
- Hailmate blog, "Hail tracking software cost" (August 2026); useproline.com HailTrace vs Hail Recon; roofingsoftwareguide.com HailTrace pricing and review; store.anythingweather.com; justuseapp.com HailTrace reviews; apppricinglab.com Hail Recon.
- NICB, Texas hail damage capital.
- registry.opendata.aws/noaa-mrms-pds and noaa-nexrad; nssl.noaa.gov MRMS operational product tables; vlab.noaa.gov WDTD MESH page.
- spc.noaa.gov/climo/reports; ncei.noaa.gov Storm Events FAQ and CSV directory.
- hcad.org/pdata/pdata-gis-downloads.html and GIS ReadMe v2.2.
- Microsoft USBuildingFootprints README; docs.overturemaps.org attribution.
- Witt et al. 1998, Weather and Forecasting 13:286-303. Ortega 2018, EJSSM 13(1). Murillo and Homeyer 2019, JAMC 58:947-970. Wendt and Jirak 2021, Weather and Forecasting 36:645-655. Kopp et al. 2024, AMT 17:4529.
- GitHub: ARM-DOE/pyart, openradar/xradar, joshua-wx/pyhail, diamondstatepdr/hailmap, infocornerstoneautopros-commits/hail-map, jrbell1/hwds_db.
- docs.protomaps.com/pmtiles/maplibre.
- Lane A sources: Grid Status blog (2024-08-14, 2025-06-19), arXiv 2407.04081, PUCT Projects 58484 and 58000, Vistra 4CP page, ERCOT NP9-83-M. Lane C sources: Federal Register 2026-09584, Paccurate pricing and patent US11216774B2, CIRRELT-2007-41.
