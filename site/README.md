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

## Basemap

`scripts/basemap.sh` extracts the Harris County bbox at maxzoom 12 from the Protomaps daily
build into `public/basemap.pmtiles` with the `pmtiles` CLI. The file is optional: the map
draws paper and the county outline when it is absent. The file is gitignored.

## Vercel

The root `vercel.json` sets the fields: install `cd site && npm ci`, build
`cd site && npm run build`, output `site/dist`, and a rewrite of every path without a dot to
`/index.html`. The data folder reaches the build only from a machine that holds it (PR H).

## Dev harness

`?harness` on any route shows the scenario bar: index loading, index empty, index error, and
swath error.
