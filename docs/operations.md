# Operations

This guide covers the Trigger.dev tasks, the Supabase Storage buckets, and the environment variables.

## Cloud tasks

`hailprint cloud` (`src/hailprint/cloud.py`) synchronizes state and public files with Supabase Storage over the S3 protocol and runs the CLI steps:

- `hailprint cloud nightly` (`trigger/nightly.ts`, cron `30 13 * * *` UTC on `medium-1x`, queue concurrency 1):
  1. Downloads `raw/spc/` and `derived/` from `HAILPRINT_STATE_BUCKET` and all published files from `HAILPRINT_PUBLIC_BUCKET`.
  2. Runs `index` and `candidates --missing --top $MAX_INGEST` (default `5`).
  3. Runs `ingest` for each missing candidate day (and `parcels` when `data/raw/hcad/extracted/Parcels.gdb` exists). A failed ingest logs one line and skips to the next date.
  4. Runs `score`, `warnings --missing`, `power --missing`, and `internet --missing`. A failed layer step logs `<step> failed; publish goes on`.
  5. Runs `publish` (adding `--with-internet` only when `PUBLISH_INTERNET=1`, per `docs/DECISIONS.md` row 14).
  6. Uploads changed state files (excluding `derived/odin/`) to `HAILPRINT_STATE_BUCKET`, uploads changed per-date files to `HAILPRINT_PUBLIC_BUCKET` before `storms.json` and `pipeline.json` with `Cache-Control: max-age=60`, and deletes stale remote public objects last.
- `hailprint cloud odin` (`trigger/odin.ts`, cron `0 * * * *` UTC on `small-1x`, queue concurrency 1):
  1. Downloads today's UTC ODIN file `derived/odin/odin-<YYYY-MM-DD>.parquet` when present.
  2. Runs `odin` to append the current 15-minute slot snapshot.
  3. Uploads only `derived/odin/odin-<YYYY-MM-DD>.parquet`. Because `nightly` never uploads `derived/odin/`, the two schedules never race.
- `hailprint cloud backfill` (`trigger/backfill.ts`, on-demand task on `medium-1x`, queue concurrency 1):
  1. Downloads state and public buckets.
  2. Runs `warnings --missing`, `eaglei` for any of `2021`, `2023`, `2025` not yet in `derived/eaglei/`, `power --missing`, `internet --missing`, and `publish`.
  3. Uploads changed state and public files.

## Environment variables

Configure these variables in the Trigger.dev environment (never commit values to the repository):

- `SUPABASE_S3_ENDPOINT`: Supabase Storage S3 endpoint URL.
- `SUPABASE_S3_REGION`: Supabase region string.
- `SUPABASE_S3_ACCESS_KEY_ID`: S3 access key ID (or `project_ref:email:password` for user-token exchange).
- `SUPABASE_S3_SECRET_ACCESS_KEY`: S3 secret access key (or the project `anon_key` when `SUPABASE_S3_ACCESS_KEY_ID` uses `project_ref:email:password`).
- `HAILPRINT_STATE_BUCKET`: private state bucket name (`hailprint-state`).
- `HAILPRINT_PUBLIC_BUCKET`: public-read bucket name (`hailprint-public`).
- `MAX_INGEST`: maximum missing candidate days per nightly run (default `5`).
- `PUBLISH_INTERNET`: set to `1` to pass `--with-internet` during publish.
- `HAILPRINT_ROOT`: optional working directory override for `data/`, `out/`, and `site/data/`.
