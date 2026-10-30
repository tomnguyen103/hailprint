// The report-time stamp: 24 cells over the storm date, 12Z D to 12Z D+1.
// SPC daily CSV report times are UTC, so 1200 fills cell 0 and 1159 fills cell 23.
import type { Receipt, Storm } from "./data/types";

export const CELLS = 24;

const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;

/** Cell index 0..23 for a UTC `HHMM` time; null for a bad time. */
export function cellFor(time: string): number | null {
  if (!HHMM.test(time)) return null;
  const hour = Number(time.slice(0, 2));
  return (hour + 12) % CELLS;
}

/** One boolean per cell: true when at least one report falls in that hour. */
export function cells(times: readonly string[]): boolean[] {
  const filled = Array<boolean>(CELLS).fill(false);
  for (const time of times) {
    const cell = cellFor(time);
    if (cell !== null) filled[cell] = true;
  }
  return filled;
}

/** Plain-text field note citation for one storm date and its receipt. */
export function formatStormFieldNote(storm: Storm, receipt: Receipt): string {
  const maxPart = storm.max_size_in === null ? "no size" : `max ${storm.max_size_in.toFixed(2)} in`;
  const maxMeshPart =
    storm.max_mesh_mm === null ? "" : `, max radar MESH ${storm.max_mesh_mm.toFixed(1)} mm`;
  const parcelPart =
    storm.parcel_total === null ? "" : `, ${storm.parcel_total.toLocaleString("en-US")} parcels`;
  const sources =
    receipt.sources.length > 0
      ? receipt.sources.map((s) => `${s.source} ${s.product}`).join(", ")
      : "NOAA MRMS MESH_Max_1440min, SPC hail";
  return `Hailprint field note — ${storm.storm_date}: ${storm.report_count} SPC hail reports (${maxPart})${maxMeshPart}${parcelPart}. Source: ${sources} (run ${receipt.run_time}, v${receipt.package_version}). ${receipt.confidence}`;
}
