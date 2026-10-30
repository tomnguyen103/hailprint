#!/usr/bin/env bash
# Extract the metro county basemap from the Protomaps daily build.
# Output: site/public/basemap.pmtiles. The site builds and runs without it.
# Override the build with PROTOMAPS_BUILD=YYYYMMDD.pmtiles.
set -euo pipefail

# hailprint.county.metro_bbox(): the 8 metro outlines padded by 0.05 degrees, the same as METRO_BBOX in site/src/county.ts.
BBOX="-96.242208,28.77556588,-94.303383,30.680284"
export BBOX
exec uv run python "$(dirname "$0")/basemap.py" "$@"
