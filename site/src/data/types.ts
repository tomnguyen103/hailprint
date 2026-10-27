import type { FeatureCollection, MultiPolygon, Point } from "geojson";

// Types for the published files under site/data/. The shapes follow
// src/hailprint/schemas/ and publish.py; the guards in guard.ts check them at read time.

export class DataError extends Error {
  constructor(
    public file: string,
    public reason: string,
  ) {
    super(`${file}: ${reason}`);
    this.name = "DataError";
  }
}

export type Metric = number | null;

export interface Receipt {
  storm_date: string;
  sources: { source: string; product: string; file: string }[];
  confidence: string;
  run_time: string;
  package_version: string;
}

export interface TableRow {
  threshold_mm: number;
  threshold_in: number;
  label: string;
  hits: number;
  misses: number;
  false_alarms: number;
  correct_negatives: number;
  pod: Metric;
  far: Metric;
  csi: Metric;
  hss: Metric;
  swath_km2: number;
  unverifiable_km2: number;
}

export interface StormFiles {
  swath: string;
  reports: string;
  pairs: string;
  zip_counts: string | null;
}

export interface Storm {
  storm_date: string;
  report_count: number;
  max_size_in: number | null;
  report_source: string;
  max_mesh_mm: number | null;
  scored_reports: number;
  excluded_reports: number;
  table: TableRow[];
  parcel_total: number | null;
  files: StormFiles;
}

export interface StormsIndex {
  confidence: string;
  run_time: string;
  package_version: string;
  radius_km_default: number;
  storms: Storm[];
}

export interface PairsClass {
  threshold_mm: number;
  threshold_in: number;
  label: string;
  swath_km2: number;
  unverifiable_km2: number[];
}

export interface PairsReport {
  id: number;
  size_in: number;
  edge_m: number;
  dist_m: (number | null)[];
}

export interface Pairs {
  receipt: Receipt;
  radius_km_default: number;
  radius_km_max: number;
  edge_margin_m: number;
  classes: PairsClass[];
  reports: PairsReport[];
}

export interface ZipCounts {
  receipt: Receipt;
  classes: { threshold_mm: number; threshold_in: number; label: string; parcel_count: number }[];
  zips: { zip: string; threshold_mm: number; parcel_count: number }[];
}

export interface ReportProps {
  id: number;
  time: string;
  location: string;
  county: string;
  state: string;
  size_in: number;
}

export interface SwathProps {
  threshold_mm: number;
  threshold_in: number;
  label: string;
  area_km2: number;
}

export interface ReportsFile extends FeatureCollection<Point, ReportProps> {
  receipt: Receipt;
}

export interface SwathFile extends FeatureCollection<MultiPolygon, SwathProps> {
  receipt: Receipt;
}

/** One `publish` run in the run log, newest first in `pipeline.json`. */
export interface PipelineRun {
  run_time: string;
  package_version: string;
  storm_dates: string[];
  file_count: number;
}

export interface ArchiveYear {
  year: number;
  days: number;
  days_with_12z: number;
}

/** Archive coverage from the archive index; null until `hailprint index` ran. */
export interface ArchiveSummary {
  days: number;
  first_storm_date: string;
  last_storm_date: string;
  days_without_12z: number;
  years: ArchiveYear[];
}

export interface SourceRow {
  source: string;
  product: string;
  storm_dates: string[];
}

export interface PipelineFile {
  confidence: string;
  run_time: string;
  package_version: string;
  runs: PipelineRun[];
  archive: ArchiveSummary | null;
  sources: SourceRow[];
}
