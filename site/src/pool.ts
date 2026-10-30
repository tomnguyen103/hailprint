// Port of hailprint.score.pool: sum the counts and areas per size class over storm dates,
// then recompute the skill. Never a mean of metrics.
import {
  DataError,
  type Pairs,
  type Receipt,
  type Source,
  type Storm,
  type StormsIndex,
  type TableRow,
} from "./data/types";
import { rescore, skill } from "./rescore";
import { RULER } from "./ruler";

export interface PooledRow extends TableRow {
  report_count: number;
}

/** The scored reports at a whole-km radius, by the same edge rule as rescore. */
export function scoredCount(pairs: Pairs, radiusKm: number): number {
  if (!Number.isInteger(radiusKm) || radiusKm < 0 || radiusKm > pairs.radius_km_max) {
    throw new RangeError(`radius ${radiusKm} km is not a whole number in 0..${pairs.radius_km_max}`);
  }
  const edge = radiusKm * 1000 + pairs.edge_margin_m;
  return pairs.reports.filter((r) => r.edge_m > edge).length;
}

/** The pooled table, one row per size class in RULER order; `reportCounts[i]` is the scored count of `tables[i]`. */
export function pool(tables: TableRow[][], reportCounts: number[]): PooledRow[] {
  if (tables.length === 0) throw new RangeError("pool of zero tables");
  if (tables.length !== reportCounts.length) {
    throw new RangeError(`${tables.length} tables but ${reportCounts.length} report counts`);
  }
  return RULER.flatMap((mark) => {
    // A group holds the tables that carry the class, as the pandas groupby does.
    const group = tables.flatMap((t, i) =>
      t.filter((r) => r.threshold_mm === mark.threshold_mm).map((row) => ({ row, count: reportCounts[i]! })),
    );
    if (group.length === 0) return [];
    const rows = group.map((g) => g.row);
    const sum = (pick: (row: TableRow) => number) => rows.reduce((acc, row) => acc + pick(row), 0);
    const hits = sum((r) => r.hits);
    const misses = sum((r) => r.misses);
    const falseAlarms = sum((r) => r.false_alarms);
    const correctNegatives = sum((r) => r.correct_negatives);
    const first = rows[0]!;
    return {
      threshold_mm: first.threshold_mm,
      threshold_in: first.threshold_in,
      label: first.label,
      report_count: group.reduce((acc, g) => acc + g.count, 0),
      hits,
      misses,
      false_alarms: falseAlarms,
      correct_negatives: correctNegatives,
      ...skill(hits, misses, falseAlarms, correctNegatives),
      swath_km2: sum((r) => r.swath_km2),
      unverifiable_km2: sum((r) => r.unverifiable_km2),
    };
  });
}

const FILE = "pairs.json";

/** The pooled rows and the scored report count at a radius, or the DataError a malformed file raises. */
export function pooledRows(pairs: Pairs[], radius: number): { rows: PooledRow[]; scored: number } | { error: DataError } {
  try {
    const counts = pairs.map((p) => scoredCount(p, radius));
    return {
      rows: pool(
        pairs.map((p) => rescore(p, radius)),
        counts,
      ),
      scored: counts.reduce((a, b) => a + b, 0),
    };
  } catch (error) {
    if (error instanceof DataError) return { error };
    return { error: new DataError(FILE, error instanceof Error ? error.message : String(error)) };
  }
}

/** Aggregate receipt over a set of pairs files: date range and deduplicated source list. */
export function pooledReceipt(
  pairs: readonly Pairs[],
  index?: Pick<StormsIndex, "confidence" | "run_time" | "package_version">,
): Receipt | null {
  if (pairs.length === 0) return null;
  const first = pairs[0]!.receipt;
  const dates = [...new Set(pairs.map((p) => p.receipt?.storm_date).filter((d): d is string => Boolean(d)))].sort();
  const stormDate =
    dates.length === 0 ? "" : dates.length === 1 ? dates[0]! : `${dates[0]} to ${dates[dates.length - 1]}`;
  const byKey = new Map<string, { source: string; product: string; files: Set<string> }>();
  for (const p of pairs) {
    for (const s of p.receipt?.sources ?? []) {
      const key = `${s.source}|${s.product}`;
      const existing = byKey.get(key);
      if (existing) existing.files.add(s.file);
      else byKey.set(key, { source: s.source, product: s.product, files: new Set([s.file]) });
    }
  }
  const sources: Source[] = [...byKey.values()].map(({ source, product, files }) => {
    const sorted = [...files].sort();
    const file =
      sorted.length <= 1
        ? (sorted[0] ?? "")
        : `${sorted[0]} \u2026 ${sorted[sorted.length - 1]} (${sorted.length} files)`;
    return { source, product, file };
  });
  return {
    storm_date: stormDate,
    sources,
    confidence: index?.confidence ?? first.confidence,
    run_time: index?.run_time ?? first.run_time,
    package_version: index?.package_version ?? first.package_version,
  };
}

export type CohortId = "all" | "wcm" | "spc-daily" | `year:${string}`;

export interface CohortFilterResult {
  storms: Storm[];
  pairs: Pairs[];
}

/** Filter storms and their matching pairs files by cohort ("all", "wcm", "spc-daily", or "year:YYYY"). */
export function filterCohort(
  storms: readonly Storm[],
  pairs: readonly Pairs[],
  cohort: CohortId,
): CohortFilterResult {
  const matchStorm = (s: Storm): boolean => {
    if (cohort === "all") return true;
    if (cohort === "wcm") return s.report_source === "wcm";
    if (cohort === "spc-daily") return s.report_source === "spc-daily";
    if (cohort.startsWith("year:")) return s.storm_date.startsWith(cohort.slice(5));
    return true;
  };
  const filteredStorms = storms.filter(matchStorm);
  const allowedDates = new Set(filteredStorms.map((s) => s.storm_date));
  const filteredPairs =
    cohort === "all"
      ? [...pairs]
      : pairs.filter((p, idx) => {
          const d = p.receipt?.storm_date ?? storms[idx]?.storm_date;
          return d !== undefined && allowedDates.has(d);
        });
  return { storms: filteredStorms, pairs: filteredPairs };
}

export const SENSITIVITY_RADII_KM = [2, 4, 8, 12, 16, 20] as const;

export interface SensitivityCell {
  radiusKm: number;
  thresholdMm: number;
  thresholdIn: number;
  hss: number | null;
  csi: number | null;
  pod: number | null;
  far: number | null;
  hits: number;
  misses: number;
  false_alarms: number;
  correct_negatives: number;
}

/** Compute the Radius × Threshold sensitivity matrix across `pairs` for each radius in `radiiKm`. */
export function sensitivityMatrix(
  pairs: readonly Pairs[],
  radiiKm: readonly number[] = SENSITIVITY_RADII_KM,
): SensitivityCell[][] {
  if (pairs.length === 0) return [];
  return radiiKm.map((radiusKm) => {
    const res = pooledRows([...pairs], radiusKm);
    if ("error" in res) return [];
    return res.rows.map((r) => ({
      radiusKm,
      thresholdMm: r.threshold_mm,
      thresholdIn: r.threshold_in,
      hss: r.hss,
      csi: r.csi,
      pod: r.pod,
      far: r.far,
      hits: r.hits,
      misses: r.misses,
      false_alarms: r.false_alarms,
      correct_negatives: r.correct_negatives,
    }));
  });
}