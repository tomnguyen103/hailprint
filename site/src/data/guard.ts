// Runtime guards for the published files. Each guard throws DataError with the file name
// and the first missing or mistyped key, so the error state can name the problem.
// Each guard checks every key the site reads from that file, and nothing more.
import type { FeatureCollection, MultiPolygon } from "geojson";
import { METRO_FIPS } from "../impact/power";
import { DATE } from "../router";
import { STEPS } from "../time/step";
import type {
  Pairs,
  PipelineFile,
  PowerFile,
  ReportsFile,
  StormsIndex,
  SwathFile,
  WarningsFile,
  ZipCounts,
} from "./types";
import { DataError, PHENOMENA } from "./types";

type Rec = Record<string, unknown>;

/** The run log cap; `publish.MAX_RUNS` writes the same number. */
export const MAX_RUNS = 50;

/** The published file paths inside `site/data/`, as `storms.json` lists them; the schema `$defs` hold the same two patterns. */
export const GEOJSON_PATH = /^storms\/\d{4}-\d{2}-\d{2}\/[a-z-]+\.geojson$/;
export const JSON_PATH = /^storms\/\d{4}-\d{2}-\d{2}\/[a-z-]+\.json$/;
/** The index keys for the impact files, each a path or null. */
const IMPACT_FILES: [string, RegExp][] = [
  ["power", JSON_PATH],
  ["internet", JSON_PATH],
  ["warnings", GEOJSON_PATH],
];

/** A run time as `publish` writes it: UTC to the second, no fraction. */
const RUN_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function rec(file: string, value: unknown, path: string): Rec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DataError(file, `${path} is not an object`);
  }
  return value as Rec;
}

function list(file: string, value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new DataError(file, `${path} is not an array`);
  return value;
}

function str(file: string, value: unknown, path: string): string {
  if (typeof value !== "string") throw new DataError(file, `${path} is not a string`);
  return value;
}

function num(file: string, value: unknown, path: string): number {
  if (typeof value !== "number") throw new DataError(file, `${path} is not a number`);
  return value;
}

function numOrNull(file: string, value: unknown, path: string): void {
  if (value !== null) num(file, value, path);
}

function runTime(file: string, value: unknown, path: string): void {
  if (!RUN_TIME.test(str(file, value, path))) throw new DataError(file, `${path} is not a run time`);
}

/** A whole number of files or days, never negative. */
function count(file: string, value: unknown, path: string): void {
  const n = num(file, value, path);
  if (!Number.isInteger(n) || n < 0) throw new DataError(file, `${path} is not a count`);
}

function filePath(file: string, value: unknown, path: string, pattern: RegExp): void {
  if (!pattern.test(str(file, value, path))) throw new DataError(file, `${path} is not a published file path`);
}

/** The receipt every published file carries; the receipt list renders each key. */
export function guardReceipt(file: string, value: unknown, path = "receipt"): void {
  const receipt = rec(file, value, path);
  str(file, receipt["storm_date"], `${path}.storm_date`);
  list(file, receipt["sources"], `${path}.sources`).forEach((item, i) => {
    const source = rec(file, item, `${path}.sources[${i}]`);
    for (const key of ["source", "product", "file"]) str(file, source[key], `${path}.sources[${i}].${key}`);
  });
  for (const key of ["confidence", "run_time", "package_version"]) str(file, receipt[key], `${path}.${key}`);
}

