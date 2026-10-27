#!/usr/bin/env bash
# Extract the metro county basemap from the Protomaps daily build.
# Output: site/public/basemap.pmtiles. The site builds and runs without it.
# Override the build with PROTOMAPS_BUILD=YYYYMMDD.pmtiles.
set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$SITE_DIR/public/basemap.pmtiles"
TMP="$OUT.$$.tmp"
# hailprint.county.metro_bbox(): the 8 metro outlines padded by 0.05 degrees, the same as METRO_BBOX in site/src/county.ts.
BBOX="-96.242208,28.77556588,-94.303383,30.680284"
MAXZOOM=12
BUILDS_URL="https://build.protomaps.com"

fail() {
  echo "basemap: $1" >&2
  rm -f "$TMP"
  exit 1
}
trap 'rm -f "$TMP"' EXIT

command -v pmtiles >/dev/null 2>&1 || fail "the pmtiles CLI is not installed (https://github.com/protomaps/go-pmtiles)"
command -v curl >/dev/null 2>&1 || fail "curl is not installed"

BUILD="${PROTOMAPS_BUILD:-}"
if [ -z "$BUILD" ]; then
  BUILD="$(curl -fsS "$BUILDS_URL/builds.json" | grep -o '[0-9]\{8\}\.pmtiles' | sort | tail -n 1)" || fail "cannot list the builds at $BUILDS_URL/builds.json"
  [ -n "$BUILD" ] || fail "no build listed at $BUILDS_URL/builds.json"
fi

pmtiles extract "$BUILDS_URL/$BUILD" "$TMP" --bbox="$BBOX" --maxzoom="$MAXZOOM" || fail "the extract from $BUILD failed"
mv -f "$TMP" "$OUT"
trap - EXIT
echo "basemap: wrote $OUT from $BUILD ($(wc -c < "$OUT") bytes)"
