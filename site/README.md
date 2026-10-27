# Hailprint site

Static Preact site that reads the published files under `site/data/`. No server.

## Commands

```bash
npm ci           # install from the lockfile
npm run dev      # Vite dev server at http://localhost:5173
npm run check    # tsc --noEmit && vitest run && vite build
```

`make site` at the repo root runs `npm ci` and `npm run check`.

## Data

`uv run hailprint publish` at the repo root writes `site/data/storms.json` and one folder per
storm date under `site/data/storms/<date>/`. The build copies `site/data/` to `/data/`.
Without the folder the site shows "No storm date is published yet."
`uv run python site/scripts/pool_golden.py` writes `site/data/pooled-golden.json`, the pooled table at
every whole radius; `src/pool.test.ts` checks the browser pool against it and skips without the file.

## Basemap

`scripts/basemap.sh` extracts the Harris County bbox at maxzoom 12 from the Protomaps daily
build into `public/basemap.pmtiles` with the `pmtiles` CLI. The file is optional: the map
draws paper and the county outline when it is absent. The file is gitignored.

## Vercel

The root `vercel.json` sets the fields: install `cd site && npm ci`, build
`cd site && npm run build`, output `site/dist`, and a rewrite of every path without a dot to
`/index.html`. The data folder reaches the build only from a machine that holds it (PR H).

## Dev harness

In `npm run dev`, `main.tsx` imports `src/dev/harness.tsx` and mounts the scenario bar after `#app`.
A button stores the scenario in `sessionStorage` and reloads. The harness then installs a fake fetch
before the first render: index loading, index empty, and one HTTP 500 for the index, the swath, the
reports, the pairs, or the ZIP counts. The production build drops the module.
