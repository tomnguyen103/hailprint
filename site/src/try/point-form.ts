// The point form's pure parts. No Preact import.
import { METRO_BBOX, contains } from "../county";

export const POINT_HINT =
  "Enter a latitude between 28.82 and 30.63 and a longitude between -96.30 and -94.35 (8-county Houston Metro).";

/** `[lon, lat]` for two finite numbers inside the 8-county Houston Metro bbox, else null. */
export function parsePoint(latText: string, lonText: string): [number, number] | null {
  const lat = latText.trim() === "" ? Number.NaN : Number(latText);
  const lon = lonText.trim() === "" ? Number.NaN : Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const point: [number, number] = [lon, lat];
  return contains(METRO_BBOX, point) ? point : null;
}
