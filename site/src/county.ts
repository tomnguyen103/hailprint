// Harris County bounds for the map. Pure: no MapLibre, no Preact.
import type { FeatureCollection, MultiPolygon } from "geojson";
import { DataError } from "./data/types";

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
export async function fetchCounty(): Promise<FeatureCollection<MultiPolygon>> {
  let response: Response;
  try {
    response = await fetch(COUNTY_FILE);
  } catch (error) {
    throw new DataError(COUNTY_FILE, error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new DataError(COUNTY_FILE, `HTTP ${response.status}`);
  const body: unknown = await response.json().catch(() => {
    throw new DataError(COUNTY_FILE, "body is not JSON");
  });
  if (typeof body !== "object" || body === null || (body as { type?: unknown }).type !== "FeatureCollection") {
    throw new DataError(COUNTY_FILE, "type is not FeatureCollection");
  }
  return body as FeatureCollection<MultiPolygon>;
}