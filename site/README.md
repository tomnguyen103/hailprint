# Hailprint site

Static Preact site that reads the published files under `site/data/`. No server.

## Commands

```bash
npm ci           # install from the lockfile
npm run dev      # Vite dev server at http://localhost:5173
npm run check    # tsc --noEmit && vitest run && vite build
```

`make site` at the repo root runs `npm ci` and `npm run check`.
`uv run python site/scripts/make_icons.py site/public <preview.png>` at the repo root writes `favicon.svg`,
`favicon.ico`, and `apple-touch-icon.png` to `site/public/`, and a preview sheet to `<preview.png>`.

## Routes

`/storms/<date>/map|parcels|score|data`, `/scorecard/<table|grid|curve>`, `/try/<tune|point|compare|run>`,
`/method/<data|storm-date|size-classes|scoring|limits|impacts>`, `/pipeline/<runs|archive|sources>`. `/` redirects to
the newest storm date, `/scorecard` opens the Table view, `/try` opens the Tune tool, `/method` opens the Data
page, and `/pipeline` opens Runs.

## Data

`uv run hailprint publish` at the repo root writes `site/data/storms.json` and one folder per
storm date under `site/data/storms/<date>/`. The build copies `site/data/` to `/data/`.
Without the folder the site shows "No storm date is published yet."
The same command writes `site/data/pipeline.json`: the run log, the archive coverage, and the source list for `/pipeline`.
A storm date folder also holds `warnings.geojson` where `hailprint warnings` ran and `power.json` where `hailprint power` ran.
`uv run python site/scripts/pool_golden.py` writes `site/data/pooled-golden.json`, the pooled table at
every whole radius; `src/pool.test.ts` checks the browser pool against it and skips without the file.

## Basemap

`scripts/basemap.sh` extracts the 8-county metro bbox (`hailprint.county.metro_bbox()`) at
maxzoom 12 from the Protomaps daily build into `public/basemap.pmtiles` with the `pmtiles`
CLI. The file is optional: the map draws paper and the county outlines when it is absent.
The file is gitignored. The impact layers (warnings and power) draw across the 8 counties.
Rerun `scripts/basemap.sh` after a change to the metro bbox, and on a new host, so the extract covers all 8 counties.

## Vercel

The root `vercel.json` sets the fields: install `cd site && npm ci`, build
`cd site && npm run build`, output `site/dist`, and a rewrite of every path without a dot to
`/index.html`. Git deployments are off for `main` (`git.deploymentEnabled` in `vercel.json`), so a
merge never replaces production with a data-free build; PR branches keep their previews.
The deploy from the cron host, its dry run, and its auth live in
[docs/operations.md](../docs/operations.md#deploy).

## Dev harness

In `npm run dev`, `main.tsx` imports `src/dev/harness.tsx` and mounts the scenario bar after `#app`.
A button stores the scenario in `sessionStorage` and reloads. The harness then installs a fake fetch
before the first render: index loading, index empty, and one HTTP 500 for the index, the swath, the
reports, the pairs, or the ZIP counts. The production build drops the module.
