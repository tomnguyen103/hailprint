// Port of hailprint.publish.rescore and hailprint.score.skill. The radius rule runs at
// read time so the site and the Python scorer agree at every whole km.
import type { Metric, Pairs, ReportsFile, TableRow } from "./data/types";
import { DataError } from "./data/types";
import { RULER } from "./ruler";

export interface Skill {
  pod: Metric;
  far: Metric;
  csi: Metric;
  hss: Metric;
}

function ratio(num: number, den: number): Metric {
  return den === 0 ? null : num / den;
}

/** POD, FAR, CSI, and HSS from the four counts. A zero denominator gives null. */
export function skill(hits: number, misses: number, falseAlarms: number, correctNegatives: number): Skill {
  const a = hits;
  const c = misses;
  const b = falseAlarms;
  const d = correctNegatives;
  return {
    pod: ratio(a, a + c),
    far: ratio(b, a + b),
    csi: ratio(a, a + b + c),
    hss: ratio(2 * (a * d - b * c), (a + c) * (c + d) + (a + b) * (b + d)),
  };
}

/** Whole hundredths of an inch, as publish._inches compares sizes. */
function hundredths(inches: number): number {
  return Math.round(inches * 100);
}

/** The contingency table at a whole-km radius, one row per size class in RULER order. */
export function rescore(pairs: Pairs, radiusKm: number): TableRow[] {
  if (!Number.isInteger(radiusKm) || radiusKm < 0 || radiusKm > pairs.radius_km_max) {
    throw new RangeError(`radius ${radiusKm} km is not a whole number in 0..${pairs.radius_km_max}`);
  }
  const radiusM = radiusKm * 1000;
  const scored = pairs.reports.filter((r) => r.edge_m > radiusM + pairs.edge_margin_m);
  return RULER.map((mark) => {
    // dist_m follows the classes order of the file, so the class index comes from the file.
    const k = pairs.classes.findIndex((c) => c.threshold_mm === mark.threshold_mm);
    const cls = pairs.classes[k];
    if (cls === undefined) throw new DataError("pairs.json", `missing size class ${mark.threshold_mm} mm`);
    const unverifiable = cls.unverifiable_km2[radiusKm];
    if (unverifiable === undefined) {
      throw new DataError("pairs.json", `classes[${k}].unverifiable_km2 has no entry for ${radiusKm} km`);
    }
    const event = hundredths(cls.threshold_mm / 25.4);
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctNegatives = 0;
    for (const report of scored) {
      if (report.dist_m.length !== pairs.classes.length) {
        throw new DataError(
          "pairs.json",
          `reports[${report.id}].dist_m has ${report.dist_m.length} entries for ${pairs.classes.length} classes`,
        );
      }
      const dist = report.dist_m[k];
      const observed = hundredths(report.size_in) >= event;
      const forecast = dist !== null && dist !== undefined && dist <= radiusM;
      if (observed && forecast) hits += 1;
      else if (observed) misses += 1;
      else if (forecast) falseAlarms += 1;
      else correctNegatives += 1;
    }
    return {
      threshold_mm: cls.threshold_mm,
      threshold_in: cls.threshold_in,
      label: cls.label,
      hits,
      misses,
      false_alarms: falseAlarms,
      correct_negatives: correctNegatives,
      ...skill(hits, misses, falseAlarms, correctNegatives),
      swath_km2: cls.swath_km2,
      unverifiable_km2: unverifiable,
    };
  });
}

export type ReportOutcome = "hit" | "miss" | "false_alarm" | "correct_negative" | "excluded";

export const OUTCOME_LABELS: Record<ReportOutcome, string> = {
  hit: "Hit (a)",
  miss: "Miss (c)",
  false_alarm: "False alarm (b)",
  correct_negative: "Correct negative (d)",
  excluded: "Excluded near crop edge",
};

export interface ClassifiedReport {
  id: number;
  size_in: number;
  edge_m: number;
  dist_m: number | null;
  observed: boolean;
  forecast: boolean;
  outcome: ReportOutcome;
  time: string | null;
  location: string | null;
  county: string | null;
  lngLat: [number, number] | null;
}

/**
 * Classify each SPC report in `pairs.reports` at `(radiusKm, thresholdMm)` into
 * hit, miss, false_alarm, correct_negative, or excluded, optionally joining metadata
 * (`time`, `location`, `county`, `lngLat`) from `reportsGeo` (`reports.geojson`).
 */
export function classifyReports(
  pairs: Pairs,
  radiusKm: number,
  thresholdMm: number,
  reportsGeo?: ReportsFile | null,
): ClassifiedReport[] {
  if (!Number.isInteger(radiusKm) || radiusKm < 0 || radiusKm > pairs.radius_km_max) {
    throw new RangeError(`radius ${radiusKm} km is not a whole number in 0..${pairs.radius_km_max}`);
  }
  const k = pairs.classes.findIndex((c) => c.threshold_mm === thresholdMm);
  const cls = pairs.classes[k];
  if (cls === undefined) throw new DataError("pairs.json", `missing size class ${thresholdMm} mm`);

  const radiusM = radiusKm * 1000;
  const edgeLimit = radiusM + pairs.edge_margin_m;
  const event = hundredths(cls.threshold_mm / 25.4);

  const byId = new Map<
    number,
    { time: string; location: string; county: string; lngLat: [number, number] }
  >();
  for (const feat of reportsGeo?.features ?? []) {
    const p = feat.properties;
    const coords = feat.geometry.coordinates;
    byId.set(p.id, {
      time: p.time,
      location: p.location,
      county: p.county,
      lngLat: [Number(coords[0] ?? 0), Number(coords[1] ?? 0)],
    });
  }

  return pairs.reports.map((report) => {
    if (report.dist_m.length !== pairs.classes.length) {
      throw new DataError(
        "pairs.json",
        `reports[${report.id}].dist_m has ${report.dist_m.length} entries for ${pairs.classes.length} classes`,
      );
    }
    const dist = report.dist_m[k] ?? null;
    const observed = hundredths(report.size_in) >= event;
    const forecast = dist !== null && dist <= radiusM;
    const insideDomain = report.edge_m > edgeLimit;
    const outcome: ReportOutcome = !insideDomain
      ? "excluded"
      : observed && forecast
        ? "hit"
        : observed
          ? "miss"
          : forecast
            ? "false_alarm"
            : "correct_negative";
    const meta = byId.get(report.id);
    return {
      id: report.id,
      size_in: report.size_in,
      edge_m: report.edge_m,
      dist_m: dist,
      observed,
      forecast,
      outcome,
      time: meta?.time ?? null,
      location: meta?.location ?? null,
      county: meta?.county ?? null,
      lngLat: meta?.lngLat ?? null,
    };
  });
}
