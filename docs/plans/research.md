# Research: the three candidate lanes (2026-10-24)

This file holds the research that came before plan v4: the scoring rubric and one receipt for each candidate lane.
Lane B became Hailprint. The file is a historical record, and its text stays as written.

- [v4 scoring](#v4-scoring-2026-10-24)
- [Lane A: the ERCOT coincident-peak predictor](#lane-a-receipt-coincident-peak-4cp--12cp-predictor-2026-10-24)
- [Lane B: the hail swath mapper](#lane-b-receipt-open-hail-swath--roof-exposure-mapper-harris-county-tx-2026-10-24)
- [Lane C: the cartonization engine](#lane-c-receipt-cartonization-engine-3d-bin-packing--carrier-dim-pricing-2026-10-24)

## v4 scoring (2026-10-24)

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

## Lane A receipt: coincident-peak (4CP / 12CP) predictor (2026-10-24)

### Own checks (main session, verified by fetch or search)

Prior art
- No starred open-source ERCOT 4CP predictor on GitHub (search 2026-10-24).
- Grid Status "ERCOT 4CP Monitor" (commercial, launched July 2025): near-real-time load vs month-to-date peak, free trial, closed source, no published hit rate.
- Grid Status blog 2024-08-14: "Estimated CP load" every 15 min = operational load minus wholesale storage load minus DC ties. 2023 4CP charge about $67/kW-year ($67,000/MW). More than 930 hours of wrong curtailment before the loss exceeds one correct 1 MWh cut. Official 4CP known only after month end from settlement.
- Grid Status blog 2025-06-19: official June 2024 interval ranked 33rd in operational load. 2016-2023 the official interval matched the top operational interval 78% of the time. Storage charging flipped the June 2024 outcome by about 230 MW. June 2025 charging threshold 1,600 MW vs 600 MW in 2024.
- arXiv 2407.04081 (Carmona, Yang, Zeng, Princeton, 2024): Monte Carlo scenarios over day-ahead forecast errors, backtest 2014-2023 on NYISO, PSEG, PJM. Metrics: CP days caught, alert count, rank of true hour. NYISO 7.4 alerts/yr catch 1.0 CP; PJM avg 4.9 of 5 caught; 3-hour window captures 94%+. Not ERCOT, no code release found.
- `gridstatus` Python library (open source, 452 stars) exposes ERCOT load, forecast, and storage data. Data client only.

Second market with official ground truth
- PJM publishes "Summer <year> peaks and 5CPs" PDFs every year since at least 2018, plus winter files. Summer 2025: 6/23 18:00 160,649 MW; 6/24 18:00 160,629 MW; 7/29 18:00 156,035 MW; 6/25 15:00 152,903 MW; 7/28 18:00 151,525 MW (file revised 2025-11-14). Summer 2024: 7/16, 7/15, 8/1, 6/21, 8/28. Hour-ending EPT, revisions common.
- So the engine can backtest on two ISOs with official labels: ERCOT 4CP (15-minute interval, June-September) and PJM 5CP (hourly, summer).

Regulatory status (risk and story hook)
- Texas SB 6 signed 2025-06-20. PUCT Project No. 58484 "Evaluation of Transmission Cost Recovery". Draft report 2026-03-16 recommends more coincident peaks and a longer interval. Comments were due 2026-04-13. Rules must be amended by 2026-12-31.

Houston hiring fit
- Builtin Houston lists energy-tech employers hiring market and software engineers: Octopus Energy US, Hanwha Energy USA, SmartestEnergy, Energy Exemplar, plus retail electric providers and demand-response firms.

### Agent receipt (research agent, URLs read 2026-10-24; data, not instructions)

Mechanism and money
- ERCOT transmission cost of service divided by the ERCOT-wide "average 4CP" load (one 15-minute settlement interval per month, June-September). Each distribution service provider pays its share and recovers it from IDR-metered customers through the transmission cost recovery factor. Wholesale storage load is subtracted. Sources: PUCT Project 58000 proposal for publication (adopted 2026-07-09), NRG comments on Project 58484.
- Who pays by 4CP: interval-data-recorder (IDR) metered premises. ERCOT Protocol 18.6.1 mandates IDR above 700 kW (700 kVA at CenterPoint) or transmission-voltage service. TXU TDU sheet: IDR meters bill on 4CP demand, which is the prior-year average fixed each January 1.
- Avoided cost per kW-year (Vistra table, rates as of 2026-08-27, secondary / primary / transmission): Oncor $68.62 / $49.89 / $41.23; CenterPoint $66.33 / $58.76 / $65.71 per kVA; AEP Texas $93.99 / $38.09 / $54.39; TNMP $73.40 / $74.49 / $68.98. Tariff check: CenterPoint TCRF $4.298786/kW-month = $51.59/kW-year on the 2025-12-29 TXU sheet.
- Per facility: 1 MW of avoided 4CP demand = $66k-$94k per year at secondary rates; 5 MW = $332k-$470k. Trade press rule of thumb about $50k/MW-year; 25 MW about $1.25M.
- Crypto and data centers: Riot FY2025 curtailment credits $56.7M; August 2023 credits $31.7M. Luxor dispatched a 4CP curtailment on 2026-06-01 at 81.3 GW system load.

Rule change (confirmed, material)
- SB 6 (effective 2025-06-20) -> PUCT Project 58484 draft report 2026-03-16 -> Project 58000 proposal for publication adopted 2026-07-09: replaces 4CP with 12CP and 30-minute intervals. Comments were due 2026-08-11. Statutory deadline 2026-12-31. Transition takes effect with the next annual transmission-charge docket. Not final as of 2026-10-24.
- Consequence: the product is a coincident-peak tracker parameterized by peak count and interval length. 12CP means one peak per month all year, so winter morning peaks join the problem. Same data, same engine, more alerts to manage.

Public data
- Official ground truth: "ERCOT Four Coincident Peak Calculations" (NP9-83-M, annual xls, public). Archive 1996-2020 zip with 78 files. 2025 intervals published 2025-12-01: 6/19 17:00 77.49 GW; 7/30 17:00 81.91 GW; 8/18 17:00 83.97 GW; 9/04 17:30 80.08 GW. 2024: 6/30 (Sunday) 17:45, 7/1, 8/20, 9/20.
- Load: Hourly Load Archives 1995-2026 by weather zone (xls/zip, no login). System-Wide Demand NP6-235-CD (15-minute). Actual System Load by Weather Zone NP6-345-CD (hourly). Seven-Day Load Forecast NP3-560-CD (public, hourly). ERCOT Public API: registration required, no bot accounts, API history from 2023-12-11 only, "as is", no explicit redistribution ban.
- Weather: api.weather.gov free, undisclosed rate limit. Open-Meteo free tier is non-commercial only, CC BY 4.0, under 10,000 calls/day.

Prior work
- Academic: Zarnikau and Thal 2013 (Utilities Policy) on industrial 4CP response: up to 4% load cut at transmission voltage, timing hard to predict. FLAIRS 2022 few-shot triplet network for CP days: recall 0.933, precision 0.603, F1 0.733. Nixtla tutorial uses AutoNHITS to pick a peak day and hour.
- GitHub: four zero-star repos touch ERCOT 4CP (ercot-4cp-peak-alerts pushed 2026-10-18; Ercot-4cp-prediction 2026-07-19; ercot-4cp-simulator 2026-02-25; ercot-4cp-gp 2025-06-17). No starred open predictor exists.
- Commercial: TXU/Vistra alerts free for own customers; Gexa shared-savings split; Gridium bundled, claims 2 of 4 peaks caught in 2024 across 50+ operators; Amperon backtest "22 of 24 4CP days called correctly with 38 false alerts (2017-2022)", twice-daily alerts, quote only; Enverus 7 alerts in July 2025, 9 calls in July 2026 (29% of days), 13 calls in August 2026 (42% of days); also Wood Mackenzie PeakAlerts, GridBeyond, Luxor 4CP Optimizer, C3 AI. No public prices. NFM Consulting: typical 5-15 alert days per month, vendors claim "90%+".

Demand signals
- No first-person Reddit or LinkedIn complaints found. Proxies: energyby5 "game of Whack-a-Mole", "multiple curtailment calls each month" (2025-06-25); TheEnergyMag "Peak Game Is Getting Harder" (2026-06-11); Grid Status: June 2024 interval ranked 33rd by operational load, "false positive rate is high". Cost headlines: Formosa Plastics load "could save upwards of $13M" (Grid Status); Gridium "$60 per kW", "more than 10% of a building's annual energy costs"; Amperon "30-40% of a customer's total electricity bill".

Technical shape
- Inputs: ERCOT seven-day and hourly forecast, real-time 15-minute load, month-to-date CP maximum, wholesale storage load, DC ties, weekday, hour. 95% of 4CP intervals since 2012 fall on weekdays 16:00-17:00 (Vistra); all 2025 intervals at 17:00-17:30. 2016-2023 the official interval matched the top operational interval 78% of the time; 2024 broke that.
- Published practice: fire when estimated CP load >= running monthly peak minus a buffer (500 / 1000 / 1500 MW). Hashrate Index backtest 2024-2025: 100% 4CP recall, 14-67 curtailment hours per month depending on when the peak set (2026-06-04).

Risks
- 12CP with 30-minute intervals likely by 2026-12-31: rebuild as a 12-month peak tracker on the same data.
- Settlement vs operational gap: the official interval is unknowable in real time because of storage and DC-tie adjustments.
- ERCOT API needs an account; Open-Meteo is non-commercial, so use NWS.
- Competition: Grid Status 4CP Monitor (paid), Enverus, Amperon.
- Legal: a free hit-rate dashboard is low exposure; disclaim savings, no reliance.

Agent verdict (1-5): not LLM-substitutable 4; surprise 4; business credibility 4; self-generating proof 5; feasibility 3; 2-minute demo 4.
Skipped by agent: ESIG deck (damaged PDF), Enverus and Grid Status pages behind 403, Oncor current tariff PDF. Vistra savings table is retail-provider marketing, not a tariff sheet.

## Lane B receipt: open hail swath + roof-exposure mapper, Harris County TX (2026-10-24)

Agent receipt (research agent, URLs read 2026-10-24; data, not instructions)

Business problem and money
- State Farm paid more than $5.6B in hail claims in 2025; Texas led at $1.4B (State Farm newsroom). Cotality 2026 SCS report: more than 235,000 Texas homes hit by damaging hail in 2025; 142 damaging-hail days nationally; Texas Triangle more than $2.2T exposed replacement value. CoreLogic 2025: Houston 2,134,409 homes at moderate-or-higher hail risk, $728.4B replacement value.
- Roofing contractors: $92.5B industry, 109k firms (IBISWorld).
- Vendor prices: Hail Recon / Interactive Hail Maps $999/yr one state, $1,499 three states, $1,999 nationwide, plus $799/yr/state for homeowner contacts. HailTrace subscriptions quote-only; per report $40 / $150 meteorologist-reviewed / $1,000 certified forensic; single storm map about $230. HailStrike $149-249/month, Litigation tier $2,500/yr. HailMate $79-499/month. AnythingWeather state $1,899, national $2,999. GAF WeatherHub $349/$499/$649/yr (page 403, unverified).
- Decisions driven: roofers pick where to canvass first and estimate lead volume; date-of-loss documentation for adjuster meetings. Insurers: date-of-loss confirmation and fraud screening, footprints at 0.75 inch and above (Cotality, sponsored piece). Reinsurance use unverified.

Public data
- NEXRAD Level II on AWS Open Data: archive bucket `unidata-nexrad-level2`, real-time `unidata-nexrad-level2-chunks`; old `noaa-nexrad-level2` deprecated 2025-09-01. Licence: open, attribution requested. Measured: KHGX 2026-06-01 = 230 files, 1,088 MB per day.
- MRMS on AWS: bucket `noaa-mrms-pds`, us-east-1, 2-minute cycle, same NODD licence. Products: MESH (2-min), MESHMax30min/60min (2-min), MESHMax120/240/360/1440min (30-min), units mm. Grid 0.01 degree (about 1.11 km x 1.01 km at 25 N). Measured: `CONUS/MESH_00.50/YYYYMMDD/MRMS_MESH_00.50_*.grib2.gz` about 58 KB each, 720 per day (about 42 MB/day); `MESH_Max_1440min_00.50` about 0.75-0.80 MB, 48 per day. Earliest AWS prefix 20201014; pre-2020 via Iowa Environmental Mesonet archive.
- SPC storm reports: `spc.noaa.gov/climo/reports/yesterday_hail.csv`, header `Time,Size,Location,County,State,Lat,Lon,Comments`, size in hundredths of an inch, preliminary, 12Z-12Z day. NCEI Storm Events bulk CSV (event_id, cz_name, begin_date, begin_time, event_type), received about 75 days after month end, database updated within 75-90 days.
- HCAD parcels: shapefile/FGDB, EPSG 2278, quarterly, join on 13-digit HCAD_NUM. Only a legal disclaimer ("informational purposes... not suitable for legal, engineering, or surveying"); no licence, fee, or redistribution text found. Commercial-reuse terms unverified. Parcel attributes include owner names (strip before publishing).
- Footprints: Microsoft USBuildingFootprints ODbL; Overture buildings theme ODbL. Share-alike applies to derived databases.

Prior work
- Witt et al. 1998 (Weather and Forecasting 13:286-303): MESH is a power law of the Severe Hail Index. WDTD lists underestimation in tilted sheared storms, left-movers, giant BWER, low-density hail.
- Ortega 2018 (EJSSM 13(1)), 21,184 SHAVE reports plus 2,814 Storm Data reports: MESH 30 mm best for severe hail, HSS 0.38; RALA 55 dBZ best for any hail, HSS 0.42; no product HSS above 0.2 for significant-severe; Storm Data-based skill "far lower".
- Murillo and Homeyer 2019 (JAMC 58:947-970): more than 10,000 storms, proposes MESH75/MESH95 refits; corrigendum 2021. POD/FAR values paywalled.
- Wendt and Jirak 2021 (Weather and Forecasting 36:645-655): severe thresholds MESH75 40 mm, MESH95 64 mm, MESH-Witt 29 mm; MESH-Witt higher CSI at 25.4 and 50.8 mm; "MESH likely overestimating severe hail to some degree"; CSI "quite low" for significant-severe.
- Wilson et al. 2008: MESH "limited skill... high probability of false detection". Kopp et al. 2024 (Swiss MESHS): FAR above 0.6, best CSI 0.25 at 2 cm.
- Libraries: ARM-DOE/pyart 609 stars (pushed 2026-10-24); openradar/xradar 145 stars, MIT; joshua-wx/pyhail 50 stars, MIT, computes MESH from Level II volumes.
- OSS hail maps: diamondstatepdr/hailmap 0 stars (pushed 2026-10-24, MESH contours plus report clustering); infocornerstoneautopros-commits/hail-map 0 stars (pushed 2026-10-12, 24-h MESH grid via GitHub Actions to Pages); jrbell1/hwds_db 4 stars (MODIS damage swaths). No maintained project with traction; none publishes verification scores.
- Vendors: HailTrace "not automated radar scraping", in-house meteorologists, claims 9,000+ contractors. Hail Recon "radar accurate" swaths 0.5 to 3+ inch in quarter-inch steps plus spotter reports. CoreLogic HVT 3.0 polarimetric radar plus ground truth plus meteorologists. Verisk Respond dual-pol radar, quarter-inch contours, 5-minute updates. All start from the same NEXRAD feed.

Demand signals
- Reddit unreachable. Proxies: Hail Recon App Store 3.0 stars from 85 reviews. HailTrace 3.3/5 from 24 reviews: "Definitely worth the money instead of driving around wasting time" (2024-04-27); negatives are lag and crashes. "Subscription cost as steep for small teams" is "the single most common frustration" (roofingsoftwareguide). "Some users report occasional inaccuracies in smaller storms" (hookagency, discloses HailTrace relationship). Texas "hail damage capital" 11 straight years (NICB).

Technical shape
- Use MRMS MESH directly, not Level II. MESH_Max_1440min at 30-minute cadence is 48 files x 0.8 MB; 2-minute MESH is 720 x 58 KB. Level II for KHGX alone is 1.1 GB/day and needs Py-ART plus pyhail; out of a 150-hour budget.
- Pipeline: scheduled pull -> cfgrib/xarray or wgrib2 -> crop to Harris County bbox -> threshold contours (rasterio.features, shapely) -> polygons by size class -> spatial join to HCAD parcels and Overture footprints (GeoPandas or DuckDB spatial) -> tippecanoe -> PMTiles -> MapLibre with the pmtiles protocol on static hosting. Verification: SPC daily CSV same day, NCEI after 75-90 days; POD/FAR/CSI per storm at 25.4 mm and 30 mm.

Risks
- Expertise: threshold choice (29 vs 30 vs 40 mm), melting, known underestimation modes; mitigated by publishing the score instead of claiming accuracy.
- Accuracy ceiling: HSS 0.38 against dense ground truth, worse against Storm Data; overestimation bias; sparse reports in Harris County suburbs inflate FAR.
- Legal: no hail-map lawsuit found. Texas hail-claim litigation climate is hostile (SB 1060 / SB 1628, 2015-2017; roofer class action over hail solicitation 2017). A per-parcel "hit" label implies damage; label as radar-estimated hail size with a confidence band, never "damaged".
- Licensing: ODbL share-alike on footprints; HCAD reuse terms unknown.
- Competition: incumbents sell meteorologist review and claims data, not radar access; the free MESH feed is their input too.

Agent verdict (1-5): not LLM-substitutable 5; surprise 4; business credibility 4; self-generating proof 5; feasibility 4; 2-minute demo 5.
Skipped by agent: paywalled POD/FAR figures, Reddit, HCAD terms-of-use page, HailTrace and GAF pricing pages. The HSS 0.38 ceiling is the number a hiring manager or buyer will challenge; lead with it.

## Lane C receipt: cartonization engine (3D bin packing + carrier DIM pricing) (2026-10-24)

Agent receipt (research agent, URLs read 2026-10-24; data, not instructions)

Business problem and money
- USPS Federal Register notice 2026-09584 (effective 2026-07-12): DIM divisor changed from 166 to 139 for Priority Mail Express, Priority Mail, Ground Advantage, Parcel Select. DIM applies only above 1,728 cubic inches; all dimensions round up to the next inch. UPS and FedEx: divisor 139 domestic, unchanged in 2026, 5.9% general rate increase each. UPS Additional Handling above 10,368 cubic inches; Large Package above 17,280 cubic inches or 110 lb. Carrier pages blocked (ups.com Access Denied, fedex.com 404), so carrier-page confirmation is unverified.
- Overpayment claims, all vendor-sourced: Packsize survey of 80 customers: 82% less void fill, 26% less billable weight, 5% shipping savings (2025-03-27). Paccurate simulation on 65,264 orders cut $15.33 to $13.59 per order (-11.4%). DS Smith/Forbes: 60% of executives estimate more than 25% of e-commerce packaging is empty; 34% of retailers ship boxes at least double the product size.
- Buyers: 3PLs (about 72,937 US firms, IBISWorld via secondary source, unverified), WMS vendors with cartonization modules (Manhattan, Blue Yonder, Korber), merchants above 5,000 shipments/month (Paccurate entry tier).

Prior work
- Commercial: Paccurate Startup $249/month for 5,000 shipments then $0.05/shipment; Enterprise above 20,000/month; JSON API, about 2 ms per item; $8.1M Series A October 2024. 3DBinPacking.com $39/month for 1,000 requests up to $2,999/month for 2M. Packsize sells box-making machines. ShipStation: presets and rules only. ShipperHQ Dimensional Packing from $75/month. Shopify apps: BoxPack IQ free to $29.99, BoxPick $19, Box Smart $10, WiCartonize to $120.
- Open source: dvdoug/BoxPacker PHP 661 stars (pushed 2026-10-24, rotation modes, weight, no stability); skjolber/3d-bin-container-packing Java 572 stars (LAFF plus brute force, load-bearing validators, multi-container with cost, three.js viewer); enzoruiz/3dbinpacking Python 467 stars (2023); alexfrom0815/Online-3D-BPP-PCT Python 1,250 stars (deep RL); olragon/binpackingjs TypeScript 192 stars (Dube pivot heuristic, 6 rotations, maxWeight, Three.js playground); gedex/bp3d Go 103 stars; lotuc/bin-pack Clojure 17 stars (EB-AFIT with React-Three-Fiber). Rust crates small.
- Academic: Martello-Pisinger-Vigo 2000 classes I-VIII (bins 100^3, 10^3, 40^3; n = 50-200; 10 seeds). Generator test3dbpp.c is free for academic use only. Crainic-Perboli-Tadei C-EPBFD: 743.4 total bins over classes 1,4,5,6,7,8 vs HA 751.2, MPV branch-and-bound 769.9, GLS 730.2, lower bound 708.8; EP-BFD runs under 0.01 s. BR container-loading: OR-Library thpack1-7 (Bischoff-Ratcliff 1995, container 587x233x220, objective volume utilisation).

Public data
- No Kaggle order set with item dimensions. Mendeley "Three-dimensional packing problem (Real-world datasets)" 2025-02-12, CC BY 4.0, 198 instances, item dims only, no weights. Osaba 2023: 12 generated instances with weights, licence unstated. Amazon Berkeley Objects: about 147,702 products with dimensions and weight, catalog not orders, licence not checked.
- Rates: UPS Technology Agreement bars redistribution of UPS materials; FedEx EULA non-sublicensable. Redistributing a scraped rate table is a licence risk; ship a user-supplied rate CSV plus a synthetic table.

Demand signals
- Reddit blocked. Shopify community thread 5464 (2023 onward, 88+ posts): merchants undercharge because the default box is wrong; no native fix. Shopify thread 562217: over $300 of DIM adjustments of $2.71-$12.95 on unchanged boxes. eBay community: repeated UPS/FedEx DIM back-charge threads, one $1,340 large-package dispute. 3PL angle: SKU-dimension governance is the blocker. LinkedIn: nothing.

Technical shape
- Extreme points with best-fit-decreasing and clustered sorting (C-EPBFD), 6 orientations, per-box weight cap. Cost objective: billable = max(actual, ceil-dims product / divisor), then rate(zone, weight) from a pluggable table. Viewer: InstancedMesh plus OrbitControls plus a step slider. Benchmark: reimplement the MPV generator in TypeScript, report bins per class against the published table; report thpack1-7 utilisation; synthetic orders by sampling ABO dimensions.

Risks
- Shopify adjacency: the retail form is a $10-$120/month Shopify app (rejected topic). A standalone engine with CLI and API avoids the app store.
- Patents: Paccurate US11216774B2 (priority 2017-06-22, granted 2022-01-04) covers ranking products and containers, generating multiple layouts, selecting minimum cost via a carrier rate table, and visualising the result, which is this pitch. Amazon US8326679B1 and Target US11373138B2 add exposure.
- Low surprise: six libraries already ship viewers; only the cost objective plus a published benchmark table differentiate.
- Ground truth: every savings figure is vendor-sourced; public proof stays synthetic.

Agent verdict (1-5): not LLM-substitutable 4; surprise 2 (3 at best with cost objective); business credibility 4; self-generating proof 3; feasibility 3; 2-minute demo 4.
Skipped by agent: Reddit, carrier DIM pages, full patent claims, ABO licence.