export function guardIndex(value: unknown): StormsIndex {
  const file = "storms.json";
  const root = rec(file, value, "index");
  for (const key of ["confidence", "run_time", "package_version"]) str(file, root[key], key);
  num(file, root["radius_km_default"], "radius_km_default");
  list(file, root["storms"], "storms").forEach((item, i) => {
    const at = `storms[${i}]`;
    const storm = rec(file, item, at);
    if (!DATE.test(str(file, storm["storm_date"], `${at}.storm_date`))) {
      throw new DataError(file, `${at}.storm_date is not a date`);
    }
    for (const key of ["report_count", "scored_reports", "excluded_reports"]) num(file, storm[key], `${at}.${key}`);
    for (const key of ["max_size_in", "max_mesh_mm"]) numOrNull(file, storm[key], `${at}.${key}`);
    str(file, storm["report_source"], `${at}.report_source`);
    list(file, storm["table"], `${at}.table`);
    const files = rec(file, storm["files"], `${at}.files`);
    for (const key of ["swath", "reports"]) filePath(file, files[key], `${at}.files.${key}`, GEOJSON_PATH);
    filePath(file, files["pairs"], `${at}.files.pairs`, JSON_PATH);
    // The impact keys have no default: a missing key is undefined, and filePath throws on it.
    for (const [key, pattern] of IMPACT_FILES) {
      if (files[key] !== null) filePath(file, files[key], `${at}.files.${key}`, pattern);
    }
    if (files["zip_counts"] !== null) filePath(file, files["zip_counts"], `${at}.files.zip_counts`, JSON_PATH);
  });
  return value as StormsIndex;
}

function date(file: string, value: unknown, path: string): void {
  if (!DATE.test(str(file, value, path))) throw new DataError(file, `${path} is not a date`);
}

function dates(file: string, value: unknown, path: string): void {
  list(file, value, path).forEach((v, j) => date(file, v, `${path}[${j}]`));
}

export function guardPipeline(value: unknown): PipelineFile {
  const file = "pipeline.json";
  const root = rec(file, value, "pipeline");
  for (const key of ["confidence", "package_version"]) str(file, root[key], key);
  runTime(file, root["run_time"], "run_time");
  const runs = list(file, root["runs"], "runs");
  if (runs.length > MAX_RUNS) throw new DataError(file, `runs has ${runs.length} entries, more than ${MAX_RUNS}`);
  runs.forEach((item, i) => {
    const at = `runs[${i}]`;
    const run = rec(file, item, at);
    str(file, run["package_version"], `${at}.package_version`);
    runTime(file, run["run_time"], `${at}.run_time`);
    dates(file, run["storm_dates"], `${at}.storm_dates`);
    count(file, run["file_count"], `${at}.file_count`);
  });
  if (!("archive" in root)) throw new DataError(file, "archive is missing");
  if (root["archive"] !== null) {
    const archive = rec(file, root["archive"], "archive");
    for (const key of ["days", "days_without_12z"]) count(file, archive[key], `archive.${key}`);
    for (const key of ["first_storm_date", "last_storm_date"]) date(file, archive[key], `archive.${key}`);
    list(file, archive["years"], "archive.years").forEach((item, i) => {
      const at = `archive.years[${i}]`;
      const year = rec(file, item, at);
      num(file, year["year"], `${at}.year`);
      for (const key of ["days", "days_with_12z"]) count(file, year[key], `${at}.${key}`);
    });
  }
  list(file, root["sources"], "sources").forEach((item, i) => {
    const at = `sources[${i}]`;
    const source = rec(file, item, at);
    for (const key of ["source", "product"]) str(file, source[key], `${at}.${key}`);
    dates(file, source["storm_dates"], `${at}.storm_dates`);
  });
  return value as PipelineFile;
}

export function guardPairs(value: unknown): Pairs {
  const file = "pairs.json";
  const root = rec(file, value, "pairs");
  guardReceipt(file, root["receipt"]);
  num(file, root["radius_km_default"], "radius_km_default");
  num(file, root["radius_km_max"], "radius_km_max");
  num(file, root["edge_margin_m"], "edge_margin_m");
  const classes = list(file, root["classes"], "classes");
  classes.forEach((item, i) => {
    const at = `classes[${i}]`;
    const cls = rec(file, item, at);
    for (const key of ["threshold_mm", "threshold_in", "swath_km2"]) num(file, cls[key], `${at}.${key}`);
    str(file, cls["label"], `${at}.label`);
    list(file, cls["unverifiable_km2"], `${at}.unverifiable_km2`).forEach((v, j) =>
      num(file, v, `${at}.unverifiable_km2[${j}]`),
    );
  });
  list(file, root["reports"], "reports").forEach((item, i) => {
    const at = `reports[${i}]`;
    const report = rec(file, item, at);
    for (const key of ["id", "size_in", "edge_m"]) num(file, report[key], `${at}.${key}`);
    const dist = list(file, report["dist_m"], `${at}.dist_m`);
    if (dist.length !== classes.length) {
      throw new DataError(file, `${at}.dist_m has ${dist.length} entries for ${classes.length} classes`);
    }
    dist.forEach((v, j) => numOrNull(file, v, `${at}.dist_m[${j}]`));
  });
  return value as Pairs;
}

