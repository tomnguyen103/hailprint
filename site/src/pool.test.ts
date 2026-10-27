import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Pairs, StormsIndex, TableRow } from "./data/types";
import { pool, pooledRows, scoredCount, type PooledRow } from "./pool";
import { rescore } from "./rescore";
import { RULER } from "./ruler";

const mark = RULER[0]!;

/** One single-class table with the four counts; the metrics are placeholders that pool must recompute. */
function table(hits: number, misses: number, falseAlarms: number, correctNegatives: number): TableRow[] {
  return [
    {
      threshold_mm: mark.threshold_mm,
      threshold_in: mark.threshold_in,
      label: mark.object,
      hits,
      misses,
      false_alarms: falseAlarms,
      correct_negatives: correctNegatives,
      pod: 9,
      far: 9,
      csi: 9,
      hss: 9,
      swath_km2: 1.5,
      unverifiable_km2: 0.25,
    },
  ];
}

describe("pool", () => {
  it("sums the counts and areas, then recomputes the skill", () => {
    const rows = pool([table(1, 0, 2, 1), table(2, 1, 0, 3)], [4, 6]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.report_count).toBe(10);
    expect(row.hits).toBe(3);
    expect(row.misses).toBe(1);
    expect(row.false_alarms).toBe(2);
    expect(row.correct_negatives).toBe(4);
    // Oracle: hailprint.score.skill(3, 1, 2, 4): hss = 2(3*4 - 2*1) / ((3+1)(1+4) + (3+2)(2+4)) = 20/50.
    expect(row.pod).toBe(0.75);
    expect(row.far).toBe(0.4);
    expect(row.csi).toBe(0.5);
    expect(row.hss).toBe(0.4);
    expect(row.swath_km2).toBe(3);
    expect(row.unverifiable_km2).toBe(0.5);
  });

  it("keeps the counts of one table and takes its report count", () => {
    const only = table(5, 2, 3, 7)[0]!;
    const rows = pool([[only]], [17]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.report_count).toBe(17);
    expect([row.hits, row.misses, row.false_alarms, row.correct_negatives]).toEqual([5, 2, 3, 7]);
    expect(row.swath_km2).toBe(only.swath_km2);
    expect(row.pod).toBeCloseTo(5 / 7, 12);
  });

  it("refuses zero tables and a report count list of another length", () => {
    expect(() => pool([], [])).toThrow(RangeError);
    expect(() => pool([table(1, 0, 0, 0)], [])).toThrow(RangeError);
  });
});

describe("pooledRows", () => {
  it("returns the pool of one pairs file and its scored count", () => {
    const doc: Pairs = {
      receipt: {} as Pairs["receipt"],
      radius_km_default: 1,
      radius_km_max: 1,
      edge_margin_m: 1000,
      classes: RULER.map((m, i) => ({
        threshold_mm: m.threshold_mm,
        threshold_in: m.threshold_in,
        label: m.object,
        swath_km2: i,
        unverifiable_km2: [0, 1],
      })),
      reports: [
        { id: 0, size_in: 1, edge_m: 5000, dist_m: [0, 0, 500, null, null, null, null] },
        { id: 1, size_in: 2, edge_m: 1500, dist_m: [0, 0, 0, 0, 0, 0, 0] },
      ],
    };
    const scored = scoredCount(doc, 1);
    expect(scored).toBe(1);
    expect(pooledRows([doc], 1)).toEqual({ rows: pool([rescore(doc, 1)], [scored]), scored });
  });
});

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const goldenPath = join(dataDir, "pooled-golden.json");
const indexPath = join(dataDir, "storms.json");

interface Golden {
  radius_km_max: number;
  radii: Record<string, PooledRow[]>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function allPairs(): Pairs[] {
  const stormsDir = join(dataDir, "storms");
  return readdirSync(stormsDir).map((date) => readJson<Pairs>(join(stormsDir, date, "pairs.json")));
}

describe("pool over the published storm dates", () => {
  it.skipIf(!existsSync(indexPath))("sums to the storms.json tables at the default radius", () => {
    const index = readJson<StormsIndex>(indexPath);
    const pairs = allPairs();
    const radius = index.radius_km_default;
    const rows = pool(
      pairs.map((p) => rescore(p, radius)),
      pairs.map((p) => scoredCount(p, radius)),
    );
    expect(rows).toHaveLength(RULER.length);
    const scored = index.storms.reduce((acc, s) => acc + s.scored_reports, 0);
    for (const row of rows) {
      expect(row.report_count).toBe(scored);
      for (const key of ["hits", "misses", "false_alarms", "correct_negatives"] as const) {
        const want = index.storms.reduce(
          (acc, s) => acc + (s.table.find((t) => t.threshold_mm === row.threshold_mm)?.[key] ?? Number.NaN),
          0,
        );
        expect(row[key], `${row.threshold_mm} mm ${key}`).toBe(want);
      }
    }
  });
});

describe("pool golden", () => {
  it.skipIf(!existsSync(goldenPath))("matches hailprint.score.pool at every whole radius", () => {
    const golden = readJson<Golden>(goldenPath);
    const pairs = allPairs();
    expect(pairs.length).toBeGreaterThan(0);
    for (let radius = 0; radius <= golden.radius_km_max; radius += 1) {
      const expected = golden.radii[String(radius)];
      expect(expected, `golden at R ${radius}`).toBeDefined();
      const rows = pool(
        pairs.map((p) => rescore(p, radius)),
        pairs.map((p) => scoredCount(p, radius)),
      );
      expect(rows).toHaveLength(expected!.length);
      rows.forEach((row, i) => {
        const want = expected![i]!;
        const at = `R ${radius}, ${want.threshold_mm} mm`;
        expect(row.threshold_mm, at).toBe(want.threshold_mm);
        expect(row.label, at).toBe(want.label);
        for (const key of ["report_count", "hits", "misses", "false_alarms", "correct_negatives"] as const) {
          expect(row[key], `${at} ${key}`).toBe(want[key]);
        }
        for (const key of ["pod", "far", "csi", "hss"] as const) {
          if (want[key] === null) expect(row[key], `${at} ${key}`).toBeNull();
          else expect(row[key], `${at} ${key}`).toBeCloseTo(want[key], 9);
        }
        expect(row.swath_km2, at).toBeCloseTo(want.swath_km2, 9);
        expect(row.unverifiable_km2, at).toBeCloseTo(want.unverifiable_km2, 9);
      });
    }
  });
});