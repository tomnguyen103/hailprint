import { describe, expect, it } from "vitest";
import { guardIndex, guardOutline, guardPairs, guardReports, guardSwath, guardZipCounts } from "./guard";
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
    ["receipt", "features", "features.0.properties", "features.0.properties.threshold_mm", "features.0.geometry"],
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
});

describe("guardPairs", () => {
  it("rejects a dist_m list of the wrong length", () => {
    const bad = { ...pairs, reports: [{ ...pairs.reports[0], dist_m: [0, 1] }] };
    expect(() => guardPairs(bad)).toThrow(/pairs\.json: reports\[0\]\.dist_m has 2 entries for 1 classes/);
  });
});

describe("guardOutline", () => {
  it("accepts a collection without a receipt and names county.geojson otherwise", () => {
    const outline = { type: "FeatureCollection", features: [] };
    expect(guardOutline(outline)).toBe(outline);
    expect(() => guardOutline({ type: "Feature" })).toThrow(/county\.geojson: type is not FeatureCollection/);
  });
});
