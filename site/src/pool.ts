// Port of hailprint.score.pool: sum the counts and areas per size class over storm dates,
// then recompute the skill. Never a mean of metrics.
import { DataError, type Pairs, type TableRow } from "./data/types";
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