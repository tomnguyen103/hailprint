import type { PooledRow } from "../pool";
import type { StormPinRow } from "./point-analysis";

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

export const ZIP_CSV_HEADER = "storm_date,threshold_mm,zip,parcel_count,share_of_class";

/** Format a storm class ZIP table as CSV. */
export function zipCsvOf(
  rows: readonly { zip: string; parcel_count: number; share: number }[],
  stormDate: string,
  thresholdMm: number,
): string {
  const lines = [
    ZIP_CSV_HEADER,
    ...rows.map((r) =>
      [
        cell(stormDate),
        cell(thresholdMm),
        cell(r.zip),
        cell(r.parcel_count),
        cell(Number(r.share.toFixed(4))),
      ].join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export const POINT_CSV_HEADER =
  "storm_date,lat,lon,radius_km,crop_status,covering_mm,within_radius_mm,nearest_swath_km,reports_within_radius,direct_warnings,power_peak_share,power_peak_out,internet_max_drop";

/** Format the point history ledger at a pinned coordinate across published storm dates as CSV. */
export function pointCsvOf(
  rows: readonly StormPinRow[],
  lngLat: [number, number],
  radiusKm: number,
): string {
  const [lon, lat] = lngLat;
  const latCell = Number(lat.toFixed(4));
  const lonCell = Number(lon.toFixed(4));
  const lines = [
    POINT_CSV_HEADER,
    ...rows.map((r) =>
      [
        cell(r.stormDate),
        cell(latCell),
        cell(lonCell),
        cell(radiusKm),
        cell(r.cropStatus),
        cell(r.covering?.threshold_mm ?? null),
        cell(r.withinRadius?.threshold_mm ?? null),
        cell(r.nearest !== null ? Number(r.nearest.distanceKm.toFixed(2)) : null),
        cell(r.reportsWithinRadius.count),
        cell(r.directWarnings.length),
        cell(r.powerPeak?.peakShare !== null && r.powerPeak?.peakShare !== undefined ? Number(r.powerPeak.peakShare.toFixed(4)) : null),
        cell(r.powerPeak?.peakOut ?? null),
        cell(r.internetTrough?.maxDrop !== null && r.internetTrough?.maxDrop !== undefined ? Number(r.internetTrough.maxDrop.toFixed(4)) : null),
      ].join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

