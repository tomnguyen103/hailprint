import { describe, expect, it } from "vitest";
import { guardIndex, guardPairs, guardZipCounts } from "./guard";
import { DataError } from "./types";

const table = Array(7).fill({});
const storm = {
  storm_date: "2024-05-28",
  table,
  files: { swath: "a", reports: "b", pairs: "c", zip_counts: null },
};
const good = { radius_km_default: 5, storms: [storm] };

describe("guardIndex", () => {
  it("returns the typed index", () => {
    expect(guardIndex(good).storms[0]!.storm_date).toBe("2024-05-28");
  });
  it("names storms.json and the missing storms array", () => {
    expect(() => guardIndex({ radius_km_default: 5 })).toThrow(DataError);
    expect(() => guardIndex({ radius_km_default: 5 })).toThrow(/storms\.json: .*storms/);
  });
  it("rejects a bad storm_date", () => {
    expect(() => guardIndex({ ...good, storms: [{ ...storm, storm_date: "yesterday" }] })).toThrow(
      /storm_date/,
    );
  });
  it("rejects a non-string files.swath", () => {
    const files = { ...storm.files, swath: 3 };
    expect(() => guardIndex({ ...good, storms: [{ ...storm, files }] })).toThrow(/files\.swath/);
  });
  it("rejects a non-array table", () => {
    expect(() => guardIndex({ ...good, storms: [{ ...storm, table: "x" }] })).toThrow(/table/);
  });
});

describe("guardPairs and guardZipCounts", () => {
  it("name their file and the first missing key", () => {
    const pairs = { receipt: {}, radius_km_max: 20, edge_margin_m: 1000, classes: [] };
    expect(() => guardPairs(pairs)).toThrow(/pairs\.json: .*reports/);
    expect(() => guardZipCounts({ receipt: {}, classes: [] })).toThrow(/zip-counts\.json: .*zips/);
  });
});