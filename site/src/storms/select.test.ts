import { expect, it } from "vitest";
import type { Storm, StormFiles, ZipCounts } from "../data/types";
import {
  CASE_STUDIES,
  availableCaseStudies,
  defaultFill,
  groupByYear,
  hasImpactLayer,
  impactChips,
  landingStorm,
  objectForSize,
  zipRows,
} from "./select";

function makeFiles(overrides: Partial<StormFiles> = {}): StormFiles {
  return {
    swath: "storms/2024-05-28/swath.geojson",
    reports: "storms/2024-05-28/reports.geojson",
    pairs: "storms/2024-05-28/pairs.json",
    zip_counts: null,
    warnings: null,
    power: null,
    internet: null,
    ...overrides,
  };
}

function storm(date: string, files: Partial<StormFiles> = {}, reportCount = 0): Storm {
  return { storm_date: date, report_count: reportCount, files: makeFiles(files) } as Storm;
}

it("groups storm dates by year, newest year first and newest date first", () => {
  const groups = groupByYear([storm("2024-05-28"), storm("2026-08-28"), storm("2024-01-08"), storm("2021-03-17")]);
  expect(groups.map((g) => g.year)).toEqual(["2026", "2024", "2021"]);
  expect(groups[1]!.storms.map((s) => s.storm_date)).toEqual(["2024-05-28", "2024-01-08"]);
});

it("returns the ZIP rows of one class sorted by count descending then ZIP ascending", () => {
  const zip = {
    zips: [
      { zip: "77002", threshold_mm: 19.05, parcel_count: 5 },
      { zip: "77003", threshold_mm: 19.05, parcel_count: 9 },
      { zip: "77001", threshold_mm: 19.05, parcel_count: 5 },
      { zip: "77002", threshold_mm: 25.4, parcel_count: 1 },
    ],
  } as ZipCounts;
  expect(zipRows(zip, 19.05).map((r) => r.zip)).toEqual(["77003", "77001", "77002"]);
  expect(zipRows(zip, 63.5)).toEqual([]);
});

it("names the object for a report size", () => {
  expect(objectForSize(1.75)).toBe("golf ball");
  expect(objectForSize(1.6)).toBe("walnut");
  expect(objectForSize(0.5)).toBe("below 0.75 in");
});

it("picks the default county fill from the available impact files", () => {
  expect(defaultFill(makeFiles({ power: "power.json", internet: "internet.json" }))).toBe("power");
  expect(defaultFill(makeFiles({ power: "power.json", internet: null }))).toBe("power");
  expect(defaultFill(makeFiles({ power: null, internet: "internet.json" }))).toBe("internet");
  expect(defaultFill(makeFiles({ power: null, internet: null }))).toBe("none");
});

it("lists impact chips in power, internet, warnings order", () => {
  expect(impactChips(makeFiles())).toEqual([]);
  expect(impactChips(makeFiles({ warnings: "w.geojson" }))).toEqual(["warnings"]);
  expect(impactChips(makeFiles({ power: "p.json", warnings: "w.geojson" }))).toEqual(["power", "warnings"]);
  expect(impactChips(makeFiles({ power: "p.json", internet: "i.json", warnings: "w.geojson" }))).toEqual([
    "power",
    "internet",
    "warnings",
  ]);
});

it("picks the newest storm date with an impact layer for the landing route and falls back to the newest date", () => {
  const withoutImpact = storm("2026-08-28");
  const withWarningsOnly = storm("2025-05-02", { warnings: "storms/2025-05-02/warnings.geojson" });
  const withPower = storm("2025-05-01", { power: "storms/2025-05-01/power.json" });
  const withPowerAndInternetZeroReports = storm(
    "2024-05-16",
    { power: "storms/2024-05-16/power.json", internet: "storms/2024-05-16/internet.json" },
    0,
  );
  const fullShowcase = storm(
    "2024-05-28",
    { power: "storms/2024-05-28/power.json", internet: "storms/2024-05-28/internet.json", warnings: "storms/2024-05-28/warnings.geojson" },
    8,
  );
  const olderWithWarnings = storm("2024-03-15", { warnings: "storms/2024-03-15/warnings.geojson" });

  expect(hasImpactLayer(withoutImpact)).toBe(false);
  expect(hasImpactLayer(withPower)).toBe(true);
  expect(
    landingStorm([withoutImpact, withWarningsOnly, withPower, withPowerAndInternetZeroReports, fullShowcase])?.storm_date,
  ).toBe("2024-05-28");
  expect(landingStorm([withoutImpact, withWarningsOnly, withPower, olderWithWarnings])?.storm_date).toBe("2025-05-01");
  expect(landingStorm([withoutImpact, olderWithWarnings])?.storm_date).toBe("2024-03-15");
  expect(landingStorm([withoutImpact, storm("2026-06-02")])?.storm_date).toBe("2026-08-28");
  expect(landingStorm([])).toBeUndefined();
});

it("filters curated case studies against the published catalog", () => {
  expect(CASE_STUDIES).toHaveLength(4);
  const available = availableCaseStudies([storm("2024-05-28"), storm("2024-12-24")]);
  expect(available.map((cs) => cs.storm_date)).toEqual(["2024-05-28", "2024-12-24"]);
});

it("builds a cross-storm ZIP exposure ledger sorted by parcel count descending", async () => {
  const { crossStormZipLedger } = await import("./select");
  const s1 = { ...storm("2024-05-28"), max_mesh_mm: 55 };
  const s2 = { ...storm("2023-06-23"), max_mesh_mm: 62 };
  const z1 = {
    receipt: {} as never,
    classes: [{ threshold_mm: 19.05, threshold_in: 0.75, label: ">= 0.75 in", parcel_count: 100 }],
    zips: [{ zip: "77002", threshold_mm: 19.05, parcel_count: 25 }],
  } as ZipCounts;
  const z2 = {
    receipt: {} as never,
    classes: [{ threshold_mm: 19.05, threshold_in: 0.75, label: ">= 0.75 in", parcel_count: 200 }],
    zips: [{ zip: "77002", threshold_mm: 19.05, parcel_count: 80 }],
  } as ZipCounts;
  const ledger = crossStormZipLedger([s1, s2], [z1, z2], "77002", 19.05);
  expect(ledger.map((e) => e.storm_date)).toEqual(["2023-06-23", "2024-05-28"]);
  expect(ledger[0]?.parcel_count).toBe(80);
  expect(ledger[0]?.share).toBeCloseTo(0.4, 5);
});
