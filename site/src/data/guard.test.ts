import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FILE_PATH, MAX_RUNS, guardIndex, guardOutline, guardPairs, guardPipeline, guardReports, guardSwath, guardZipCounts } from "./guard";
import { DataError } from "./types";

const receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "noaa-mrms-pds", product: "MESH_Max_1440min_00.50", file: "swaths-2024-05-28.parquet" }],
  confidence: "radar-estimated hail size",
  run_time: "2026-10-26T23:02:33Z",
  package_version: "0.1.0",
};

const storm = {
  storm_date: "2024-05-28",
  report_count: 3,
  max_size_in: 1.75,
  report_source: "spc-daily",
  max_mesh_mm: 44.5,
  scored_reports: 2,
  excluded_reports: 1,
  table: [],
  parcel_total: null,
  files: {
    swath: "storms/2024-05-28/swath.geojson",
    reports: "storms/2024-05-28/reports.geojson",
    pairs: "storms/2024-05-28/pairs.json",
    zip_counts: "storms/2024-05-28/zip-counts.json",
  },
};

const index = {
  confidence: receipt.confidence,
  run_time: receipt.run_time,
  package_version: receipt.package_version,
  radius_km_default: 5,
  storms: [storm],
};

const pairs = {
  receipt,
  radius_km_default: 5,
  radius_km_max: 20,
  edge_margin_m: 1000,
  classes: [{ threshold_mm: 19.05, threshold_in: 0.75, label: "a", swath_km2: 10, unverifiable_km2: [1] }],
  reports: [{ id: 0, size_in: 1, edge_m: 4000, dist_m: [0] }],
};

const zip = {
  receipt,
  classes: [{ threshold_mm: 19.05, threshold_in: 0.75, label: "a", parcel_count: 4 }],
  zips: [{ zip: "77002", threshold_mm: 19.05, parcel_count: 4 }],
};

const reports = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      properties: { id: 0, time: "1823", location: "6 NE Jersey Village", county: "Harris", state: "TX", size_in: 1.5 },
      geometry: { type: "Point", coordinates: [-95.53, 29.96] },
    },
  ],
};

const swath = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      properties: { threshold_mm: 19.05, threshold_in: 0.75, label: "a", area_km2: 1 },
      geometry: { type: "MultiPolygon", coordinates: [] },
    },
  ],
};

const run = { run_time: receipt.run_time, package_version: "0.1.0", storm_dates: ["2024-05-28"], file_count: 4 };

const pipeline = {
  confidence: receipt.confidence,
  run_time: receipt.run_time,
  package_version: receipt.package_version,
  runs: [run],
  archive: {
    days: 3,
    first_storm_date: "2023-06-23",
    last_storm_date: "2024-05-28",
    days_without_12z: 1,
    years: [
      { year: 2023, days: 1, days_with_12z: 1 },
      { year: 2024, days: 2, days_with_12z: 1 },
    ],
  },
  sources: [{ source: "noaa-mrms-pds", product: "MESH_Max_1440min_00.50", storm_dates: ["2024-05-28"] }],
};

/** A deep copy with the dotted `path` deleted. */
function without<T>(value: T, path: string): T {
  const copy = structuredClone(value) as unknown;
  const keys = path.split(".");
  const last = keys.pop()!;
  let node = copy as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  delete node[last];
  return copy as T;
}

