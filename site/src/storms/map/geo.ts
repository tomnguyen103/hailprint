// Pure geometry for the map inspector and point proximity analyzer. No MapLibre import.
import type { Feature, FeatureCollection, Point, Position } from "geojson";
import type { Bbox } from "../../county";
import { STEPS } from "../../data/constants";
import {
  PHENOMENA,
  type Phenomena,
  type ReportProps,
  type ReportsFile,
  type SwathFile,
  type SwathProps,
  type WarningsFile,
} from "../../data/types";
import { containsPoint, distanceM, pointInMultiPolygon, pointToMultiPolygonDistanceM } from "../../geometry";
import { LAST_STEP, STEP_MS, stepTime } from "../../time/step";

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

/** Ellipsoidal tangent-plane distance in kilometres between two coordinates. */
export function distanceKm(a: Position, b: Position): number {
  return distanceM([a[0] ?? 0, a[1] ?? 0], [b[0] ?? 0, b[1] ?? 0]) / 1000;
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

export interface SwathDistance {
  props: SwathProps;
  threshold_mm: number;
  threshold_in: number;
  label: string;
  distanceM: number;
  distanceKm: number;
}

export interface SwathExposure {
  covering: SwathDistance | null;
  withinRadius: SwathDistance | null;
  nearest: SwathDistance | null;
  classes: SwathDistance[];
}

/** Swath exposure at `point` for a given `radiusKm`: covering (`0 km`), highest within `radiusKm`, and nearest class. */
export function swathExposureAt(
  swath: SwathFile | null,
  point: [number, number],
  radiusKm: number,
): SwathExposure {
  if (swath === null) {
    return { covering: null, withinRadius: null, nearest: null, classes: [] };
  }
  const radiusM = radiusKm * 1000;
  const classes: SwathDistance[] = [];
  for (const feature of swath.features) {
    const dM = pointToMultiPolygonDistanceM(point, feature.geometry);
    if (dM === null) continue;
    classes.push({
      props: feature.properties,
      threshold_mm: feature.properties.threshold_mm,
      threshold_in: feature.properties.threshold_in,
      label: feature.properties.label,
      distanceM: dM,
      distanceKm: dM / 1000,
    });
  }
  classes.sort((a, b) => a.threshold_mm - b.threshold_mm);
  let covering: SwathDistance | null = null;
  let withinRadius: SwathDistance | null = null;
  let nearest: SwathDistance | null = null;
  for (const entry of classes) {
    if (entry.distanceM === 0 && (covering === null || entry.threshold_mm > covering.threshold_mm)) {
      covering = entry;
    }
    if (entry.distanceM <= radiusM && (withinRadius === null || entry.threshold_mm > withinRadius.threshold_mm)) {
      withinRadius = entry;
    }
    if (
      nearest === null ||
      entry.distanceM < nearest.distanceM ||
      (entry.distanceM === nearest.distanceM && entry.threshold_mm > nearest.threshold_mm)
    ) {
      nearest = entry;
    }
  }
  return { covering, withinRadius, nearest, classes };
}

export interface ReportHit {
  feature: Feature<Point, ReportProps>;
  km: number;
  distanceM: number;
}

export interface ReportsProximity {
  count: number;
  maxSizeIn: number | null;
  nearest: ReportHit | null;
  within: ReportHit[];
}

/** SPC hail reports within `radiusKm` of `point`, plus the closest report overall. */
export function reportsWithinRadius(
  point: [number, number],
  reports: ReportsFile | readonly Feature<Point, ReportProps>[] | null,
  radiusKm: number,
): ReportsProximity {
  const features = reports === null ? [] : Array.isArray(reports) ? reports : reports.features;
  const radiusM = radiusKm * 1000;
  const within: ReportHit[] = [];
  let nearest: ReportHit | null = null;
  for (const feature of features) {
    const coords = feature.geometry.coordinates;
    const dM = distanceM(point, [coords[0] ?? 0, coords[1] ?? 0]);
    const hit: ReportHit = { feature, km: dM / 1000, distanceM: dM };
    if (nearest === null || dM < nearest.distanceM) nearest = hit;
    if (dM <= radiusM) within.push(hit);
  }
  within.sort((a, b) => a.distanceM - b.distanceM || a.feature.properties.id - b.feature.properties.id);
  let maxSizeIn: number | null = null;
  for (const hit of within) {
    if (maxSizeIn === null || hit.feature.properties.size_in > maxSizeIn) {
      maxSizeIn = hit.feature.properties.size_in;
    }
  }
  return { count: within.length, maxSizeIn, nearest, within };
}

export interface DirectWarning {
  phenomena: Phenomena;
  eventid: number;
  event_label: string;
  polygon_begin: string;
  polygon_end: string;
  product_id: string;
  firstStep: number | null;
}

export interface WarningsAtPoint {
  directWarnings: DirectWarning[];
  warningCounts: Record<Phenomena, number>;
  firstWarningStep: number | null;
}

function warningFirstStep(date: string, beginIso: string, endIso: string): number | null {
  const origin = stepTime(date, 0).getTime();
  const beginMs = Date.parse(beginIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(beginMs) || !Number.isFinite(endMs) || endMs <= origin) return null;
  const windowEnd = origin + STEPS * STEP_MS;
  if (beginMs >= windowEnd) return null;
  for (let s = 0; s <= LAST_STEP; s++) {
    const at = origin + s * STEP_MS;
    if (beginMs <= at && at < endMs) return s;
  }
  return Math.max(0, Math.min(LAST_STEP, Math.floor((beginMs - origin) / STEP_MS)));
}

/** NWS storm-based warning polygons covering `point`, deduplicated by `(phenomena, eventid)`. */
export function warningsAtPoint(
  point: [number, number],
  file: WarningsFile | null,
  stormDate?: string,
): WarningsAtPoint {
  const warningCounts: Record<Phenomena, number> = { SV: 0, TO: 0, FF: 0 };
  if (file === null) {
    return { directWarnings: [], warningCounts, firstWarningStep: null };
  }
  const date = stormDate ?? file.receipt.storm_date;
  const byKey = new Map<string, DirectWarning>();
  let firstWarningStep: number | null = null;

  for (const feature of file.features) {
    if (!pointInMultiPolygon(point, feature.geometry)) continue;
    const p = feature.properties;
    const step = warningFirstStep(date, p.polygon_begin, p.polygon_end);
    if (step !== null && (firstWarningStep === null || step < firstWarningStep)) {
      firstWarningStep = step;
    }
    const key = `${p.phenomena}-${p.eventid}`;
    const prev = byKey.get(key);
    if (prev === undefined) {
      byKey.set(key, {
        phenomena: p.phenomena,
        eventid: p.eventid,
        event_label: p.event_label,
        polygon_begin: p.polygon_begin,
        polygon_end: p.polygon_end,
        product_id: p.product_id,
        firstStep: step,
      });
    } else {
      const earlierBegin = Date.parse(p.polygon_begin) < Date.parse(prev.polygon_begin);
      const laterEnd = Date.parse(p.polygon_end) > Date.parse(prev.polygon_end);
      byKey.set(key, {
        ...prev,
        polygon_begin: earlierBegin ? p.polygon_begin : prev.polygon_begin,
        polygon_end: laterEnd ? p.polygon_end : prev.polygon_end,
        product_id: earlierBegin ? p.product_id : prev.product_id,
        firstStep:
          step !== null && (prev.firstStep === null || step < prev.firstStep) ? step : prev.firstStep,
      });
    }
  }

  const directWarnings = [...byKey.values()].sort(
    (a, b) =>
      Date.parse(a.polygon_begin) - Date.parse(b.polygon_begin) ||
      PHENOMENA.indexOf(a.phenomena) - PHENOMENA.indexOf(b.phenomena) ||
      a.eventid - b.eventid,
  );
  for (const w of directWarnings) {
    warningCounts[w.phenomena] += 1;
  }
  return { directWarnings, warningCounts, firstWarningStep };
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
