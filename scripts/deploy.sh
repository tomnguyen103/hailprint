#!/usr/bin/env bash
# Deploy: build the site from a machine that holds site/data/ and upload it to Vercel.
# Usage: scripts/deploy.sh [--dry-run]
#   --dry-run   build site/dist with npm, verify the artifact, and stop before any vercel call.
# Live path: vercel pull, vercel build --prod, verify .vercel/output/static, vercel deploy --prebuilt.
# Preflight: site/data/storms.json must exist and site/data/publish.lock must be absent. The
# live path also needs .vercel/project.json, or VERCEL_ORG_ID with VERCEL_PROJECT_ID.
# Auth: VERCEL_TOKEN in the environment, or a `vercel login` session. The live path reads
# <repo>/.env (gitignored) and exports the three Vercel names to vercel pull and vercel deploy.
# vercel build runs offline from .vercel/ and gets no VERCEL_TOKEN, so the npm install and the
# vite build never see it. The script prints no value.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  echo "usage: scripts/deploy.sh [--dry-run]" >&2
  exit 2
}

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy: $*"
}

# verify <dir>: the built artifact holds the page and the published index
verify() {
  for name in index.html data/storms.json; do
    if [ ! -f "$1/$name" ]; then
      echo "deploy: $1/$name is missing after the build" >&2
      exit 1
    fi
  done
}

[ "$#" -le 1 ] || usage
DRY_RUN=0
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=1 ;;
  *) usage ;;
esac

cd "$ROOT"
if [ ! -f site/data/storms.json ]; then
  echo "deploy: site/data/storms.json is missing; run uv run hailprint publish first" >&2
  exit 1
fi
if [ -e site/data/publish.lock ]; then
  echo "deploy: site/data/publish.lock is present; a publish is running" >&2
  exit 1
fi

if [ "$DRY_RUN" = 1 ]; then
  log "npm ci"
  (cd site && npm ci)
  log "npm run build"
  (cd site && npm run build)
  verify site/dist
  log "dry run done: site/dist verified, no vercel call"
  exit 0
fi

if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi
# an unset name stays out of the environment
export VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID
if [ ! -f .vercel/project.json ] && { [ -z "${VERCEL_ORG_ID:-}" ] || [ -z "${VERCEL_PROJECT_ID:-}" ]; }; then
  echo "deploy: no .vercel/project.json and no VERCEL_ORG_ID with VERCEL_PROJECT_ID; run vercel link once, or set both names in .env" >&2
  exit 1
fi

log "vercel pull"
vercel pull --yes --environment=production
log "vercel build"
env -u VERCEL_TOKEN vercel build --prod --yes
verify .vercel/output/static
log "vercel deploy"
vercel deploy --prebuilt --prod --archive=tgz --yes
log "deploy done"
