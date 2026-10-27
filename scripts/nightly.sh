#!/usr/bin/env bash
# Nightly run: index, missing candidate days, ingest, parcels, score, publish, deploy.
# Usage: scripts/nightly.sh [--dry-run]
#   --dry-run   passes through to scripts/deploy.sh: build site/dist and stop before vercel.
# MAX_INGEST (default 5) caps the storm dates that one night ingests.
# Lock: data/nightly.lock, a directory. A second run finds it and exits 1. The trap removes it
# on exit, after success and after a failed step.
# .env at the repo root is sourced and exported when present. It holds MAX_INGEST and the
# Vercel variables VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID. The script prints no value.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  echo "usage: scripts/nightly.sh [--dry-run]" >&2
  exit 2
}

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) nightly: $*"
}

[ "$#" -le 1 ] || usage
case "${1:-}" in
  "" | --dry-run) ;;
  *) usage ;;
esac

cd "$ROOT"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
MAX_INGEST="${MAX_INGEST:-5}"

mkdir -p data
if ! mkdir data/nightly.lock 2>/dev/null; then
  echo "nightly: data/nightly.lock is present; another run holds it" >&2
  exit 1
fi
trap 'rmdir "$ROOT/data/nightly.lock"' EXIT

log "index"
uv run hailprint index
log "candidates --missing --top $MAX_INGEST"
MISSING="$(uv run hailprint candidates --missing --top "$MAX_INGEST")"
if [ -n "$MISSING" ]; then
  # one storm date per word, so MISSING stays unquoted on purpose
  # shellcheck disable=SC2086
  log ingest $MISSING
  # shellcheck disable=SC2086
  uv run hailprint ingest $MISSING
  if [ -d data/raw/hcad/extracted/Parcels.gdb ]; then
    for storm_date in $MISSING; do
      log "parcels $storm_date"
      uv run hailprint parcels "$storm_date"
    done
  else
    log "parcels skipped: no HCAD gdb"
  fi
else
  log "no missing candidate day"
fi
log "score"
uv run hailprint score
log "publish"
uv run hailprint publish
log "deploy ${1:-}"
"$ROOT/scripts/deploy.sh" ${1:+"$1"}
log "done"
