# Kickoff prompt

Open a new Claude Code session with `C:\Users\huuth\Desktop\Hailprint` as the working directory and paste the block below.

---

You are starting the Hailprint project in this folder. Hailprint is an open hail-exposure map for Harris County, Texas, that grades itself against NOAA storm reports. The plan is approved. Read these files first, in this order:

1. `README.md`
2. `docs/DECISIONS.md`
3. `docs/plan-v4.md` (sections 5, 6, 7, 8, 9, 11 carry the build contract; the rest is context)
4. `docs/research/lane-b-hail.md` (data-source facts: bucket names, file sizes, formats, licences)

This session delivers the week-1 spike. Follow your standard workflow for feature work. Exit check for the week: one PNG that shows a MESH hail-swath contour over the Harris County outline for one real storm day.

Week-1 tasks:

1. Project skeleton. Python 3.12 project with `uv` or `pip-tools`, `src/hailprint/`, `tests/`, `data/` (gitignored), a `Makefile` or `justfile`, `ruff` and `pytest` configured. Keep the dependency list to what the spike needs.
2. One storm day. Pick a Harris County hail day between 2020-10-14 and today (use `spc.noaa.gov/climo/reports/` to find one with reports in Harris County). Download that day's `MESH_Max_1440min_00.50` files from the `noaa-mrms-pds` bucket (us-east-1, path `CONUS/MESH_Max_1440min_00.50/YYYYMMDD/`, GRIB2 gzipped, about 0.8 MB each, 48 per day). Anonymous S3 access.
3. Decode. Open the GRIB2 with `cfgrib` and `xarray`. Confirm units are millimetres and the grid is 0.01 degrees. Crop to the Harris County bounding box. Take the daily maximum across the 48 files.
4. Contour. Threshold at 19.05, 25.4, 31.75, 38.1, 44.45, 50.8, and 63.5 mm (0.75 to 2.5 inch). Polygonize with `rasterio.features`, dissolve with `shapely`, and write one GeoParquet file.
5. Plot. Draw the swath polygons over the Harris County outline (TIGER county shapefile or the HCAD boundary) and save `out/spike-<date>.png`.
6. Admin tasks, each as a checklist item in `docs/WEEK-01.md` with its status: download the HCAD parcel shapefile and record the owner fields that must be stripped at load; draft the HCAD GIS reuse-terms email for Tom to send; run a USPTO TESS search and a domain check for "Hailprint" and record the result; remind Tom to read the employer IP assignment clause before the first commit of pipeline code.

Rules that bind every line of code and text:

- Outputs say "radar-estimated hail size" with a confidence band. They never say "damaged".
- No homeowner names, mailing addresses, or contact data. Strip owner fields from HCAD at load time and add a test that proves they are absent from every written file.
- No secrets in the repo. Name the environment variable, never its value.
- Data files and downloads stay out of git (`data/`, `out/` ignored). Commit code, tests, docs, and small fixtures only.
- Commit on a feature branch and open a pull request against `main`; the remote is a private GitHub repo with Actions disabled.

When the spike is done, report: the storm date chosen, the number of SPC reports in Harris County that day, the maximum MESH value in the bbox, the file path of the PNG, the test command and its result, and the status of each admin item. Then propose the week-2 plan (M1 ingest and the 2020-10 to now archive index) as a short list for approval.

---
