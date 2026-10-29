# Plan: live data on the site (Trigger.dev + Supabase Storage)

Status: draft for review, 2026-10-28. No code changes until the owner approves this plan.

## 1. Goal

The site shows the power and internet outage layers on the storm map, next to the swath, the
reports, and the warnings. The data refreshes on its own. Nobody runs a `uv` command or uploads a
file by hand. A delay of hours is acceptable.

## 2. What the owner gets, and what no source can give

| Layer | After this plan | Limit that no code removes |
|---|---|---|
| Swath, reports, score | A new storm date appears the morning after the convective day (task at 13:30 UTC) | none |
| Warnings | Every storm date (25 of 25 now, every new date) | none |
| Power | 2021, 2023, 2024, 2025 dates from EAGLE-I (22 of 25). New dates from ODIN snapshots, once per hour | EAGLE-I has no 2026 year. ODIN is a live snapshot only, so the 3 past 2026 dates (04-30, 06-02, 08-28) never get power. ODIN counts CenterPoint customers only. An hourly snapshot fills 1 of the 4 steps in each hour; the other 3 steps stay null and draw as gaps |
| Internet | 13 dates, 2023-03-27 to 2024-05-28 | IODA has a county signal only from 2022-03 to 2024-05. New storm dates get no internet layer. DECISIONS row 14 still gates the publish |

A layer file appears after the impact window closes (12:00 UTC on D+2), because `power --missing`
and `internet --missing` wait for a closed window. Open question Q3 asks whether to publish an
open window.

## 3. Architecture

```
Trigger.dev (Hobby)                                Supabase Storage (free)
  schedule "nightly"  13:30 UTC  ──┐                 bucket hailprint-state  (private)
  schedule "odin"     hourly     ──┼── Python ──►      raw/spc/..., derived/...
  task "backfill"     on demand  ──┘   hailprint       bucket hailprint-public (public read)
                                       CLI             storms.json, pipeline.json, storms/<date>/*
                                                              │
Vercel project "hailprint" (static site, code only) ◄── browser fetches JSON from the public bucket
```

- **One server path.** Each task syncs its state down from Supabase into an empty `data/` and
  `site/data/` tree, runs the existing CLI commands unchanged, and syncs the changed files up.
  `publish.validate` and `publish.dumps` stay the only gate before a file goes public.
- **The site build holds no data.** `DATA_BASE` comes from `VITE_DATA_BASE`, the public bucket URL.
  A data refresh needs no site deploy. A code change needs one site deploy.
- **No new Python dependency.** Supabase Storage speaks the S3 protocol, and `boto3` is already a
  dependency.

## 4. Storage layout

| Bucket | Prefix | Content | Writer |
|---|---|---|---|
| `hailprint-state` (private) | `raw/spc/` | WCM zip, cached SPC daily CSVs (about 9 MB) | nightly |
| | `derived/` | swath, scores, warnings, power, internet, eaglei, archive index Parquet (about 2 MB now) | nightly, backfill |
| | `derived/odin/` | ODIN day files, one per UTC day | odin only |
| | `data/candidate-days.csv` | the candidate list | nightly |
| `hailprint-public` (public read) | `/` | `storms.json`, `pipeline.json` | nightly, backfill |
| | `storms/<date>/` | the per-date files | nightly, backfill |

Not stored: the MESH GRIB2 (each ingest fetches it from S3 again), the PNG under `out/`, and the
HCAD gdb (see Q2). Upload `Cache-Control: max-age=60` on every public object.

## 5. Python changes

| File | Change |
|---|---|
| `src/hailprint/paths.py` | `ROOT` reads `HAILPRINT_ROOT` when set, else the repo root. This is the upgrade that the `shortcut:` comment names |
| `src/hailprint/cloud.py` (new) | `sync_down(prefixes)` and `sync_up(prefixes, mirror=)`: S3 client on the Supabase endpoint. `sync_up` uploads only files whose hash changed since `sync_down`. `mirror=True` deletes a remote object with no local file (stale storm files). Per-date files go up first, `storms.json` and `pipeline.json` last, so a reader never sees an index that names a missing file |
| `src/hailprint/cloud.py` | `nightly()`: the steps of `scripts/nightly.sh` in Python, through `__main__.main(argv)`, with the same failure rules: a failed ingest skips its date; a failed warnings, power, or internet step logs and goes on; parcels skip (no gdb) |
| `src/hailprint/__main__.py` | one command `cloud {nightly,odin,backfill}` that wraps sync down, the run, and sync up |
| `scripts/nightly.sh`, `scripts/deploy.sh` | removed; the cloud tasks replace them (CLAUDE.md rule: remove the obsolete path) |
| `tests/test_cloud.py` (new) | a fake S3 client: changed-file upload, mirror delete, index-last order, ODIN prefix never in the nightly upload set |

