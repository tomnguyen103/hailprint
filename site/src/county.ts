// Harris County bounds for the map. Pure: no MapLibre, no Preact.
import type { FeatureCollection, MultiPolygon } from "geojson";
import { fetchJson } from "./data/fetch";
import { guardOutline } from "./data/guard";

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

/** The pad the Python `county.bbox()` adds around the outline, in degrees. */
export const PAD_DEG = 0.05;

/** `uv run python -c "from hailprint.county import bbox; print(bbox())"`, already padded. */
export const HARRIS_BBOX: Bbox = [-96.010733, 29.44752, -94.858498, 30.220606];

export const COUNTY_FILE = "/county.geojson";

export function contains(bbox: Bbox, [lon, lat]: [number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/** The committed outline, copied verbatim from the Python package data. */
export function fetchCounty(): Promise<FeatureCollection<MultiPolygon>> {
  return fetchJson(COUNTY_FILE, guardOutline, "");
}
