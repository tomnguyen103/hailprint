# Hailprint

Hailprint draws the MRMS MESH hail swath over Harris County parcels and scores it against SPC hail reports at every whole-km radius. The site shows radar-estimated hail size with a confidence band; the published skill ceiling is an HSS of about 0.38 at 30 mm.

## Status

Plan v5, PRs A to H, is built; `docs/WEEK-08.md` holds the PR table. The site runs from `site/data/`, written by `hailprint publish`. The nightly run and the deploy are scripts under `scripts/`. The live upload, the cron install, and the public launch are owner steps (`docs/WEEK-08.md`).

## Commands

```bash
make setup                                  # uv sync
make lint                                   # ruff check . && ruff format --check . && pyright
make test                                   # uv run pytest -q
uv run hailprint ingest 2024-05-28          # swath file and PNG for one or more storm dates
uv run hailprint index                      # archive index from one S3 bucket listing
uv run hailprint candidates --top 20        # ranked candidate days; needs `index` first
uv run hailprint candidates --missing       # candidate days with a 12Z file and no swath file, newest first
uv run hailprint parcels 2024-05-28         # parcel count per size class; needs `ingest` for that date and the HCAD gdb
uv run hailprint score --radius-km 5        # scores every swath file against the SPC daily CSVs
uv run hailprint publish                    # writes site/data/ (ZIP counts only where `parcels` ran)
make site                                   # cd site && npm ci && npm run check
cd site && npm run dev                      # Vite dev server at http://localhost:5173
scripts/deploy.sh --dry-run                 # make deploy-dry: build site/dist and stop before vercel
scripts/nightly.sh                          # make nightly: the nightly run, index to deploy
```

## Nightly run and deploy

`scripts/nightly.sh` runs the nightly run in this order. `index` refreshes the archive index. `candidates --missing --top $MAX_INGEST` prints the missing candidate days. `ingest` draws a swath file for each of them. `parcels` counts parcels for each of them when the HCAD gdb is present. `score` and `publish` write the scores and `site/data/`. `scripts/deploy.sh` uploads the site.

The lock is the directory `data/nightly.lock`. A second run finds it and exits 1. The trap removes it on exit. `MAX_INGEST` caps the storm dates per night; the default is 5. `scripts/hailprint.cron` holds the cron entry at 14:00 UTC; edit the repo path and the `PATH` home path, then run `crontab scripts/hailprint.cron`.

The data path: Git deployments are off for `main` in `vercel.json`, so a merge never replaces production with a data-free build. The cron host holds `site/data/` and deploys with the prebuilt flow: `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod --archive=tgz`. `scripts/deploy.sh --dry-run` builds `site/dist` and stops before any `vercel` call. The auth comes from `VERCEL_TOKEN`, with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` on a host without a link folder, or from a `vercel login` session. The values live in `.env` at the repo root, which is gitignored, never in the repo. `.env` holds one `NAME=value` per line, the value from letters, digits, and `_ . / : @ + -`, no `export`, no quote, LF line endings; a comment and a blank line pass. Both scripts refuse any other line before any step and print its line number only.

## Documents

| File | Purpose |
|---|---|
| `docs/plan-v5.md` | The plan of record for PRs A to H: audit findings, site architecture, viewer actions, the autonomous programme |
| `docs/plan-v4.md` | The approved week-1 plan: pitch, evidence, scope, scorecard design, architecture, data licences, risks, schedule, budget, sources |
| `docs/plan-v4.html` | The same plan as a standalone page |
| `docs/DECISIONS.md` | The adopted answers and the standing constraints |
| `docs/KICKOFF.md` | The prompt that starts week 1 in this folder |
| `docs/WEEK-01.md` | Week 1: the spike, one 12Z file per storm date |
| `docs/WEEK-02.md` | Week 2: aligned ingest, archive index, candidate days, parcel counts |
| `docs/WEEK-03.md` | Week 3: the verification scorer (PR C) |
| `docs/WEEK-04.md` | Week 4: the published files for the site (PR D) |
| `docs/WEEK-05.md` | Week 5: site shell and the Storms workspace (PR E) |
| `docs/WEEK-06.md` | Week 6: Scorecard and Try it (PR F) |
| `docs/WEEK-07.md` | Week 7: Method and Pipeline (PR G) |
| `docs/WEEK-08.md` | Week 8: ship preparation (PR H), the dry run, the owner runbook |
| `docs/research/` | Research receipts behind the pick: scoring rubric and the three candidate lanes |
| `docs/solutions/` | Learn-loop entries by category: data, geo, site, tooling |
| `GLOSSARY.md` | The domain terms used in code, tests, commits, and chat |
| `site/README.md` | The site commands, routes, data path, basemap step, and Vercel fields |

## Rules that never change

- Outputs say "radar-estimated hail size at this parcel" with a confidence band. They never say "damaged".
- No homeowner names, mailing addresses, or contact data, ever. Owner fields are stripped from HCAD parcels at load time.
- The published skill ceiling for radar hail estimates is low (Heidke skill score about 0.38 against dense ground truth). Lead with it.
- No secrets in the repo. Credentials live in environment variables; the variable name is documented, the value is not.
