# Decisions

Plan section 16 listed six decisions. Tom approved the plan on 2026-10-24 and adopted the recommendations below.

| # | Decision | Adopted answer | Open item |
|---|---|---|---|
| 1 | Name | "Hailprint" (working name) | USPTO and domain check in week 1; rename is cheap before launch |
| 2 | Scheduler | Start with a local or VPS cron job. The repo is private, so GitHub Actions minutes are not free; Actions stay disabled on the repo | Revisit when the repo goes public at launch |
| 3 | Footprints in v1 | HCAD only. No Microsoft or Overture footprints in v1 (ODbL share-alike) | v2 candidate |
| 4 | Scope | Harris County only | Nine-county metro is a v2 candidate |
| 5 | Languages | Python for the pipeline (cfgrib, xarray, rasterio, shapely, geopandas, duckdb); TypeScript plus MapLibre GL for the map; PMTiles on Cloudflare R2 or Pages | none |
| 6 | Go | Approved. Week 1 spike starts from `docs/KICKOFF.md` | none |

## Standing constraints

- Outputs are labelled "radar-estimated hail size" with a confidence band, never "damaged".
- HCAD owner fields are stripped at load. No homeowner contact data is stored or published.
- Email HCAD GIS in week 1 about reuse terms. Until the answer arrives, publish derived aggregates (counts by size class and ZIP) and parcel geometry only.
- Read the employer IP assignment clause before the first code commit.
