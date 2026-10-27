// Runtime guards for the published files. Each guard throws DataError with the file name
// and the first missing or mistyped key, so the error state can name the problem.
import type { Pairs, ReportsFile, StormsIndex, SwathFile, ZipCounts } from "./types";
import { DataError } from "./types";

type Rec = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

export function guardIndex(value: unknown): StormsIndex {
  const file = "storms.json";
  const root = rec(file, value, "index");
  num(file, root["radius_km_default"], "radius_km_default");
  list(file, root["storms"], "storms").forEach((item, i) => {
    const storm = rec(file, item, `storms[${i}]`);
    const date = str(file, storm["storm_date"], `storms[${i}].storm_date`);
    if (!DATE.test(date)) throw new DataError(file, `storms[${i}].storm_date is not a date`);
    list(file, storm["table"], `storms[${i}].table`);
    const files = rec(file, storm["files"], `storms[${i}].files`);
    for (const key of ["swath", "reports", "pairs"]) {
      str(file, files[key], `storms[${i}].files.${key}`);
    }
  });
  return value as StormsIndex;
}

export function guardPairs(value: unknown): Pairs {
  const file = "pairs.json";
  const root = rec(file, value, "pairs");
  rec(file, root["receipt"], "receipt");
  num(file, root["radius_km_max"], "radius_km_max");
  num(file, root["edge_margin_m"], "edge_margin_m");
  list(file, root["classes"], "classes").forEach((item, i) => {
    const cls = rec(file, item, `classes[${i}]`);
    num(file, cls["threshold_mm"], `classes[${i}].threshold_mm`);
    list(file, cls["unverifiable_km2"], `classes[${i}].unverifiable_km2`);
  });
  list(file, root["reports"], "reports").forEach((item, i) => {
    const report = rec(file, item, `reports[${i}]`);
    num(file, report["size_in"], `reports[${i}].size_in`);
    num(file, report["edge_m"], `reports[${i}].edge_m`);
    list(file, report["dist_m"], `reports[${i}].dist_m`);
  });
  return value as Pairs;
}

export function guardZipCounts(value: unknown): ZipCounts {
  const file = "zip-counts.json";
  const root = rec(file, value, "zip counts");
  rec(file, root["receipt"], "receipt");
  list(file, root["classes"], "classes");
  list(file, root["zips"], "zips");
  return value as ZipCounts;
}

function guardCollection(file: string, value: unknown): Rec {
  const root = rec(file, value, "collection");
  if (root["type"] !== "FeatureCollection") throw new DataError(file, "type is not FeatureCollection");
  rec(file, root["receipt"], "receipt");
  list(file, root["features"], "features");
  return root;
}

export function guardReports(value: unknown): ReportsFile {
  guardCollection("reports.geojson", value);
  return value as ReportsFile;
}

export function guardSwath(value: unknown): SwathFile {
  guardCollection("swath.geojson", value);
  return value as SwathFile;
}