const cases: [string, string, (value: unknown) => unknown, unknown, string[]][] = [
  [
    "guardIndex",
    "storms.json",
    guardIndex,
    index,
    [
      "confidence",
      "run_time",
      "package_version",
      "radius_km_default",
      "storms",
      "storms.0.storm_date",
      "storms.0.report_count",
      "storms.0.max_size_in",
      "storms.0.report_source",
      "storms.0.max_mesh_mm",
      "storms.0.scored_reports",
      "storms.0.excluded_reports",
      "storms.0.table",
      "storms.0.files",
      "storms.0.files.swath",
      "storms.0.files.reports",
      "storms.0.files.pairs",
      "storms.0.files.zip_counts",
    ],
  ],
  [
    "guardPairs",
    "pairs.json",
    guardPairs,
    pairs,
    [
      "receipt",
      "receipt.storm_date",
      "receipt.sources",
      "receipt.sources.0.source",
      "receipt.sources.0.product",
      "receipt.sources.0.file",
      "receipt.confidence",
      "receipt.run_time",
      "receipt.package_version",
      "radius_km_default",
      "radius_km_max",
      "edge_margin_m",
      "classes",
      "classes.0.threshold_mm",
      "classes.0.threshold_in",
      "classes.0.label",
      "classes.0.swath_km2",
      "classes.0.unverifiable_km2",
      "reports",
      "reports.0.id",
      "reports.0.size_in",
      "reports.0.edge_m",
      "reports.0.dist_m",
    ],
  ],
  [
    "guardZipCounts",
    "zip-counts.json",
    guardZipCounts,
    zip,
    [
      "receipt",
      "classes",
      "classes.0.threshold_mm",
      "classes.0.threshold_in",
      "classes.0.parcel_count",
      "zips",
      "zips.0.zip",
      "zips.0.threshold_mm",
      "zips.0.parcel_count",
    ],
  ],
  [
    "guardReports",
    "reports.geojson",
    guardReports,
    reports,
    [
      "receipt",
      "features",
      "features.0.properties",
      "features.0.properties.time",
      "features.0.properties.location",
      "features.0.properties.size_in",
      "features.0.geometry",
      "features.0.geometry.coordinates",
    ],
  ],
  [
    "guardSwath",
    "swath.geojson",
    guardSwath,
    swath,
    ["receipt", "features", "features.0.properties", "features.0.properties.threshold_mm", "features.0.properties.threshold_in", "features.0.geometry"],
  ],
  [
    "guardPipeline",
    "pipeline.json",
    guardPipeline,
    pipeline,
    [
      "confidence",
      "run_time",
      "package_version",
      "runs",
      "runs.0.run_time",
      "runs.0.package_version",
      "runs.0.storm_dates",
      "runs.0.file_count",
      "archive",
      "archive.days",
      "archive.first_storm_date",
      "archive.last_storm_date",
      "archive.days_without_12z",
      "archive.years",
      "archive.years.0.year",
      "archive.years.0.days",
      "archive.years.0.days_with_12z",
      "sources",
      "sources.0.source",
      "sources.0.product",
      "sources.0.storm_dates",
    ],
  ],
];

describe.each(cases)("%s", (_name, file, guard, good, paths) => {
  it("accepts the valid fixture", () => {
    expect(guard(good)).toBe(good);
  });
  it.each(paths)("names %s when it is missing", (path) => {
    const key = path.split(".").pop()!;
    const run = () => guard(without(good, path));
    expect(run).toThrow(DataError);
    expect(run).toThrow(new RegExp(`^${file.replace(".", "\\.")}: .*${key}`));
  });
});

