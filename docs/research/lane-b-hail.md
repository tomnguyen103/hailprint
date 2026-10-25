# Lane B receipt: open hail swath + roof-exposure mapper, Harris County TX (2026-10-24)

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
