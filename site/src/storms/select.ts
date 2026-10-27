// Pure selectors for the Storms workspace. No Preact import.
import type { Metric, Storm, ZipCounts } from "../data/types";
import { RULER } from "../ruler";

export const NULL_METRIC_TEXT = "undefined, zero denominator";
export const BELOW_FIRST_CLASS = "below 0.75 in";

/** Years newest first; dates newest first inside each year. */
export function groupByYear(storms: readonly Storm[]): { year: string; storms: Storm[] }[] {
  const byYear = new Map<string, Storm[]>();
  for (const storm of storms) {
    const year = storm.storm_date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), storm]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, list]) => ({
      year,
      storms: [...list].sort((a, b) => b.storm_date.localeCompare(a.storm_date)),
    }));
}

/** The ZIP rows of one class, largest count first, ZIP ascending on a tie. */
export function zipRows(zip: ZipCounts, thresholdMm: number): { zip: string; parcel_count: number }[] {
  return zip.zips
    .filter((row) => row.threshold_mm === thresholdMm)
    .map(({ zip, parcel_count }) => ({ zip, parcel_count }))
    .sort((a, b) => b.parcel_count - a.parcel_count || a.zip.localeCompare(b.zip));
}

/** A metric to two decimals; null gives an en dash and the hidden explanation. */
export function metricText(value: Metric): { text: string; hidden: string | null } {
  return value === null ? { text: "\u2013", hidden: NULL_METRIC_TEXT } : { text: value.toFixed(2), hidden: null };
}

/** The object name of the largest size class at or below `inches`. */
export function objectForSize(inches: number): string {
  let name = BELOW_FIRST_CLASS;
  for (const mark of RULER) if (inches >= mark.threshold_in) name = mark.object;
  return name;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatInches(inches: number): string {
  return `${inches.toFixed(2)} in`;
}