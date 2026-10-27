# Hailprint site

Static Preact site that reads the published files under `site/data/`. No server.

## Commands

```bash
npm ci           # install from the lockfile
npm run dev      # Vite dev server at http://localhost:5173
npm run check    # tsc --noEmit && vitest run && vite build
```

`make site` at the repo root runs `npm ci` and `npm run check`.

## Routes

`/storms/<date>/map|parcels|score|data`, `/scorecard/<table|grid|curve>`, `/try/<tune|point|compare|run>`,
`/method/<data|storm-date|size-classes|scoring|limits>`, `/pipeline/<runs|archive|sources>`. `/` redirects to
the newest storm date, `/scorecard` opens the Table view, `/try` opens the Tune tool, `/method` opens the Data
page, and `/pipeline` opens Runs.

## Data

`uv run hailprint publish` at the repo root writes `site/data/storms.json` and one folder per
storm date under `site/data/storms/<date>/`. The build copies `site/data/` to `/data/`.
Without the folder the site shows "No storm date is published yet."
The same command writes `site/data/pipeline.json`: the run log, the archive coverage, and the source list for `/pipeline`.
`uv run python site/scripts/pool_golden.py` writes `site/data/pooled-golden.json`, the pooled table at
every whole radius; `src/pool.test.ts` checks the browser pool against it and skips without the file.

## Basemap

`scripts/basemap.sh` extracts the Harris County bbox at maxzoom 12 from the Protomaps daily
build into `public/basemap.pmtiles` with the `pmtiles` CLI. The file is optional: the map
draws paper and the county outline when it is absent. The file is gitignored.

## Vercel

The root `vercel.json` sets the fields: install `cd site && npm ci`, build
`cd site && npm run build`, output `site/dist`, and a rewrite of every path without a dot to
`/index.html`. Git deployments are off for `main` (`git.deploymentEnabled` in `vercel.json`), so a
merge never replaces production with a data-free build; PR branches keep their previews.
`scripts/deploy.sh` on the cron host runs `vercel pull`, `vercel build --prod`, and
`vercel deploy --prebuilt --prod --archive=tgz`. `scripts/deploy.sh --dry-run` builds `site/dist`
and stops. The auth comes from `VERCEL_TOKEN` or a `vercel login` session, with `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` on a host without a link folder.

## Dev harness

In `npm run dev`, `main.tsx` imports `src/dev/harness.tsx` and mounts the scenario bar after `#app`.
A button stores the scenario in `sessionStorage` and reloads. The harness then installs a fake fetch
before the first render: index loading, index empty, and one HTTP 500 for the index, the swath, the
reports, the pairs, or the ZIP counts. The production build drops the module.
