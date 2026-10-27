# Decisions

Plan section 16 listed six decisions. Tom approved the plan on 2026-10-24 and adopted the recommendations below.

| # | Decision | Adopted answer | Open item |
|---|---|---|---|
| 1 | Name | "Hailprint" (working name) | USPTO and domain check in week 1; rename is cheap before launch |
| 2 | Scheduler | Start with a local or VPS cron job. The repo is private, so GitHub Actions minutes are not free; Actions stay disabled on the repo | Revisit when the repo goes public at launch |
| 3 | Footprints in v1 | HCAD only. No Microsoft or Overture footprints in v1 (ODbL share-alike) | v2 candidate |
| 4 | Scope | Harris County only | Nine-county metro is a v2 candidate |
| 5 | Languages | Python for the pipeline (cfgrib, xarray, rasterio, shapely, geopandas, duckdb); TypeScript plus MapLibre GL for the map; PMTiles on Cloudflare R2 or Pages | As built: eccodes replaces cfgrib, duckdb is not used, and the site deploys on Vercel (row 10) |
| 6 | Go | Approved. Week 1 spike starts from `docs/plans/kickoff.md` | none |
| 7 | Report scope | `nearby_reports` keeps SPC reports within 50 km of the county outline, for the scorer. `harris_reports` keeps Harris, TX by name, so a candidate day count matches the WCM count | Revisit the radius when the scorer reports its false alarm sensitivity |
| 8 | Replay frames (plan v5 A5) | Cut. One storm date of the 2-minute MESH product needs about 720 CONUS GRIB2 files, about 1 GB | Revisit with a cropped tile source |
| 9 | Pipeline file writer | `publish` alone writes `site/data/pipeline.json`, so the file has one writer. `index` stays a Parquet writer | none |
| 10 | Site data path | Git deployments off for `main` in `vercel.json`; the cron host builds with `site/data/` present and uploads with the prebuilt flow; PR branches keep data-free previews | The dashboard ignored build step is dead after this row; remove it at launch |
| 11 | Impact scope | The impact layers (warnings, power, internet) cover the 8 metro counties: Harris, Fort Bend, Montgomery, Brazoria, Galveston, Waller, Liberty, and Chambers. Row 4 stands for hail, scoring, and parcels | Revisit row 4 as a whole for the v2 nine-county metro |
| 12 | Power sources | EAGLE-I for storm dates up to its last published year; ODIN snapshots after the cron install. One file never mixes the two. Share out uses the MCC of 2022. Exception: `power --missing` replaces an ODIN-sourced file when an EAGLE-I year Parquet now covers its window, because EAGLE-I covers every utility | ODIN covers CenterPoint customers only; revisit when ODIN lists a second utility |
| 13 | Gap rule | A step with no source row is null and draws as a gap. No fill, no interpolation | Revisit if EAGLE-I documents that an absent row means zero |
| 14 | Internet layer | Publish IODA-derived ratios only after IODA answers in writing. Until then the internet publish is off by default | IODA reply |
| 15 | ODIN terms | Publish ODIN county totals with attribution to ORNL. ODIN states no licence, so the owner asks ORNL in writing | ORNL reply |

## Standing constraints

- Outputs are labelled "radar-estimated hail size" with a confidence band, never "damaged".
- HCAD owner fields are stripped at load. No homeowner contact data is stored or published.
- Email HCAD GIS in week 1 about reuse terms. Until the answer arrives, publish derived aggregates (counts by size class and ZIP) and parcel geometry only.
- Read the employer IP assignment clause before the first code commit.

> ⚠️ UNVERIFIED: the repo does not record whether the HCAD email went out or whether the IP clause was read. `docs/reports/week-08.md` lists both as open owner steps.
