import { expect, it } from "vitest";
import type { Storm, StormFiles, ZipCounts } from "../data/types";
import {
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

function storm(date: string, files: Partial<StormFiles> = {}): Storm {
  return { storm_date: date, files: makeFiles(files) } as Storm;
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
  const withPower = storm("2025-05-01", { power: "storms/2025-05-01/power.json" });
  const olderWithWarnings = storm("2024-05-28", { warnings: "storms/2024-05-28/warnings.geojson" });

  expect(hasImpactLayer(withoutImpact)).toBe(false);
  expect(hasImpactLayer(withPower)).toBe(true);
  expect(landingStorm([withoutImpact, withPower, olderWithWarnings])?.storm_date).toBe("2025-05-01");
  expect(landingStorm([withoutImpact, storm("2026-06-02")])?.storm_date).toBe("2026-08-28");
  expect(landingStorm([])).toBeUndefined();
});
