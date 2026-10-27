# Week 8 — Ship preparation (PR H)

Goal: the last PR of plan v5. `hailprint candidates --missing` prints the missing candidate days. `scripts/deploy.sh` builds and uploads the site from a machine that holds `site/data/`; `--dry-run` builds `site/dist` and stops before any `vercel` call. `scripts/nightly.sh` runs index, missing candidate days, ingest, parcels, score, publish, and deploy under one lock. `scripts/hailprint.cron` holds the cron entry. The README describes the shipped site, plan v5 lands under `docs/`, and the site data path is a decision (`docs/DECISIONS.md` row 10).

Oracle: `tests/test_candidates.py` runs `candidates --missing` against a monkeypatched archive index and swath folder and reads stdout. `tests/test_scripts.py` runs a copy of each script under Git Bash with stub `npm`, `vercel`, `uv`, and `deploy.sh` first on PATH, and asserts the call log, the exit code, and the lock. `tests/test_readme.py` reads the choice set from `build_parser().format_help()` and the week reports from `docs/`. The dry run on this host is the manual oracle: exit 0, the log lines in order, `site/dist/index.html` and `site/dist/data/storms.json` on disk, and the same storm count in `site/dist/data/storms.json` and `site/data/storms.json`.

## Method

- Six tickets, one commit each, on `feat/pr-h-ship-prep`: `candidates --missing`; the deploy script with Git deployments off for `main`; the nightly run script and the cron entry; the README, the plan v5 copy, and the README test; the site README, the glossary rows, and decision row 10; this report with the real dry run.
- `candidates.missing_days` keeps the ranked days with a 12Z file and no `swaths-<date>.parquet` under `data/derived/swaths/`, newest first. `--missing` prints one storm date per line and omits the table; `--top` caps the list.
- `scripts/deploy.sh` refuses without `site/data/storms.json` and during a publish (`site/data/publish.lock`). The dry run runs `npm ci` and `npm run build` in `site/` and verifies `site/dist/index.html` and `site/dist/data/storms.json`. The live path runs `vercel pull --yes --environment=production`, `vercel build --prod --yes`, the same verify on `.vercel/output/static`, and `vercel deploy --prebuilt --prod --archive=tgz --yes`. `--token` follows each call only when `VERCEL_TOKEN` is set. The script prints no value.
- `scripts/nightly.sh` sources `.env` when present, takes `MAX_INGEST` (default 5), and holds the lock as the directory `data/nightly.lock` through `mkdir`; the EXIT trap removes it after success and after a failed step. `parcels` runs per missing candidate day only when `data/raw/hcad/extracted/Parcels.gdb` is present. `--dry-run` passes through to the deploy.
- `scripts/hailprint.cron` holds one entry, `0 14 * * *` under `CRON_TZ=UTC`, with the path to edit and the install command in comments.

## Run

```bash
& "C:\Program Files\Git\bin\bash.exe" -lc "cd /c/Users/huuth/Desktop/Hailprint && scripts/deploy.sh --dry-run; echo exit=$?"
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest -q
cd site && npm run check  # tsc --noEmit && vitest run && vite build
node ~/.claude/skills/impeccable/scripts/detect.mjs --json site/index.html site/src
```

| PR | Title | Number | Merge |
|---|---|---|---|
| A | Back-end fixes (F1-F3, F7-F15) | #3 | `ccb1e29` |
| B | Data scope for reports, candidates, and parcels | #4 | `30e47dc` |
| C | Verification scorer | #5 | `1152f1a` |
| D | Published files for the site | #6 | `656d094` |
| E | Site shell and Storms workspace | #7 | `c829d6e` |
| F | Scorecard and Try it | #8 | `acb032e` |
| G | Method and Pipeline pages, pipeline.json | #9 | `8bdfe6c` |
| H | Ship preparation | this PR | this PR |

