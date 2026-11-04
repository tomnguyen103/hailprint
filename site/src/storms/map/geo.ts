// Pure geometry for the map inspector and point proximity analyzer. No MapLibre import.
import type { Feature, FeatureCollection, MultiPolygon, Point, Position } from "geojson";
import type { Bbox } from "../../county";
import { STEPS } from "../../data/constants";
import {
  PHENOMENA,
  type Phenomena,
  type ReportProps,
  type ReportsFile,
  type SwathFile,
  type SwathProps,
  type WarningProps,
  type WarningsFile,
} from "../../data/types";
import { containsPoint, distanceM, pointInMultiPolygon, pointToMultiPolygonDistanceM } from "../../geometry";
import { countyAt } from "../../state/county";
import { LAST_STEP, STEP_MS, stepTime } from "../../time/step";

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
    const km = distanceKm(point, feature.geometry.coordinates);
    if (best === null || km < best.km) best = { feature, km };
  }
  return best;
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

export interface PickedPoint {
  date: string;
  lngLat: [number, number];
  coveringMm: number | null;
  nearest: { feature: Feature<Point, ReportProps>; km: number } | null;
  nearestSwath?: SwathDistance | null;
  countyFips?: string | null;
}

/** Build a picked-point record from swath geometry, reports, and county outlines, independent of rendered layers. */
export function buildPick(
  date: string,
  lngLat: [number, number],
  swath: SwathFile | null,
  reports: ReportsFile | null,
  outlines: FeatureCollection<MultiPolygon> | null,
): PickedPoint {
  const exp = swath !== null ? swathExposureAt(swath, lngLat, 20) : null;
  const coveringMm = exp !== null ? (exp.covering?.threshold_mm ?? null) : null;
  const nearestSwath = exp !== null ? (exp.covering ? null : exp.nearest) : null;
  return {
    date,
    lngLat,
    coveringMm,
    nearest: nearestReport(lngLat, reports?.features ?? []),
    nearestSwath,
    countyFips: outlines !== null ? countyAt(lngLat, outlines) : undefined,
  };
}

/** Refresh an existing pick for `stormDate` when swath, reports, or county outlines finish loading. */
export function refreshPick(
  prev: PickedPoint | null,
  stormDate: string,
  swath: SwathFile | null,
  reports: ReportsFile | null,
  outlines: FeatureCollection<MultiPolygon> | null,
): PickedPoint | null {
  if (prev === null || prev.date !== stormDate) return prev;
  const exp = swath !== null ? swathExposureAt(swath, prev.lngLat, 20) : null;
  const coveringMm = exp !== null ? (exp.covering?.threshold_mm ?? null) : prev.coveringMm;
  const nearestSwath = exp !== null ? (exp.covering ? null : exp.nearest) : prev.nearestSwath;
  const countyFips = outlines !== null ? countyAt(prev.lngLat, outlines) : prev.countyFips;
  return {
    ...prev,
    coveringMm,
    nearest: nearestReport(prev.lngLat, reports?.features ?? []),
    nearestSwath,
    countyFips,
  };
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
  const features = reports === null ? [] : "features" in reports ? reports.features : reports;
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
  within.sort(
    (a, b) =>
      a.distanceM - b.distanceM ||
      b.feature.properties.size_in - a.feature.properties.size_in ||
      a.feature.properties.id - b.feature.properties.id,
  );
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

export interface NearbyWarning extends DirectWarning {
  distanceKm: number;
}

export interface WarningsAtPoint {
  directWarnings: DirectWarning[];
  nearbyWarnings: NearbyWarning[];
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
  return null;
}

/** Merge a warning polygon hit into the keyed map, keeping earliest begin, latest end, and minimum distance. */
function mergeDirectWarning(prev: DirectWarning | undefined, p: WarningProps, step: number | null): DirectWarning {
  if (prev === undefined) {
    return {
      phenomena: p.phenomena,
      eventid: p.eventid,
      event_label: p.event_label,
      polygon_begin: p.polygon_begin,
      polygon_end: p.polygon_end,
      product_id: p.product_id,
      firstStep: step,
    };
  }
  const earlierBegin = Date.parse(p.polygon_begin) < Date.parse(prev.polygon_begin);
  const laterEnd = Date.parse(p.polygon_end) > Date.parse(prev.polygon_end);
  return {
    ...prev,
    polygon_begin: earlierBegin ? p.polygon_begin : prev.polygon_begin,
    polygon_end: laterEnd ? p.polygon_end : prev.polygon_end,
    product_id: earlierBegin ? p.product_id : prev.product_id,
    firstStep: prev.firstStep === null ? step : step === null ? prev.firstStep : Math.min(prev.firstStep, step),
  };
}

/** NWS storm-based warning polygons covering `point` (plus nearby warnings within `radiusKm`), deduplicated by `(phenomena, eventid)`. */
export function warningsAtPoint(
  point: [number, number],
  file: WarningsFile | null,
  stormDate?: string,
  radiusKm = 0,
): WarningsAtPoint {
  const warningCounts: Record<Phenomena, number> = { SV: 0, TO: 0, FF: 0 };
  if (file === null) {
    return { directWarnings: [], nearbyWarnings: [], warningCounts, firstWarningStep: null };
  }
  const date = stormDate ?? file.receipt.storm_date;
  const radiusM = radiusKm * 1000;
  const byKey = new Map<string, DirectWarning>();
  const byNearbyKey = new Map<string, NearbyWarning>();
  let firstWarningStep: number | null = null;

  for (const feature of file.features) {
    const p = feature.properties;
    const step = warningFirstStep(date, p.polygon_begin, p.polygon_end);
    const key = `${p.phenomena}-${p.eventid}`;
    if (pointInMultiPolygon(point, feature.geometry)) {
      if (step !== null && (firstWarningStep === null || step < firstWarningStep)) {
        firstWarningStep = step;
      }
      byKey.set(key, mergeDirectWarning(byKey.get(key), p, step));
      continue;
    }

    if (radiusM > 0) {
      const dM = pointToMultiPolygonDistanceM(point, feature.geometry);
      if (dM !== null && dM > 0 && dM <= radiusM) {
        const distanceKm = dM / 1000;
        const prev = byNearbyKey.get(key);
        byNearbyKey.set(key, {
          ...mergeDirectWarning(prev, p, step),
          distanceKm: prev === undefined ? distanceKm : Math.min(prev.distanceKm, distanceKm),
        });
      }
    }
  }

  for (const key of byKey.keys()) {
    byNearbyKey.delete(key);
  }

  const directWarnings = [...byKey.values()].sort(
    (a, b) =>
      Date.parse(a.polygon_begin) - Date.parse(b.polygon_begin) ||
      PHENOMENA.indexOf(a.phenomena) - PHENOMENA.indexOf(b.phenomena) ||
      a.eventid - b.eventid,
  );
  const nearbyWarnings = [...byNearbyKey.values()].sort(
    (a, b) =>
      a.distanceKm - b.distanceKm ||
      Date.parse(a.polygon_begin) - Date.parse(b.polygon_begin) ||
      PHENOMENA.indexOf(a.phenomena) - PHENOMENA.indexOf(b.phenomena) ||
      a.eventid - b.eventid,
  );
  for (const w of directWarnings) {
    warningCounts[w.phenomena] += 1;
  }
  return { directWarnings, nearbyWarnings, warningCounts, firstWarningStep };
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
