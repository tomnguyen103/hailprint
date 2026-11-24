# Hailprint site

Static Preact site that reads the published files from `VITE_DATA_BASE` (or `/data/` in local dev). No server.

## Commands

```bash
npm ci           # install from the lockfile
npm run dev      # Vite dev server at http://localhost:5173
npm run check    # tsc --noEmit && vitest run && vite build
npm run test:e2e # Playwright browser tests in e2e/ (Chromium, fixture data under e2e/fixtures/; run `npx playwright install chromium` once first)
```

`make site` at the repo root runs `npm ci`, `npx playwright install chromium`, `npm run check`, and `npm run test:e2e`.
`uv run python site/scripts/make_icons.py site/public <preview.png>` at the repo root writes `favicon.svg`,
`favicon.ico`, and `apple-touch-icon.png` to `site/public/`, and a preview sheet to `<preview.png>`.

## Routes

`/live`, `/storms/<date>/map|parcels|score|data`, `/storms/<date>/map/<step>` (step 0 to 191), `/scorecard/<table|grid|curve>`, `/try/<tune|point|compare|run>`,
`/method/<data|storm-date|size-classes|scoring|limits|impacts>`, `/pipeline/<runs|archive|sources>`. `/` redirects to
`/live`, `/storms` opens the landing storm date from `landingStorm` in `src/storms/select.ts` (the newest date with power and internet files and at least 5 reports; else the newest with power and internet files; else the newest with a power file; else the newest with any impact layer; else the newest storm date), `/storms/<date>` opens the Map tab, `/scorecard` opens the Table view, `/try` opens the Tune tool, `/method` opens the Data
page, and `/pipeline` opens Runs.

## Data

The site reads published JSON from `DATA_BASE` (`import.meta.env.VITE_DATA_BASE ?? "/data/"` in `src/data/fetch.ts`). In production, `VITE_DATA_BASE` points to the public Supabase Storage bucket (`hailprint-public`), so a data refresh from Trigger.dev needs no site deploy.
In local development, `uv run hailprint publish` at the repo root writes `site/data/storms.json` and one folder per
storm date under `site/data/storms/<date>/`, served at `/data/`.
If `storms.json` is missing, `fetchJson` returns an HTTP 404 error and the storm routes render an error state; when `storms.json` is valid and contains no storms, the site shows "No storm dates in catalog."
The same command writes `site/data/pipeline.json`: the run log, the archive coverage, and the source list for `/pipeline`.
`uv run hailprint live` writes `site/data/live/now.json`, `swath.geojson`, `reports.geojson`, and `warnings.geojson` for `/live`; the browser never calls NWS, ODIN, or IODA directly.
A storm date folder also holds `warnings.geojson` where `hailprint warnings` ran, `power.json` where `hailprint power` ran, and `internet.json` where `hailprint internet` ran and `publish` used `--with-internet`.
`uv run python site/scripts/pool_golden.py` writes `site/data/pooled-golden.json`, the pooled table at
every whole radius; `src/pool.test.ts` checks the browser pool against it and skips without the file.

## Basemap

`site/scripts/basemap.sh` extracts the 8-county metro bbox (`hailprint.county.metro_bbox()`) at
maxzoom 12 from the Protomaps daily build into `site/public/basemap.pmtiles` with the `pmtiles`
CLI. The file is optional: the map draws paper and the county outlines when it is absent.
Git tracks `public/basemap.pmtiles` (`!site/public/basemap.pmtiles`) so Vercel deployments serve the basemap. The impact layers (warnings, power, and internet) draw across the 8 counties.
Rerun `site/scripts/basemap.sh` after a change to the metro bbox, and on a new host, so the extract covers all 8 counties.

## Vercel

The root `vercel.json` sets the fields: install `cd site && npm ci`, build
`cd site && npm run build`, output `site/dist`, a `Content-Security-Policy` (`script-src 'self' blob:` with blocking `/theme-init.js` replacing inline boot JS; `connect-src 'self' https://*.supabase.co https://*.protomaps.com https://protomaps.github.io`), and a rewrite of every path without a dot to `/index.html`. Because published data lives in the public Supabase Storage bucket (`VITE_DATA_BASE`), the Vercel build holds code only and git deployments are enabled for `main` (`git.deploymentEnabled.main: true` in `vercel.json`).
Cloud schedules and bucket setup live in [docs/operations.md](../docs/operations.md).

## Dev harness

In `npm run dev`, `main.tsx` imports `src/dev/harness.tsx` and mounts the scenario bar after `#app`.
A button stores the scenario in `sessionStorage` and reloads. The harness then installs a fake fetch
before the first render: index loading, index empty, and one HTTP 500 for the index, the swath, the
reports, the pairs, or the ZIP counts. Two more scenarios fail only the first request of the newest storm date for `pairs.json` or `swath.geojson`. The production build drops the module.
