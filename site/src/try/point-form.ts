// The point form's pure parts. No Preact import.
import { HARRIS_BBOX, contains } from "../county";

const two = (n: number) => n.toFixed(2);

export const POINT_HINT = `Enter a point inside Harris County: lat ${two(HARRIS_BBOX[1])} to ${two(HARRIS_BBOX[3])}, lon ${two(HARRIS_BBOX[0])} to ${two(HARRIS_BBOX[2])}.`;

/** `[lon, lat]` for two finite numbers inside the Harris bbox, else null. */
export function parsePoint(latText: string, lonText: string): [number, number] | null {
  const lat = latText.trim() === "" ? Number.NaN : Number(latText);
  const lon = lonText.trim() === "" ? Number.NaN : Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const point: [number, number] = [lon, lat];
  return contains(HARRIS_BBOX, point) ? point : null;
}