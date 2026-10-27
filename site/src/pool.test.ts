import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Pairs, TableRow } from "./data/types";
import { pool, scoredCount, type PooledRow } from "./pool";
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

  it("refuses zero tables and a report count list of another length", () => {
    expect(() => pool([], [])).toThrow(RangeError);
    expect(() => pool([table(1, 0, 0, 0)], [])).toThrow(RangeError);
  });
});

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const goldenPath = join(dataDir, "pooled-golden.json");

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