export function guardZipCounts(value: unknown): ZipCounts {
  const file = "zip-counts.json";
  const root = rec(file, value, "zip counts");
  guardReceipt(file, root["receipt"]);
  list(file, root["classes"], "classes").forEach((item, i) => {
    const at = `classes[${i}]`;
    const cls = rec(file, item, at);
    for (const key of ["threshold_mm", "threshold_in", "parcel_count"]) num(file, cls[key], `${at}.${key}`);
  });
  list(file, root["zips"], "zips").forEach((item, i) => {
    const at = `zips[${i}]`;
    const row = rec(file, item, at);
    str(file, row["zip"], `${at}.zip`);
    for (const key of ["threshold_mm", "parcel_count"]) num(file, row[key], `${at}.${key}`);
  });
  return value as ZipCounts;
}

/** A FeatureCollection whose features each carry `properties` and `geometry.coordinates`. */
function guardCollection(file: string, value: unknown): Rec[] {
  const root = rec(file, value, "collection");
  if (root["type"] !== "FeatureCollection") throw new DataError(file, "type is not FeatureCollection");
  return list(file, root["features"], "features").map((item, i) => {
    const at = `features[${i}]`;
    const feature = rec(file, item, at);
    const geometry = rec(file, feature["geometry"], `${at}.geometry`);
    list(file, geometry["coordinates"], `${at}.geometry.coordinates`);
    return rec(file, feature["properties"], `${at}.properties`);
  });
}

export function guardReports(value: unknown): ReportsFile {
  const file = "reports.geojson";
  guardReceipt(file, rec(file, value, "collection")["receipt"]);
  guardCollection(file, value).forEach((props, i) => {
    for (const key of ["time", "location"]) str(file, props[key], `features[${i}].properties.${key}`);
    for (const key of ["id", "size_in"]) num(file, props[key], `features[${i}].properties.${key}`);
  });
  return value as ReportsFile;
}

export function guardSwath(value: unknown): SwathFile {
  const file = "swath.geojson";
  guardReceipt(file, rec(file, value, "collection")["receipt"]);
  guardCollection(file, value).forEach((props, i) => {
    num(file, props["threshold_mm"], `features[${i}].properties.threshold_mm`);
    num(file, props["threshold_in"], `features[${i}].properties.threshold_in`);
  });
  guardMultiPolygons(file, value);
  return value as SwathFile;
}

function isPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Every feature geometry is a MultiPolygon whose rings each hold 4 or more finite [x, y] positions. */
function guardMultiPolygons(file: string, value: unknown): void {
  list(file, rec(file, value, "collection")["features"], "features").forEach((item, i) => {
    const at = `features[${i}].geometry`;
    const geometry = rec(file, rec(file, item, `features[${i}]`)["geometry"], at);
    if (geometry["type"] !== "MultiPolygon") throw new DataError(file, `${at}.type is not MultiPolygon`);
    list(file, geometry["coordinates"], `${at}.coordinates`).forEach((polygon, p) => {
      list(file, polygon, `${at}.coordinates[${p}]`).forEach((ring, r) => {
        const path = `${at}.coordinates[${p}][${r}]`;
        const positions = list(file, ring, path);
        if (positions.length < 4 || !positions.every(isPosition)) {
          throw new DataError(file, `${path} is not a ring of 4 or more finite [x, y] positions`);
        }
      });
    });
  });
}