describe("guardIndex", () => {
  it("rejects a bad storm_date", () => {
    expect(() => guardIndex({ ...index, storms: [{ ...storm, storm_date: "yesterday" }] })).toThrow(/storm_date/);
  });
  it("rejects a file path outside the published layout", () => {
    const files = { ...storm.files, swath: "../secret.json" };
    expect(() => guardIndex({ ...index, storms: [{ ...storm, files }] })).toThrow(/files\.swath/);
  });
  it("accepts a null zip_counts", () => {
    const files = { ...storm.files, zip_counts: null };
    expect(guardIndex({ ...index, storms: [{ ...storm, files }] }).storms[0]!.files.zip_counts).toBeNull();
  });
  it("accepts the file paths that storms.schema.json accepts and rejects the ones it rejects", () => {
    const schemaPath = fileURLToPath(new URL("../../../src/hailprint/schemas/storms.schema.json", import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $defs: Record<string, { pattern: string }> };
    const geojson = new RegExp(schema.$defs["geojson_file"]!.pattern);
    const json = new RegExp(schema.$defs["json_file"]!.pattern);
    for (const path of ["storms/2024-05-28/swath.geojson", "storms/2024-05-28/pairs.json"]) {
      expect(FILE_PATH.test(path)).toBe(true);
      expect(geojson.test(path) || json.test(path)).toBe(true);
    }
    for (const path of ["storms/x/pairs.json", "../secret.json", "storms/2024-05-28/pairs.txt"]) {
      expect(FILE_PATH.test(path)).toBe(false);
      expect(geojson.test(path) || json.test(path)).toBe(false);
    }
  });
});

describe("guardPairs", () => {
  it("rejects a dist_m list of the wrong length", () => {
    const bad = { ...pairs, reports: [{ ...pairs.reports[0], dist_m: [0, 1] }] };
    expect(() => guardPairs(bad)).toThrow(/pairs\.json: reports\[0\]\.dist_m has 2 entries for 1 classes/);
  });
  it("rejects a non-number inside dist_m and unverifiable_km2", () => {
    const badDist = { ...pairs, reports: [{ ...pairs.reports[0], dist_m: ["0"] }] };
    expect(() => guardPairs(badDist)).toThrow(/pairs\.json: reports\[0\]\.dist_m\[0\]/);
    const badArea = { ...pairs, classes: [{ ...pairs.classes[0], unverifiable_km2: ["1"] }] };
    expect(() => guardPairs(badArea)).toThrow(/pairs\.json: classes\[0\]\.unverifiable_km2\[0\]/);
  });
  it("accepts null inside dist_m", () => {
    const nullDist = { ...pairs, reports: [{ ...pairs.reports[0], dist_m: [null] }] };
    expect(guardPairs(nullDist).reports[0]!.dist_m[0]).toBeNull();
  });
});

describe("guardSwath", () => {
  it("rejects a geometry that is not a MultiPolygon", () => {
    const feature = { ...swath.features[0], geometry: { type: "Point", coordinates: [] } };
    expect(() => guardSwath({ ...swath, features: [feature] })).toThrow(
      /swath\.geojson: features\[0\]\.geometry\.type is not MultiPolygon/,
    );
  });
});

describe("guardPipeline", () => {
  it("rejects more than 50 runs", () => {
    const runs = Array.from({ length: 51 }, () => run);
    expect(() => guardPipeline({ ...pipeline, runs })).toThrow(/^pipeline\.json: runs has 51 entries/);
  });
  it("rejects a storm date that is not a date", () => {
    const runs = [{ ...run, storm_dates: ["yesterday"] }];
    expect(() => guardPipeline({ ...pipeline, runs })).toThrow(/^pipeline\.json: runs\[0\]\.storm_dates\[0\] is not a date/);
  });
  it("rejects a negative file count", () => {
    const runs = [{ ...run, file_count: -1 }];
    expect(() => guardPipeline({ ...pipeline, runs })).toThrow(/^pipeline\.json: runs\[0\]\.file_count is not a count/);
  });
  it("rejects a run_time that is not UTC to the second", () => {
    expect(() => guardPipeline({ ...pipeline, run_time: "2026-10-26T23:02:33.123Z" })).toThrow(
      /^pipeline\.json: run_time is not a run time/,
    );
    const runs = [{ ...run, run_time: "yesterday" }];
    expect(() => guardPipeline({ ...pipeline, runs })).toThrow(/^pipeline\.json: runs\[0\]\.run_time is not a run time/);
  });
  it("rejects a negative or fractional archive count", () => {
    const negative = { ...pipeline, archive: { ...pipeline.archive, days: -1 } };
    expect(() => guardPipeline(negative)).toThrow(/^pipeline\.json: archive\.days is not a count/);
    const fractional = { ...pipeline, archive: { ...pipeline.archive, years: [{ year: 2024, days: 1.5, days_with_12z: 1 }] } };
    expect(() => guardPipeline(fractional)).toThrow(/^pipeline\.json: archive\.years\[0\]\.days is not a count/);
  });
  it("caps the runs where pipeline.schema.json does", () => {
    const schemaPath = fileURLToPath(new URL("../../../src/hailprint/schemas/pipeline.schema.json", import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { properties: { runs: { maxItems: number } } };
    expect(schema.properties.runs.maxItems).toBe(MAX_RUNS);
  });
  it("rejects a document without the archive key and accepts archive null", () => {
    expect(() => guardPipeline(without(pipeline, "archive"))).toThrow(/^pipeline\.json: archive/);
    expect(guardPipeline({ ...pipeline, archive: null }).archive).toBeNull();
  });
});

describe("guardOutline", () => {
  it("accepts a collection without a receipt and names county.geojson otherwise", () => {
    const outline = { type: "FeatureCollection", features: [] };
    expect(guardOutline(outline)).toBe(outline);
    expect(() => guardOutline({ type: "Feature" })).toThrow(/county\.geojson: type is not FeatureCollection/);
  });
});
