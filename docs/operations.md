# Operations

This guide covers the nightly run, the cron entry, the deploy, and the `.env` file on the cron host.

## Nightly run

`scripts/nightly.sh` (`make nightly`) runs these steps in this order:

1. `index` refreshes the archive index.
2. `candidates --missing --top $MAX_INGEST` prints the missing candidate days.
3. `ingest` draws a swath file for each missing candidate day.
4. `parcels` counts parcels for each of them when the HCAD gdb is present.
5. `score` and `publish` write the scores and `site/data/`.
6. `scripts/deploy.sh` uploads the site.

The lock is the directory `data/nightly.lock`. A second run finds it and exits 1. A trap removes the lock on exit.

`MAX_INGEST` caps the storm dates per night. The default is 5.

## Cron entry

`scripts/hailprint.cron` holds the cron entry. It starts the nightly run at 14:00 UTC and appends the output to `data/nightly.log`.

1. Edit the repo path in the entry.
2. Edit the home path in the `PATH` line.
3. Run `crontab scripts/hailprint.cron`.

## Deploy

Git deployments are off for `main` in `vercel.json`. A merge thus never replaces production with a data-free build. PR branches keep their previews.

The cron host holds `site/data/` and deploys with the prebuilt flow in `scripts/deploy.sh`:

1. `vercel pull`
2. `vercel build --prod`
3. `vercel deploy --prebuilt --prod --archive=tgz`

`scripts/deploy.sh --dry-run` (`make deploy-dry`) builds `site/dist` and stops before any `vercel` call.

The auth comes from `VERCEL_TOKEN` or from a `vercel login` session. A host without a link folder also needs `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

## The `.env` file

The values live in `.env` at the repo root. The file is gitignored and never enters the repo.

The format rules:

- One `NAME=value` per line.
- The value uses letters, digits, and `_ . / : @ + -` only.
- No `export` keyword and no quote.
- LF line endings.
- A comment line and a blank line pass.

Both scripts refuse any other line before the first step. The refusal prints the line number only, never the value.
