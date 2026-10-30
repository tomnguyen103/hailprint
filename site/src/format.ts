// Shared display helpers and metric keys. Pure, no Preact import.
import type { Metric } from "./data/types";

export const NULL_METRIC_TEXT = "undefined, zero denominator";
export const BELOW_FIRST_CLASS = "below 0.75 in";

export const METRICS = ["pod", "far", "csi", "hss"] as const;
export type MetricKey = (typeof METRICS)[number];
export const METRIC_LABELS: Record<MetricKey, string> = { pod: "POD", far: "FAR", csi: "CSI", hss: "HSS" };

/** A metric to two decimals; null gives an en dash and the hidden explanation. */
export function metricText(value: Metric): { text: string; hidden: string | null } {
  return value === null ? { text: "\u2013", hidden: NULL_METRIC_TEXT } : { text: value.toFixed(2), hidden: null };
}

export function formatMetric(value: Metric): string {
  return metricText(value).text;
}

export function formatReportTime(time: string): string {
  return time.length === 4 ? `${time.slice(0, 2)}:${time.slice(2)}Z` : time;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatInches(inches: number): string {
  return `${inches.toFixed(2)} in`;
}

