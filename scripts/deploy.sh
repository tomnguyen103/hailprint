#!/usr/bin/env bash
# Deploy: build the site from a machine that holds site/data/ and upload it to Vercel.
# Usage: scripts/deploy.sh [--dry-run]
#   --dry-run   build site/dist with npm, verify the artifact, and stop before any vercel call.
# Live path: vercel pull, vercel build --prod, verify .vercel/output/static, vercel deploy --prebuilt.
# Preflight: site/data/storms.json must exist and site/data/publish.lock must be absent.
# Auth: VERCEL_TOKEN, or a `vercel login` session. On a host without a .vercel link folder,
# VERCEL_ORG_ID and VERCEL_PROJECT_ID select the project. The values live in <repo>/.env
# (gitignored) or in the vercel login session, never in the repo. The script prints no value.
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

# vc <args>: vercel with --token only when VERCEL_TOKEN is set
vc() {
  if [ -n "${VERCEL_TOKEN:-}" ]; then
    vercel "$@" --token "$VERCEL_TOKEN"
  else
    vercel "$@"
  fi
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

log "vercel pull"
vc pull --yes --environment=production
log "vercel build"
vc build --prod --yes
verify .vercel/output/static
log "vercel deploy"
vc deploy --prebuilt --prod --archive=tgz --yes
log "deploy done"
