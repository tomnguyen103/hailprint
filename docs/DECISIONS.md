# Decisions

Plan section 16 listed six decisions. Tom approved the plan on 2026-10-24 and adopted the recommendations below.

| # | Decision | Adopted answer | Open item |
|---|---|---|---|
| 1 | Name | "Hailprint" (working name) | USPTO and domain check in week 1; rename is cheap before launch |
| 2 | Scheduler | Superseded by row 18. Started with a local or VPS cron job; GitHub Actions stay disabled on the repo | Revisit when the repo goes public at launch |
| 3 | Footprints in v1 | HCAD only. No Microsoft or Overture footprints in v1 (ODbL share-alike) | v2 candidate |
| 4 | Scope | Harris County only | Nine-county metro is a v2 candidate |
| 5 | Languages | Python for the pipeline (cfgrib, xarray, rasterio, shapely, geopandas, duckdb); TypeScript plus MapLibre GL for the map; PMTiles on Cloudflare R2 or Pages | As built: eccodes replaces cfgrib, duckdb is not used, and the site deploys on Vercel (row 10, superseded by row 19) |
| 6 | Go | Approved. Week 1 spike starts from `docs/plans/kickoff.md` | none |
| 7 | Report scope | `nearby_reports` keeps SPC reports within 50 km of the county outline, for the scorer. `harris_reports` keeps Harris, TX by name, so a candidate day count matches the WCM count | Revisit the radius when the scorer reports its false alarm sensitivity |
| 8 | Replay frames (plan v5 A5) | Cut. One storm date of the 2-minute MESH product needs about 720 CONUS GRIB2 files, about 1 GB | Revisit with a cropped tile source |
| 9 | Pipeline file writer | `publish` alone writes `site/data/pipeline.json`, so the file has one writer. `index` stays a Parquet writer | none |
| 10 | Site data path | Superseded by row 19. Earlier prebuilt flow built with `site/data/` present on the cron host | none |
| 11 | Impact scope | The impact layers (warnings, power, internet) cover the 8 metro counties: Harris, Fort Bend, Montgomery, Brazoria, Galveston, Waller, Liberty, and Chambers. Row 4 stands for hail, scoring, and parcels | Revisit row 4 as a whole for the v2 nine-county metro |
| 12 | Power sources | EAGLE-I for storm dates up to its last published year; ODIN snapshots after the schedule install. One file never mixes the two. Share out uses the MCC of 2022. Exception: `power --missing` replaces an ODIN-sourced file when an EAGLE-I year Parquet now covers its window, because EAGLE-I covers every utility | ODIN covers CenterPoint customers only; revisit when ODIN lists a second utility |
| 13 | Gap rule | A step with no source row is null and draws as a gap. No fill, no interpolation | Revisit if EAGLE-I documents that an absent row means zero |
| 14 | Internet layer | Publish IODA-derived ratios only after IODA answers in writing. Until then `publish` writes no `internet.json` unless the run passes `--with-internet`. `cloud nightly` and `cloud backfill` pass the flag only when `PUBLISH_INTERNET=1` | IODA reply: remove the flag gate and the `PUBLISH_INTERNET` opt-in |
| 15 | ODIN terms | Publish ODIN county totals with attribution to ORNL. ODIN states no licence, so the owner asks ORNL in writing | ORNL reply |
| 16 | Share out cap | The share out is `min(1, customers_out / MCC)` in `power.share_out` and in the site `shareOut`. The MCC constants equal ORNL `MCC.csv`, and the EAGLE-I count passes them on 2024-07-08 (Waller 31,398 of 18,532). The inspector keeps the raw counts. This replaces the V5 plan rule that the site clamps the colour and not the number | A per-county denominator that tracks the utility service area |
| 17 | Skipped impact layer | A bad warnings, power, or internet file skips that layer of its date. This includes a file that `publish.dumps` refuses in the dry run. `publish` prints one stderr line and exits 0. A bad required file (swath, SPC CSV, ZIP counts) fails only its date and exits 1. A skipped layer leaves no layer file of that date, and the index lists it as null. This replaces the earlier rule that one bad layer file stopped the run | A run summary that counts the skipped layers in `pipeline.json` |
| 18 | Cloud schedules | Trigger.dev schedules run the pipeline (`nightly` at `30 13 * * *` UTC, `odin` at `0 * * * *` UTC, and `backfill` on demand), replacing row 2 and the local cron scripts. GitHub Actions stay disabled | Check Trigger.dev usage after the first week |
| 19 | Public data bucket | Derived state lives in the private `hailprint-state` Supabase Storage bucket and published JSON lives in the public `hailprint-public` bucket (`VITE_DATA_BASE`), replacing row 10. The Vercel build holds code only, so git deployments for `main` can stay enabled | Check Supabase project activity after 8 days |

## Standing constraints

- Outputs are labelled "radar-estimated hail size" with a confidence band, never "damaged".
- HCAD owner fields are stripped at load. No homeowner contact data is stored or published.
- Email HCAD GIS in week 1 about reuse terms. Until the answer arrives, publish derived aggregates (counts by size class and ZIP) and parcel geometry only.
- Read the employer IP assignment clause before the first code commit.

> ⚠️ UNVERIFIED: the repo does not record whether the HCAD email went out or whether the IP clause was read. `docs/reports/week-08.md` lists both as open owner steps.
