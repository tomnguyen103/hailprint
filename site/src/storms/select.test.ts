import { expect, it } from "vitest";
import type { Storm, ZipCounts } from "../data/types";
import { groupByYear, objectForSize, zipRows } from "./select";

function storm(date: string): Storm {
  return { storm_date: date } as Storm;
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