// Metro county bounds and outlines for the map. Pure: no MapLibre, no Preact.
import type { FeatureCollection, MultiPolygon } from "geojson";
import { HARRIS_FIPS } from "./data/constants";
import { fetchJson } from "./data/fetch";
import { guardOutline } from "./data/guard";

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

/** The pad the Python `county.bbox()` adds around the outline, in degrees. */
export const PAD_DEG = 0.05;

/** `uv run python -c "from hailprint.county import bbox; print(bbox())"`, already padded. */
export const HARRIS_BBOX: Bbox = [-96.010733, 29.44752, -94.858498, 30.220606];

/** `uv run python -c "from hailprint.county import metro_bbox; print(metro_bbox())"`, already padded. */
export const METRO_BBOX: Bbox = [-96.242208, 28.77556588, -94.303383, 30.680284];

export const COUNTIES_FILE = "/counties.geojson";

export function contains(bbox: Bbox, [lon, lat]: [number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

let counties: Promise<FeatureCollection<MultiPolygon>> | null = null;

/** The 8 metro outlines, copied verbatim from the Python package data. One request per page load. */
export function fetchCounties(): Promise<FeatureCollection<MultiPolygon>> {
  if (counties) return counties;
  const request = fetchJson(COUNTIES_FILE, guardOutline, "");
  counties = request;
  // A failed request leaves the cache only while it still holds this promise; the caller still sees the error.
  request.catch(() => {
    if (counties === request) counties = null;
  });
  return request;
}

/** Clears the cached request, for tests. */
export function resetCounties(): void {
  counties = null;
}

/** The Harris feature alone, so the single-outline map views stay unchanged. */
export async function fetchCounty(): Promise<FeatureCollection<MultiPolygon>> {
  const all = await fetchCounties();
  return { ...all, features: all.features.filter((f) => f.properties?.["fips"] === HARRIS_FIPS) };
}
