#!/usr/bin/env bash
# Nightly run: index, missing candidate days, ingest, parcels, score, warnings, power, internet, publish, deploy.
# Usage: scripts/nightly.sh [--dry-run]
#   --dry-run   passes through to scripts/deploy.sh: build site/dist and stop before vercel.
# MAX_INGEST (default 5) caps the storm dates that one night ingests.
# Lock: data/nightly.lock, a directory. A second run finds it and exits 1. The trap removes it
# on exit, after success and after a failed step.
# .env at the repo root is read when present, without export. It is shell: one NAME=value per
# line, the value from letters, digits, and _ . / : @ + -, no export prefix, no space, no quote,
# LF line endings; a comment and a blank line pass; any other line stops the run. It holds
# MAX_INGEST, PUBLISH_INTERNET, and the Vercel variables VERCEL_TOKEN, VERCEL_ORG_ID,
# VERCEL_PROJECT_ID; scripts/deploy.sh reads those itself. PUBLISH_INTERNET=1 adds
# --with-internet to the publish step; any other value leaves the internet layer unpublished.
# The script prints no value.
set -euo pipefail

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
  # .env is shell, so a line outside NAME=value would run as a command and could print a value;
  # the refusal names the line number only; grep on Windows drops the CR, so tr counts it
  if [ "$(tr -cd '\r' < .env | wc -c)" -gt 0 ]; then
    echo "nightly: .env has CRLF line endings; write it with LF" >&2
    exit 1
  fi
  # the value charset covers a count, a Vercel token, and the two ids; a shell metacharacter stays out
  bad="$(grep -nEv '^(#|$|[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_./:@+-]*$)' .env | cut -d: -f1 | head -n 1 || true)"
  if [ -n "$bad" ]; then
    echo "nightly: .env line $bad is not NAME=value (no export, no space, no quote, no shell character)" >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  . ./.env
fi
MAX_INGEST="${MAX_INGEST:-5}"
case "$MAX_INGEST" in
  '' | *[!0-9]* | 0)
    # the value stays out of the message: a shifted .env line can put a token here
    echo "nightly: MAX_INGEST must be a whole number from 1" >&2
    exit 1
    ;;
esac

mkdir -p data
# shortcut: the lock holds no pid and no age, so a reboot mid-run leaves it in place;
# upgrade to flock when the cron host has it
if ! mkdir data/nightly.lock 2>/dev/null; then
  echo "nightly: mkdir data/nightly.lock failed: another run holds it, or data/ is not writable" >&2
  echo "nightly: when no run is live, remove it with: rmdir data/nightly.lock" >&2
  exit 1
fi
trap 'rmdir "$ROOT/data/nightly.lock"' EXIT

log "index"
uv run hailprint index
log "candidates --missing --top $MAX_INGEST"
# tr drops the CR of a Windows host; pipefail keeps the exit code of candidates
MISSING="$(uv run hailprint candidates --missing --top "$MAX_INGEST" | tr -d '\r')"
if [ -n "$MISSING" ]; then
  HAS_GDB=0
  if [ -d data/raw/hcad/extracted/Parcels.gdb ]; then
    HAS_GDB=1
  else
    log "parcels skipped: no HCAD gdb"
  fi
  # one storm date per word, so MISSING stays unquoted on purpose
  # shellcheck disable=SC2086
  for storm_date in $MISSING; do
    log "ingest $storm_date"
    # a bad 12Z file fails one storm date; the night goes on to score and publish
    # shortcut: the failed day stays a missing candidate day and takes one MAX_INGEST slot
    # every night, upgrade to a skip list when one day fails three nights in a row
    if ! uv run hailprint ingest "$storm_date"; then
      log "ingest $storm_date failed; skipped"
      continue
    fi
    if [ "$HAS_GDB" = 1 ]; then
      log "parcels $storm_date"
      # the swath file exists now, so the day leaves --missing; the rerun is by hand
      uv run hailprint parcels "$storm_date" ||
        log "parcels $storm_date failed; rerun by hand: uv run hailprint parcels $storm_date"
    fi
  done
else
  log "no missing candidate day"
fi
log "score"
uv run hailprint score
log "warnings --missing"
# the warnings are an add-on layer, so a feed failure never blocks the hail publish; the next night retries
uv run hailprint warnings --missing || log "warnings failed; publish goes on"
log "power --missing"
# power is an add-on layer too: a failed step leaves the hail publish alone; the next night retries
uv run hailprint power --missing || log "power failed; publish goes on"
log "internet --missing"
# the fetch is derived data only; a failed step leaves the hail publish alone and the next night retries
uv run hailprint internet --missing || log "internet failed; publish goes on"
log "publish"
# docs/DECISIONS.md row 14: internet.json publishes only when .env sets PUBLISH_INTERNET=1,
# remove the gate when IODA answers in writing
if [ "${PUBLISH_INTERNET:-}" = 1 ]; then
  uv run hailprint publish --with-internet
else
  uv run hailprint publish
fi
log "deploy ${1:-}"
"$ROOT/scripts/deploy.sh" ${1:+"$1"}
log "done"