| Item | Value |
|---|---|
| Dry run | exit 0 on 2026-10-27; log lines `deploy: npm ci`, `deploy: npm run build`, `deploy: dry run done: site/dist verified, no vercel call`; `npm ci` added 157 packages in 3 s |
| Built files | `site/dist/index.html` 1345 bytes; `site/dist/data/storms.json` 52511 bytes, 25 storms, equal to `site/data/storms.json` |
| Python tests | 357 passed; ruff, format, and pyright clean, 2026-10-27 |
| Site tests | 197 passed in 21 vitest files; `tsc --noEmit` clean; `vite build` in 329 ms |
| Impeccable detector | exit 0, `[]` findings on `site/index.html` and `site/src`; no UI file changed in this PR |
| First dry run | `npm ci` failed with `EPERM` on the rolldown binding: a `vite preview --port 4173` from 2026-10-26 held `site/node_modules`. The second run after that process stopped passed |

## Checks

- `test_candidates.py`: `--missing` prints the one day without a swath file and still writes the CSV; `--top 1` prints the newest of two; nothing prints when every day is present; the table is absent; without the archive index the command exits 1; the list is empty after the swath file appears; `missing_days` is newest first.
- `test_scripts.py`: every script parses under `bash -n`; the dry run runs `npm ci` and `npm run build` in `site/` and calls no `vercel`; the live path runs pull, build, and deploy with `--token` when `VERCEL_TOKEN` is set and without it otherwise, and the token value is absent from stdout and stderr; the script refuses without `site/data/storms.json` and during a publish; an unknown argument exits 2 with usage; a build without `data/storms.json` stops the dry run and stops the live path before `vercel deploy`; the nightly run calls every step in order and removes the lock; it skips ingest and parcels without a missing candidate day; it skips parcels without the HCAD gdb; `MAX_INGEST` from the environment and from `.env` caps the candidates call; `--dry-run` reaches the deploy; a present lock exits 1 with no call and stays; a failed `score` exits 3 and removes the lock; an unknown argument exits 2; the cron file holds one entry at `0 14 * * *` under `CRON_TZ=UTC`.
- `test_readme.py`: the README names `hailprint <name>` for every parser command, every `docs/WEEK-*.md`, the three script paths, and no "live map".
- `test_outputs_clean.py` and a text scan: no forbidden word and no owner field in `docs/plan-v5.md`, the glossary rows, the site README, or the decision row.

## Decisions

- Site data path (`docs/DECISIONS.md` row 10): Git deployments off for `main` in `vercel.json`; the cron host builds with `site/data/` present and uploads with the prebuilt flow; PR branches keep data-free previews. The dashboard ignored build step is dead and goes at launch.
- The nightly lock is a `mkdir` directory: `flock` is absent in Git Bash, and `mkdir` is atomic on every host.
- The cron hour is 14:00 UTC: the 12Z file of yesterday's storm date lands on S3 after 12:00 UTC.
- Log rotation and a retry on a failed step wait for the first month of runs (`shortcut:` in `scripts/hailprint.cron`).

## Owner steps

1. On the cron host, run `vercel login` once, or write `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to `<repo>/.env` (gitignored). The script prints no value.
2. Run `scripts/deploy.sh` by hand once and confirm the production URL `hailprint.tomnguyen.me`.
3. Edit the path in `scripts/hailprint.cron`, then run `crontab scripts/hailprint.cron`.
4. Remove the dashboard ignored build step in the Vercel project.
5. Close the HCAD reply and the employer IP clause (`docs/DECISIONS.md` standing constraints). The site shows ZIP totals only until the HCAD reply.
6. Public launch.

## Handover

- Carried from PR G: the `create-map` chunk stands at 1.1 MB over three surfaces; `point.tsx` and `compare.tsx` each hold a map lifecycle effect, one shared hook is a cleanup candidate; `storms.json` could carry `radius_km_max` for the Tune slider; the Pipeline services can read a freshness rule from `run_time` after the first cron runs.
- Deferred LOW list from PR G: the guard folder and storm date tie; the `$` newline dialect in the Pipeline text; Safari pointer `body` capture; drawer `role="dialog"`; open and close in one frame.
- The first `scripts/deploy.sh` run on the cron host is the live oracle of the prebuilt flow; the dry run proves the build and the verify only.