/** The property keys a warning feature may carry, the same seven as the warnings schema. */
const WARNING_KEYS = [
  "phenomena",
  "significance",
  "event_label",
  "eventid",
  "polygon_begin",
  "polygon_end",
  "product_id",
];

export function guardWarnings(value: unknown): WarningsFile {
  const file = "warnings.geojson";
  guardReceipt(file, rec(file, value, "collection")["receipt"]);
  guardCollection(file, value).forEach((props, i) => {
    const at = `features[${i}].properties`;
    for (const key of Object.keys(props)) {
      if (!WARNING_KEYS.includes(key)) throw new DataError(file, `${at}.${key} is not an allowed property`);
    }
    if (!(PHENOMENA as readonly string[]).includes(str(file, props["phenomena"], `${at}.phenomena`))) {
      throw new DataError(file, `${at}.phenomena is not SV, TO, or FF`);
    }
    if (props["significance"] !== "W") throw new DataError(file, `${at}.significance is not W`);
    for (const key of ["event_label", "product_id"]) str(file, props[key], `${at}.${key}`);
    count(file, props["eventid"], `${at}.eventid`);
    for (const key of ["polygon_begin", "polygon_end"]) runTime(file, props[key], `${at}.${key}`);
  });
  guardMultiPolygons(file, value);
  return value as WarningsFile;
}

/** The window start: 12:00 UTC on the storm date, as `power.schema.json` pins it. */
const WINDOW_START = /^\d{4}-\d{2}-\d{2}T12:00:00Z$/;

/** A customers-out value: a whole count, or null where the source has no row. Never NaN, never a string. */
function outValue(file: string, value: unknown, path: string): void {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new DataError(file, `${path} is not a count or null`);
  }
}

export function guardPower(value: unknown): PowerFile {
  const file = "power.json";
  const root = rec(file, value, "power");
  guardReceipt(file, root["receipt"]);
  const window = rec(file, root["window"], "window");
  if (!WINDOW_START.test(str(file, window["start"], "window.start"))) {
    throw new DataError(file, "window.start is not 12:00 UTC");
  }
  if (window["step_minutes"] !== 15) throw new DataError(file, "window.step_minutes is not 15");
  if (window["steps"] !== STEPS) throw new DataError(file, `window.steps is not ${STEPS}`);
  if (root["source"] !== "eaglei" && root["source"] !== "odin") {
    throw new DataError(file, "source is not eaglei or odin");
  }
  if (root["source"] === "eaglei") {
    if (root["utilities"] !== null) throw new DataError(file, "utilities is not null");
  } else if (list(file, root["utilities"], "utilities").length === 0) {
    throw new DataError(file, "utilities is empty");
  } else {
    (root["utilities"] as unknown[]).forEach((item, i) => str(file, item, `utilities[${i}]`));
  }
  const counties = list(file, root["counties"], "counties");
  if (counties.length !== METRO_FIPS.length) {
    throw new DataError(file, `counties has ${counties.length} entries, not ${METRO_FIPS.length}`);
  }
  counties.forEach((item, i) => {
    const at = `counties[${i}]`;
    const county = rec(file, item, at);
    if (county["fips"] !== METRO_FIPS[i]) throw new DataError(file, `${at}.fips is not ${METRO_FIPS[i]}`);
    str(file, county["name"], `${at}.name`);
    const customers = num(file, county["customers"], `${at}.customers`);
    if (!Number.isInteger(customers) || customers < 1) {
      throw new DataError(file, `${at}.customers is not a count of 1 or more`);
    }
    const out = list(file, county["out"], `${at}.out`);
    if (out.length !== STEPS) throw new DataError(file, `${at}.out has ${out.length} values, not ${STEPS}`);
    for (let step = 0; step < out.length; step++) outValue(file, out[step], `${at}.out[${step}]`);
  });
  return value as PowerFile;
}

/** The committed county outline: a FeatureCollection with no receipt. */
export function guardOutline(value: unknown): FeatureCollection<MultiPolygon> {
  guardCollection("counties.geojson", value);
  return value as FeatureCollection<MultiPolygon>;
}
