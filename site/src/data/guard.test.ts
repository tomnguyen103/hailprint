import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { fetchJson, setFetch } from "./fetch";
import {
  GEOJSON_PATH,
  JSON_PATH,
  MAX_RUNS,
  guardIndex,
  guardInternet,
  guardOutline,
  guardPairs,
  guardPipeline,
  guardPower,
  guardReports,
  guardSwath,
  guardWarnings,
  guardZipCounts,
} from "./guard";
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
    power: null,
    internet: null,
    warnings: null,
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

const warningProps = {
  phenomena: "SV",
  significance: "W",
  event_label: "Severe Thunderstorm Warning",
  eventid: 101,
  polygon_begin: "2024-05-29T00:00:00Z",
  polygon_end: "2024-05-29T01:00:00Z",
  product_id: "202405290000-KHGX-WUUS54-SVRHGX",
};

const warnings = {
  type: "FeatureCollection",
  receipt,
  features: [{ type: "Feature", properties: warningProps, geometry: { type: "MultiPolygon", coordinates: [] } }],
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
      "storms.0.files.power",
      "storms.0.files.internet",
      "storms.0.files.warnings",
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
      "features.0.properties.id",
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
  it("accepts an impact key as a path or null and rejects a path of the wrong kind", () => {
    const files = {
      ...storm.files,
      power: "storms/2024-05-28/power.json",
      internet: null,
      warnings: "storms/2024-05-28/warnings.geojson",
    };
    expect(guardIndex({ ...index, storms: [{ ...storm, files }] }).storms[0]!.files.power).toBe(files.power);
    const swapped = { ...storm.files, power: "storms/2024-05-28/power.geojson" };
    expect(() => guardIndex({ ...index, storms: [{ ...storm, files: swapped }] })).toThrow(/files.power/);
    const json = { ...storm.files, warnings: "storms/2024-05-28/warnings.json" };
    expect(() => guardIndex({ ...index, storms: [{ ...storm, files: json }] })).toThrow(/files.warnings/);
  });
  it("accepts the file paths that storms.schema.json accepts and rejects the ones it rejects", () => {
    const schemaPath = fileURLToPath(new URL("../../../src/hailprint/schemas/storms.schema.json", import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $defs: Record<string, { pattern: string }> };
    const geojson = new RegExp(schema.$defs["geojson_file"]!.pattern);
    const json = new RegExp(schema.$defs["json_file"]!.pattern);
    const cases: [RegExp, RegExp, string[]][] = [
      [GEOJSON_PATH, geojson, ["storms/2024-05-28/swath.geojson", "storms/2024-05-28/reports.geojson"]],
      [JSON_PATH, json, ["storms/2024-05-28/pairs.json", "storms/2024-05-28/zip-counts.json"]],
    ];
    const bad = [
      "storms/x/pairs.json",
      "../secret.json",
      "storms/2024-05-28/pairs.txt",
      "storms/2024-05-28/swath.json",
      "storms/2024-05-28/pairs.geojson",
    ];
    for (const [ours, theirs, good] of cases) {
      for (const path of good) {
        expect(ours.test(path)).toBe(true);
        expect(theirs.test(path)).toBe(true);
      }
      for (const path of bad) expect(ours.test(path)).toBe(theirs.test(path));
      expect(ours.test("../secret.json")).toBe(false);
      expect(ours.test("storms/x/pairs.json")).toBe(false);
    }
  });
  it("rejects a pairs path with the geojson extension", () => {
    const files = { ...storm.files, pairs: "storms/2024-05-28/pairs.geojson" };
    expect(() => guardIndex({ ...index, storms: [{ ...storm, files }] })).toThrow(/files\.pairs/);
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

describe("the MultiPolygon rings", () => {
  const RING = [
    [-95.5, 29.7],
    [-95.4, 29.7],
    [-95.4, 29.8],
    [-95.5, 29.7],
  ];
  const withRing = (ring: unknown) => ({
    ...swath,
    features: [{ ...swath.features[0], geometry: { type: "MultiPolygon", coordinates: [[ring]] } }],
  });

  it("accepts a ring of four finite positions", () => {
    const good = withRing(RING);
    expect(guardSwath(good)).toBe(good);
  });

  it("rejects a ring of fewer than four positions", () => {
    expect(() => guardSwath(withRing(RING.slice(0, 3)))).toThrow(
      /^swath\.geojson: features\[0\]\.geometry\.coordinates\[0\]\[0\] is not a ring of 4 or more finite/,
    );
  });

  it.each([
    ["a null position", [...RING.slice(0, 3), null]],
    ["a non-finite number", [...RING.slice(0, 3), [-95.5, Infinity]]],
    ["a string coordinate", [...RING.slice(0, 3), ["-95.5", 29.7]]],
    ["a three-number position", [...RING.slice(0, 3), [-95.5, 29.7, 12]]],
  ])("rejects a ring with %s", (_name, ring) => {
    expect(() => guardSwath(withRing(ring))).toThrow(/geometry\.coordinates\[0\]\[0\] is not a ring/);
  });

  it("rejects a ring that is not an array, in a warnings file too", () => {
    const feature = { ...warnings.features[0], geometry: { type: "MultiPolygon", coordinates: [[RING.slice(0, 3)]] } };
    expect(() => guardWarnings({ ...warnings, features: [feature] })).toThrow(
      /^warnings\.geojson: features\[0\]\.geometry\.coordinates\[0\]\[0\] is not a ring/,
    );
    expect(() => guardSwath(withRing("ring"))).toThrow(/coordinates\[0\]\[0\] is not an array/);
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
  it("accepts a collection without a receipt and names counties.geojson otherwise", () => {
    const outline = { type: "FeatureCollection", features: [] };
    expect(guardOutline(outline)).toBe(outline);
    expect(() => guardOutline({ type: "Feature" })).toThrow(/counties\.geojson: type is not FeatureCollection/);
  });
});

describe("guardWarnings", () => {
  afterEach(() => setFetch(null));

  const withProps = (props: Record<string, unknown>) => ({
    ...warnings,
    features: [{ ...warnings.features[0], properties: { ...warningProps, ...props } }],
  });

  it("accepts a file whose properties match the allow-list", () => {
    expect(guardWarnings(warnings)).toBe(warnings);
  });

  it("throws on a property outside the allow-list", () => {
    expect(() => guardWarnings(withProps({ wfo: "HGX" }))).toThrow(
      /^warnings\.geojson: features\[0\]\.properties\.wfo is not an allowed property/,
    );
  });

  it("throws on a phenomena code other than SV, TO, and FF", () => {
    expect(() => guardWarnings(withProps({ phenomena: "WS" }))).toThrow(/^warnings\.geojson: features\[0\]\.properties\.phenomena/);
  });

  it("throws on a time that is not UTC to the second", () => {
    expect(() => guardWarnings(withProps({ polygon_end: "2024-05-29 01:00" }))).toThrow(
      /^warnings\.geojson: features\[0\]\.properties\.polygon_end is not a run time/,
    );
  });

  it("throws on a geometry that is not a MultiPolygon", () => {
    const feature = { ...warnings.features[0], geometry: { type: "Point", coordinates: [] } };
    expect(() => guardWarnings({ ...warnings, features: [feature] })).toThrow(
      /^warnings\.geojson: features\[0\]\.geometry\.type is not MultiPolygon/,
    );
  });

  it("answers a 404 with a DataError and no other throw", async () => {
    setFetch(async () => new Response("nope", { status: 404 }));
    const promise = fetchJson("storms/2024-05-28/warnings.geojson", guardWarnings);
    await expect(promise).rejects.toBeInstanceOf(DataError);
    await expect(promise).rejects.toThrow(/^warnings\.geojson: HTTP 404/);
  });
});

describe("guardPower", () => {
  afterEach(() => setFetch(null));

  const METRO: [string, string, number][] = [
    ["48201", "Harris", 1_827_686],
    ["48157", "Fort Bend", 694_780],
    ["48339", "Montgomery", 230_040],
    ["48039", "Brazoria", 144_164],
    ["48167", "Galveston", 144_421],
    ["48473", "Waller", 18_532],
    ["48291", "Liberty", 44_189],
    ["48071", "Chambers", 26_381],
  ];
  const power = {
    receipt,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    source: "eaglei",
    utilities: null,
    counties: METRO.map(([fips, name, customers]) => ({
      fips,
      name,
      customers,
      out: Array.from({ length: 192 }, (_, i) => (i % 5 === 0 ? null : i)),
    })),
  };
  const withCounty = (patch: Record<string, unknown>, at = 0) => ({
    ...power,
    counties: power.counties.map((c, i) => (i === at ? { ...c, ...patch } : c)),
  });

  it("accepts a valid EAGLE-I file with gaps and an ODIN file with utilities", () => {
    expect(guardPower(power)).toBe(power);
    const odin = { ...power, source: "odin", utilities: ["CenterPoint"] };
    expect(guardPower(odin)).toBe(odin);
  });

  it("throws on 191 values, 193 values, and a value that is not a count", () => {
    const out = power.counties[0]!.out;
    expect(() => guardPower(withCounty({ out: out.slice(1) }))).toThrow(/^power\.json: counties\[0\]\.out has 191 values/);
    expect(() => guardPower(withCounty({ out: [...out, 1] }))).toThrow(/^power\.json: counties\[0\]\.out has 193 values/);
    expect(() => guardPower(withCounty({ out: out.map((v, i) => (i === 7 ? -1 : v)) }))).toThrow(
      /^power\.json: counties\[0\]\.out\[7\] is not a count or null/,
    );
    expect(() => guardPower(withCounty({ out: out.map((v, i) => (i === 7 ? 1.5 : v)) }))).toThrow(/out\[7\] is not a count or null/);
  });

  it("throws on NaN, a string, and undefined, never reading them as a gap", () => {
    const out = power.counties[1]!.out;
    for (const bad of [Number.NaN, "7", undefined]) {
      expect(() => guardPower(withCounty({ out: out.map((v, i) => (i === 3 ? bad : v)) }, 1))).toThrow(
        /^power\.json: counties\[1\]\.out\[3\] is not a count or null/,
      );
    }
  });

  it("throws on a wrong FIPS set, a wrong order, and a wrong county count", () => {
    expect(() => guardPower(withCounty({ fips: "48999" }))).toThrow(/^power\.json: counties\[0\]\.fips is not 48201/);
    const swapped = { ...power, counties: [power.counties[1], power.counties[0], ...power.counties.slice(2)] };
    expect(() => guardPower(swapped)).toThrow(/^power\.json: counties\[0\]\.fips is not 48201/);
    expect(() => guardPower({ ...power, counties: power.counties.slice(1) })).toThrow(/^power\.json: counties has 7 entries/);
  });

  it("throws on a customers value below 1 and on a missing name", () => {
    expect(() => guardPower(withCounty({ customers: 0 }))).toThrow(/^power\.json: counties\[0\]\.customers is not a count of 1 or more/);
    expect(() => guardPower(withCounty({ name: undefined }))).toThrow(/^power\.json: counties\[0\]\.name is not a string/);
  });

  it("throws on a source outside eaglei and odin, and on a utilities list that does not match", () => {
    expect(() => guardPower({ ...power, source: "iem" })).toThrow(/^power\.json: source is not eaglei or odin/);
    expect(() => guardPower({ ...power, utilities: ["CenterPoint"] })).toThrow(/^power\.json: utilities is not null/);
    expect(() => guardPower({ ...power, source: "odin", utilities: null })).toThrow(/^power\.json: utilities is not an array/);
    expect(() => guardPower({ ...power, source: "odin", utilities: [] })).toThrow(/^power\.json: utilities is empty/);
  });

  it("throws on a window that is not 192 steps of 15 minutes from 12:00 UTC", () => {
    expect(() => guardPower({ ...power, window: { ...power.window, steps: 96 } })).toThrow(/^power\.json: window\.steps is not 192/);
    expect(() => guardPower({ ...power, window: { ...power.window, step_minutes: 5 } })).toThrow(/window\.step_minutes is not 15/);
    expect(() => guardPower({ ...power, window: { ...power.window, start: "2024-05-28T00:00:00Z" } })).toThrow(
      /window\.start is not 12:00 UTC/,
    );
  });

  it("throws when the receipt is missing", () => {
    expect(() => guardPower(without(power, "receipt"))).toThrow(/^power\.json: receipt is not an object/);
  });

  it("answers a 404 with a DataError and no other throw", async () => {
    setFetch(async () => new Response("nope", { status: 404 }));
    const promise = fetchJson("storms/2024-05-28/power.json", guardPower);
    await expect(promise).rejects.toBeInstanceOf(DataError);
    await expect(promise).rejects.toThrow(/^power\.json: HTTP 404/);
  });
});

describe("guardInternet", () => {
  afterEach(() => setFetch(null));

  const METRO: [string, string][] = [
    ["48201", "Harris"],
    ["48157", "Fort Bend"],
    ["48339", "Montgomery"],
    ["48039", "Brazoria"],
    ["48167", "Galveston"],
    ["48473", "Waller"],
    ["48291", "Liberty"],
    ["48071", "Chambers"],
  ];
  const internet = {
    receipt,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    signal: "ping-slash24",
    baseline_days: 7,
    counties: METRO.map(([fips, name]) => ({
      fips,
      name,
      baseline: 96.5,
      ratio: Array.from({ length: 192 }, (_, i) => (i % 5 === 0 ? null : 1 - (i % 7) / 100)),
    })),
  };
  const withCounty = (patch: Record<string, unknown>, at = 0) => ({
    ...internet,
    counties: internet.counties.map((c, i) => (i === at ? { ...c, ...patch } : c)),
  });

  it("accepts a valid file with gaps, a null baseline, and a ratio above 1", () => {
    expect(guardInternet(internet)).toBe(internet);
    const quiet = withCounty({ baseline: null, ratio: Array<number | null>(192).fill(null) }, 2);
    expect(guardInternet(quiet)).toBe(quiet);
    const above = withCounty({ ratio: Array<number>(192).fill(1.3) });
    expect(guardInternet(above)).toBe(above);
  });

  it("throws on 191 values, 193 values, and a value that is not a ratio", () => {
    const ratio = internet.counties[0]!.ratio;
    expect(() => guardInternet(withCounty({ ratio: ratio.slice(1) }))).toThrow(/^internet\.json: counties\[0\]\.ratio has 191 values/);
    expect(() => guardInternet(withCounty({ ratio: [...ratio, 1] }))).toThrow(/^internet\.json: counties\[0\]\.ratio has 193 values/);
    expect(() => guardInternet(withCounty({ ratio: ratio.map((v, i) => (i === 7 ? -0.1 : v)) }))).toThrow(
      /^internet\.json: counties\[0\]\.ratio\[7\] is not a ratio or null/,
    );
  });

  it("throws on NaN, Infinity, a string, and undefined, never reading them as a gap", () => {
    const ratio = internet.counties[1]!.ratio;
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "0.9", undefined]) {
      expect(() => guardInternet(withCounty({ ratio: ratio.map((v, i) => (i === 3 ? bad : v)) }, 1))).toThrow(
        /^internet\.json: counties\[1\]\.ratio\[3\] is not a ratio or null/,
      );
    }
  });

  it("throws on a baseline that is negative, a string, or missing", () => {
    expect(() => guardInternet(withCounty({ baseline: -1 }))).toThrow(/^internet\.json: counties\[0\]\.baseline is below 0/);
    expect(() => guardInternet(withCounty({ baseline: "96" }))).toThrow(/^internet\.json: counties\[0\]\.baseline is not a number/);
    expect(() => guardInternet(withCounty({ baseline: undefined }))).toThrow(/counties\[0\]\.baseline is not a number/);
  });

  it("throws on a wrong FIPS set, a wrong order, and a wrong county count", () => {
    expect(() => guardInternet(withCounty({ fips: "48999" }))).toThrow(/^internet\.json: counties\[0\]\.fips is not 48201/);
    const swapped = { ...internet, counties: [internet.counties[1], internet.counties[0], ...internet.counties.slice(2)] };
    expect(() => guardInternet(swapped)).toThrow(/^internet\.json: counties\[0\]\.fips is not 48201/);
    expect(() => guardInternet({ ...internet, counties: internet.counties.slice(1) })).toThrow(
      /^internet\.json: counties has 7 entries/,
    );
  });

  it("throws on a missing name", () => {
    expect(() => guardInternet(withCounty({ name: undefined }))).toThrow(/^internet\.json: counties\[0\]\.name is not a string/);
  });

  it("throws on a signal other than ping-slash24 and on a baseline length other than 7 days", () => {
    expect(() => guardInternet({ ...internet, signal: "bgp" })).toThrow(/^internet\.json: signal is not ping-slash24/);
    expect(() => guardInternet({ ...internet, baseline_days: 14 })).toThrow(/^internet\.json: baseline_days is not 7/);
  });

  it("throws on a window that is not 192 steps of 15 minutes from 12:00 UTC", () => {
    expect(() => guardInternet({ ...internet, window: { ...internet.window, steps: 96 } })).toThrow(
      /^internet\.json: window\.steps is not 192/,
    );
    expect(() => guardInternet({ ...internet, window: { ...internet.window, step_minutes: 5 } })).toThrow(
      /window\.step_minutes is not 15/,
    );
    expect(() => guardInternet({ ...internet, window: { ...internet.window, start: "2024-05-28T00:00:00Z" } })).toThrow(
      /window\.start is not 12:00 UTC/,
    );
  });

  it("throws when the receipt is missing", () => {
    expect(() => guardInternet(without(internet, "receipt"))).toThrow(/^internet\.json: receipt is not an object/);
  });

  it("answers a 404 with a DataError and no other throw", async () => {
    setFetch(async () => new Response("nope", { status: 404 }));
    const promise = fetchJson("storms/2024-05-28/internet.json", guardInternet);
    await expect(promise).rejects.toBeInstanceOf(DataError);
    await expect(promise).rejects.toThrow(/^internet\.json: HTTP 404/);
  });
});
