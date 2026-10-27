// Port of hailprint.publish.rescore and hailprint.score.skill. The radius rule runs at
// read time so the site and the Python scorer agree at every whole km.
import type { Metric, Pairs, TableRow } from "./data/types";
import { DataError } from "./data/types";

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

/** The contingency table at a whole-km radius, one row per class in classes order. */
export function rescore(pairs: Pairs, radiusKm: number): TableRow[] {
  if (!Number.isInteger(radiusKm) || radiusKm < 0 || radiusKm > pairs.radius_km_max) {
    throw new RangeError(`radius ${radiusKm} km is not a whole number in 0..${pairs.radius_km_max}`);
  }
  const radiusM = radiusKm * 1000;
  const scored = pairs.reports.filter((r) => r.edge_m > radiusM + pairs.edge_margin_m);
  return pairs.classes.map((cls, k) => {
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