Each task uploads only its own prefixes. `nightly` never uploads `derived/odin/`, and `odin` uploads
nothing else. So the two schedules run side by side with no lock. Each task has its own queue with
a concurrency limit of 1, so two runs of one task never overlap.

## 6. Trigger.dev project

| File | Content |
|---|---|
| `trigger.config.ts` | `pythonExtension({ requirementsFile: "./requirements.txt" })`, `dirs: ["./trigger"]`, `maxDuration` 3600 s |
| `trigger/nightly.ts` | `schedules.task`, cron `30 13 * * *` UTC, machine `medium-1x`, queue concurrency 1, runs `python -m hailprint cloud nightly` |
| `trigger/odin.ts` | `schedules.task`, cron `0 * * * *` (once per hour), machine `small-1x`, queue concurrency 1, runs `cloud odin` (syncs only today's ODIN day file) |
| `trigger/backfill.ts` | `task`, on demand: `warnings --missing`, `eaglei 2021 2023 2025`, `power --missing`, `internet --missing`, `publish` |
| `requirements.txt` | `uv export --no-dev --no-hashes`; a test checks that it matches `uv.lock` |
| `package.json` (repo root) | `@trigger.dev/sdk`, `@trigger.dev/python`, `@trigger.dev/build`, `trigger.dev` CLI, TypeScript |

Environment variables in Trigger.dev (names only, values stay in the dashboard):
`SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`,
`SUPABASE_S3_SECRET_ACCESS_KEY`, `HAILPRINT_STATE_BUCKET`, `HAILPRINT_PUBLIC_BUCKET`, `MAX_INGEST`,
`PUBLISH_INTERNET`.

## 7. Site changes

| File | Change |
|---|---|
| `site/src/data/fetch.ts` | `DATA_BASE = import.meta.env.VITE_DATA_BASE ?? "/data/"`. The dev server keeps `/data/` |
| `site/src/storms/map-pane.tsx` | default fill: `power` when the date has a power file, else `internet` when it has one, else `none` |
| storm date list | one chip per impact layer that the date has (power, internet, warnings), from `Storm.files` |
| `site/src/app.tsx` | `/` opens the newest storm date with an impact layer; no such date gives the newest date |
| `site/src/state/` | re-fetch `storms.json` when the tab becomes visible and every hour while visible (Q4) |
| `site/README.md` | `VITE_DATA_BASE`, the bucket URL, no data step in the deploy |

The UI items run at modification scale through `design.md` and the impeccable detector gate.

## 8. Rules and decisions

- New DECISIONS row 18 replaces row 2: Trigger.dev schedules run the pipeline. GitHub Actions stay
  disabled. CLAUDE.md "Scheduling is a local or VPS cron job" changes to match.
- New DECISIONS row 19 replaces row 10: data lives in the Supabase public bucket. The Vercel
  build holds code only, so Vercel git deployments for `main` can turn on again (Q1).
- Row 14 stays: `PUBLISH_INTERNET` in Trigger.dev replaces the `.env` opt-in.
- Row 15 stays: ODIN totals publish with the ORNL attribution, as now.
- "damage" never appears; owner fields are never written; every Parquet goes through
  `files.write_atomic`. The sync layer copies files and changes no content.
- No secret value in the repo, the PR text, or a log line. Every message names the variable only.

## 9. Limits and cost (from the public pricing pages, 2026-10-28)

| Service | Limit | This plan's use |
|---|---|---|
| Supabase free | 1 GB storage, 5 GB egress per month, 50 MB per file, pause after 1 week idle | about 15 MB now, plus about 10 MB per year of ODIN day files. Every file is under 50 MB |
| Trigger.dev Hobby | $10 per month with $10 of usage included, 100 schedules, 50 concurrent runs | 2 schedules. About 750 runs per month |

Cost estimate, not verified: ODIN at about 30 s on `small-1x` times 720 runs, plus a nightly run
of about 10 minutes on `medium-1x`, sums to about $2–3 per month, inside the $10 credit. Check the
Trigger.dev usage page after the first week.

## 10. Risks

| Risk | Check or mitigation |
|---|---|
| The Trigger.dev image has no Python 3.12, or `eccodes`, `rasterio`, `pyogrio` fail to load | PR 1 spike: a `hello` task imports every module and prints `python --version`. Fallback: `aptGet` for `libeccodes`, or a custom image |
| The `hailprint` package itself does not install from `requirements.txt` (package data: county GeoJSON, schemas) | PR 1 spike: a wheel built by `uv build` goes into the deploy, or the source folder goes in through `scripts` |
| The Supabase public URL sends no CORS header | PR 1 spike: fetch `storms.json` from `localhost:5173` and read `Access-Control-Allow-Origin` |
| Storage traffic alone does not stop the free-project pause | The nightly task makes one REST call to the project API. Check the project state after 8 days |
| ODIN changes its feed or rate-limits | A failed fetch writes nothing (current rule). The run shows as failed in the Trigger.dev dashboard |
| The EAGLE-I streams (about 1.1–1.4 GB each) exceed the task disk | `read_eaglei` streams and keeps metro rows only; one year per backfill step |

## 11. Delivery

Each PR runs the feature pipeline (grill, spec, tickets, implement, audit loop, local review,
CodeRabbit, merge).

| PR | Scope | Done when |
|---|---|---|
| 1 | `HAILPRINT_ROOT`, `cloud.py` sync, `requirements.txt`, `trigger.config.ts`, `hello` task | the `hello` task passes on Trigger.dev; a sync round-trip writes and reads one object in each bucket; the CORS header is present |
| 2 | `cloud nightly/odin/backfill`, the three Trigger tasks, remove `nightly.sh` and `deploy.sh`, DECISIONS rows 18–19, CLAUDE.md | one manual `backfill` run publishes warnings for 25 dates and power for 22; one `nightly` run passes; `odin` writes 3 slots in 3 hours |
| 3 | `VITE_DATA_BASE`, site README, Vercel env var and deploy | the production site loads `storms.json` from the public bucket |
| 4 | default fill, layer chips, landing rule, re-fetch | `/` opens a date with power drawn; a new ODIN slot shows after a tab refocus |

Owner steps, before PR 1 merges (each takes a few minutes):

1. Finish the Supabase MCP sign-in: run `/mcp` in an interactive `claude` terminal and pick `supabase`.
2. Create one Supabase project (free) or name an existing one.
3. Create one Trigger.dev project, or let the Trigger.dev MCP create it after `npx trigger.dev@latest login`.
4. Restart this session, so the two MCP tool sets load.

After that, the run creates the buckets and the S3 keys through the MCPs and sets the Trigger.dev
variables. The backfill downloads three EAGLE-I years (about 3.6 GB from Figshare) inside
Trigger.dev; this plan's approval covers that download.

## 12. Open questions (recommendation first)

- **Q1. Site host.** The Vercel project `hailprint` exists. Recommendation: keep it for the static
  site and turn git deployments for `main` back on. Alternative: Cloudflare Pages.
- **Q2. Parcels.** The HCAD gdb is 674 MB, over the 1 GB free storage once state grows, and over
  the 50 MB file limit. Recommendation: ZIP counts stay for the dates that have them; new dates
  publish without ZIP counts. Revisit with a cut parcel file later.
- **Q3. Open impact window.** Recommendation: keep the closed-window rule (one stable file per
  date). Alternative: publish a provisional power file every hour while the window is open; this
  needs a schema field and a site label.
- **Q4. Re-fetch in the browser.** Recommendation: yes, on tab focus and every hour, to match the
  ODIN schedule. The cost is one small request per visitor per hour.
- **Q5. The 3 past 2026 dates.** No source can fill their power layer. Recommendation: the date
  list shows no power chip for them, and the fill note says "No power source for this date."
