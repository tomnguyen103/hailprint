import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DataError } from "./data/types";
import type { Pairs, PairsClass, StormsIndex } from "./data/types";
import { rescore, skill } from "./rescore";
import { RULER } from "./ruler";

const receipt = {
  storm_date: "2024-01-01",
  sources: [],
  confidence: "radar-estimated hail size",
  run_time: "2024-01-02T00:00:00Z",
  package_version: "0.0.0",
};

const CLASSES: PairsClass[] = RULER.map((mark, i) => ({
  threshold_mm: mark.threshold_mm,
  threshold_in: mark.threshold_in,
  label: mark.object,
  swath_km2: 10 - i,
  unverifiable_km2: Array<number>(21).fill(4 - i / 2),
}));

/** Seven classes in RULER order; a short `dist_m` is padded with null for the larger classes. */
function doc(reports: { id: number; size_in: number; edge_m: number; dist_m: (number | null)[] }[]): Pairs {
  return {
    receipt,
    radius_km_default: 5,
    radius_km_max: 20,
    edge_margin_m: 1000,
    classes: CLASSES,
    reports: reports.map((r) => ({
      ...r,
      dist_m: [...r.dist_m, ...Array<null>(RULER.length - r.dist_m.length).fill(null)],
    })),
  };
}

const three = doc([
  { id: 0, size_in: 1.0, edge_m: 40000, dist_m: [0, 3000] },
  { id: 1, size_in: 0.75, edge_m: 500, dist_m: [null, 6000] },
  { id: 2, size_in: 2.0, edge_m: 9000, dist_m: [12000, null] },
]);

/** The same document with the classes and every `dist_m` reversed. */
function reversed(pairs: Pairs): Pairs {
  return {
    ...pairs,
    classes: [...pairs.classes].reverse(),
    reports: pairs.reports.map((r) => ({ ...r, dist_m: [...r.dist_m].reverse() })),
  };
}

describe("rescore", () => {
  it("scores the reports inside the domain at R = 5", () => {
    const rows = rescore(three, 5);
    expect(rows).toHaveLength(RULER.length);
    const first = rows[0]!;
    expect(first.hits).toBe(1);
    expect(first.misses).toBe(1);
    expect(first.false_alarms).toBe(0);
    expect(first.correct_negatives).toBe(0);
    // Oracle: hailprint.score.skill(1, 1, 0, 0) gives pod 0.5, far 0, csi 0.5, hss 0.
    expect(first.pod).toBe(0.5);
    expect(first.far).toBe(0);
    expect(first.csi).toBe(0.5);
    expect(first.hss).toBe(0);
    expect(first.swath_km2).toBe(10);
    expect(first.unverifiable_km2).toBe(4);
  });
  it("gives zero counts and null metrics with no scored report", () => {
    const rows = rescore(doc([{ id: 0, size_in: 1, edge_m: 100, dist_m: [0, 0] }]), 5);
    for (const row of rows) {
      expect([row.hits, row.misses, row.false_alarms, row.correct_negatives]).toEqual([0, 0, 0, 0]);
      expect([row.pod, row.far, row.csi, row.hss]).toEqual([null, null, null, null]);
    }
  });
  it("refuses a radius outside the whole-km range", () => {
    expect(() => rescore(three, 5.5)).toThrow(RangeError);
    expect(() => rescore(three, 21)).toThrow(RangeError);
    expect(() => rescore(three, -1)).toThrow(RangeError);
  });
  it("names pairs.json for a dist_m list of the wrong length", () => {
    const bad = { ...three, reports: [{ id: 0, size_in: 1, edge_m: 40000, dist_m: [0] }] };
    expect(() => rescore(bad, 5)).toThrow(DataError);
    expect(() => rescore(bad, 5)).toThrow(/pairs\.json/);
  });
  it("names the missing size class", () => {
    const drop = (_: unknown, i: number) => i !== 1;
    const bad = {
      ...three,
      classes: CLASSES.filter(drop),
      reports: three.reports.map((r) => ({ ...r, dist_m: r.dist_m.filter(drop) })),
    };
    expect(() => rescore(bad, 5)).toThrow(DataError);
    expect(() => rescore(bad, 5)).toThrow(/pairs\.json: missing size class 25\.4 mm/);
  });
  it("returns the same table in RULER order when the classes are shuffled", () => {
    expect(rescore(reversed(three), 5)).toEqual(rescore(three, 5));
    expect(rescore(three, 5).map((r) => r.threshold_mm)).toEqual(RULER.map((m) => m.threshold_mm));
  });
});

describe("skill", () => {
  it("matches the hand-computed formulas", () => {
    expect(skill(10, 0, 0, 0)).toEqual({ pod: 1, far: 0, csi: 1, hss: null });
    expect(skill(0, 0, 1, 0)).toEqual({ pod: null, far: 1, csi: 0, hss: 0 });
    expect(skill(0, 0, 0, 0)).toEqual({ pod: null, far: null, csi: null, hss: null });
  });
});

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const indexPath = join(dataDir, "storms.json");

describe("golden: rescore at R = 5 equals the published table", () => {
  it.skipIf(!existsSync(indexPath))("for every storm date in storms.json", () => {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as StormsIndex;
    expect(index.storms.length).toBeGreaterThan(0);
    for (const storm of index.storms) {
      const pairs = JSON.parse(readFileSync(join(dataDir, storm.files.pairs), "utf8")) as Pairs;
      const rows = rescore(pairs, index.radius_km_default);
      expect(rows).toHaveLength(storm.table.length);
      rows.forEach((row, i) => {
        const want = storm.table[i]!;
        expect(row.threshold_mm).toBe(want.threshold_mm);
        expect(row.hits).toBe(want.hits);
        expect(row.misses).toBe(want.misses);
        expect(row.false_alarms).toBe(want.false_alarms);
        expect(row.correct_negatives).toBe(want.correct_negatives);
        for (const key of ["pod", "far", "csi", "hss"] as const) {
          if (want[key] === null) expect(row[key]).toBeNull();
          else expect(row[key]).toBeCloseTo(want[key], 9);
        }
        expect(row.swath_km2).toBeCloseTo(want.swath_km2, 9);
        expect(row.unverifiable_km2).toBeCloseTo(want.unverifiable_km2, 9);
      });
    }
    expect(readdirSync(join(dataDir, "storms")).length).toBe(index.storms.length);
  });
});
