// Pure geometry for the map inspector. No MapLibre import.
import type { Feature, FeatureCollection, Point, Position } from "geojson";
import type { Bbox } from "../../county";
import type { SwathFile, SwathProps } from "../../data/types";
import { containsPoint } from "../../geometry";

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const dLat = ((b[1] ?? 0) - (a[1] ?? 0)) * rad;
  const dLon = ((b[0] ?? 0) - (a[0] ?? 0)) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] ?? 0) * rad) * Math.cos((b[1] ?? 0) * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The closest point feature and its distance in km, or null with no features. */
export function nearestReport<P>(
  point: Position,
  features: readonly Feature<Point, P>[],
): { feature: Feature<Point, P>; km: number } | null {
  let best: { feature: Feature<Point, P>; km: number } | null = null;
  for (const feature of features) {
    const km = haversineKm(point, feature.geometry.coordinates);
    if (best === null || km < best.km) best = { feature, km };
  }
  return best;
}

/** The highest size class among the swath features under a point, or null for none. */
export function coveringClass(features: readonly { properties: { threshold_mm: number } }[]): number | null {
  let max: number | null = null;
  for (const f of features) {
    if (max === null || f.properties.threshold_mm > max) max = f.properties.threshold_mm;
  }
  return max;
}

/** The properties of the largest size class whose feature holds the point, or null outside the swath. */
export function coveringAt(swath: SwathFile, point: [number, number]): SwathProps | null {
  let best: SwathProps | null = null;
  for (const feature of swath.features) {
    if (best !== null && feature.properties.threshold_mm <= best.threshold_mm) continue;
    if (containsPoint(feature.geometry, point)) best = feature.properties;
  }
  return best;
}

/** The bounds of every coordinate in the collection, or null when it holds none. */
export function boundsOf(collection: FeatureCollection): Bbox | null {
  let box: Bbox | null = null;
  const visit = (position: Position) => {
    const [lon, lat] = position as [number, number];
    box =
      box === null
        ? [lon, lat, lon, lat]
        : [Math.min(box[0], lon), Math.min(box[1], lat), Math.max(box[2], lon), Math.max(box[3], lat)];
  };
  const walk = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number") visit(coordinates as Position);
    else coordinates.forEach(walk);
  };
  for (const feature of collection.features) {
    if (feature.geometry && "coordinates" in feature.geometry) walk(feature.geometry.coordinates);
  }
  return box;
}