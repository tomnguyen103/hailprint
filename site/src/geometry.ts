// Pure point-in-polygon and WGS84 ellipsoidal tangent-plane distance math. No MapLibre import.
import type { MultiPolygon, Polygon, Position } from "geojson";

export const WGS84_A = 6378137.0;
export const WGS84_E2 = 0.0066943799901413165;
export const UTM15N_K0 = 0.99969;
export const CROP_EDGE_M = 1000;

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export type CropStatus = "inside" | "near-edge" | "outside-crop";

/** `uv run python -c "from hailprint.county import bbox; print(bbox())"`, already padded. */
export const HARRIS_BBOX: Bbox = [-96.010733, 29.44752, -94.858498, 30.220606];

export function contains(bbox: Bbox, [lon, lat]: [number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/** Even-odd ray cast over one ring with the half-open edge test, so a vertex gives one fixed answer. */
function inRing(ring: Position[], [x, y]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: Position[][], point: [number, number]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(outer, point)) return false;
  return !holes.some((hole) => inRing(hole, point));
}

/** True when the point lies inside the ring. */
export function pointInRing(point: [number, number], ring: Position[]): boolean {
  return inRing(ring, point);
}

/** True when the point lies inside the outer ring and inside no hole of any polygon in a MultiPolygon. */
export function pointInMultiPolygon(point: [number, number], geometry: MultiPolygon): boolean {
  return geometry.coordinates.some((rings) => inPolygon(rings, point));
}

/** True when the point lies inside the outer ring and inside no hole of any polygon. */
export function containsPoint(geometry: Polygon | MultiPolygon, point: [number, number]): boolean {
  if (geometry.type === "Polygon") return inPolygon(geometry.coordinates, point);
  return geometry.coordinates.some((rings) => inPolygon(rings, point));
}

/** Metres per degree of `[longitude, latitude]` at `latDeg` on the WGS84 ellipsoid scaled by UTM 15N (`k0 = 0.99969`). */
export function metersPerDegree(latDeg: number): [number, number] {
  const rad = (latDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const denom = 1 - WGS84_E2 * sin * sin;
  const n = WGS84_A / Math.sqrt(denom);
  const m = (WGS84_A * (1 - WGS84_E2)) / Math.pow(denom, 1.5);
  return [(Math.PI / 180) * n * cos * UTM15N_K0, (Math.PI / 180) * m * UTM15N_K0];
}

/** WGS84 ellipsoidal tangent-plane distance in metres between two `[lon, lat]` points. */
export function distanceM(a: [number, number], b: [number, number]): number {
  const [mx, my] = metersPerDegree((a[1] + b[1]) / 2);
  return Math.hypot((b[0] - a[0]) * mx, (b[1] - a[1]) * my);
}

/** Minimum distance in metres from `p` to segment `a -> b` on the tangent plane at `p[1]`. */
export function pointToSegmentDistanceM(p: [number, number], a: Position, b: Position): number {
  const [mx, my] = metersPerDegree(p[1]);
  const ax = ((a[0] ?? 0) - p[0]) * mx;
  const ay = ((a[1] ?? 0) - p[1]) * my;
  const bx = ((b[0] ?? 0) - p[0]) * mx;
  const by = ((b[1] ?? 0) - p[1]) * my;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Minimum distance in metres from `p` to a polygon ring boundary. */
export function pointToRingDistanceM(p: [number, number], ring: Position[]): number {
  if (ring.length === 0) return Number.POSITIVE_INFINITY;
  if (ring.length === 1) return pointToSegmentDistanceM(p, ring[0]!, ring[0]!);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = pointToSegmentDistanceM(p, ring[i]!, ring[i + 1]!);
    if (d < min) min = d;
  }
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    const closeD = pointToSegmentDistanceM(p, last, first);
    if (closeD < min) min = closeD;
  }
  return min;
}

/**
 * Minimum distance in metres from `p` to a MultiPolygon: `0` when inside, positive distance to the
 * nearest exterior or interior hole ring when outside or inside a hole, or `null` when empty.
 */
export function pointToMultiPolygonDistanceM(p: [number, number], geometry: MultiPolygon): number | null {
  let hasRing = false;
  for (const poly of geometry.coordinates) {
    for (const ring of poly) {
      if (ring.length > 0) hasRing = true;
    }
  }
  if (!hasRing) return null;
  if (pointInMultiPolygon(p, geometry)) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const poly of geometry.coordinates) {
    for (const ring of poly) {
      const d = pointToRingDistanceM(p, ring);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : null;
}

/** Signed distance in metres to `HARRIS_BBOX`: positive inside, negative outside. */
export function cropEdgeDistanceM([lon, lat]: [number, number]): number {
  const [minLon, minLat, maxLon, maxLat] = HARRIS_BBOX;
  const [mx, my] = metersPerDegree(lat);
  if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
    return Math.min((lon - minLon) * mx, (maxLon - lon) * mx, (lat - minLat) * my, (maxLat - lat) * my);
  }
  const dx = (lon < minLon ? minLon - lon : lon > maxLon ? lon - maxLon : 0) * mx;
  const dy = (lat < minLat ? minLat - lat : lat > maxLat ? lat - maxLat : 0) * my;
  return -Math.hypot(dx, dy);
}

/** MESH radar crop status for a point at `radiusKm`. */
export function cropStatusAt(point: [number, number], radiusKm: number): CropStatus {
  const edgeM = cropEdgeDistanceM(point);
  if (edgeM < 0) return "outside-crop";
  if (edgeM <= radiusKm * 1000 + CROP_EDGE_M) return "near-edge";
  return "inside";
}
