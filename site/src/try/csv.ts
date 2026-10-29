import type { PooledRow } from "../pool";

export const COLUMNS = [
  "threshold_mm",
  "threshold_in",
  "label",
  "report_count",
  "hits",
  "misses",
  "false_alarms",
  "correct_negatives",
  "pod",
  "far",
  "csi",
  "hss",
  "swath_km2",
  "unverifiable_km2",
] as const satisfies readonly (keyof PooledRow)[];

export const CSV_HEADER = COLUMNS.join(",");

function cell(value: string | number | null): string {
  if (value === null) return "";
  const raw = String(value);
  const text = typeof value === "string" && /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The pooled table as CSV: the seventeen columns of the scored file, in order, with `\n` line endings. */
export function csvOf(rows: readonly PooledRow[]): string {
  const lines = [CSV_HEADER, ...rows.map((row) => COLUMNS.map((col) => cell(row[col])).join(","))];
  return `${lines.join("\n")}\n`;
}
