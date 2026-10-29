// The pooled table as CSV. Pure, no Preact import.
import type { PooledRow } from "../pool";

const COLUMNS = [
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
  const text = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// shortcut: the CSV has no formula-prefix guard, upgrade if a free-text column lands
/** One header line, one line per row, LF line ends, a trailing newline; a null metric is an empty cell. */
export function csvOf(rows: PooledRow[]): string {
  const lines = rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(","));
  return [CSV_HEADER, ...lines].join("\n") + "\n";
}