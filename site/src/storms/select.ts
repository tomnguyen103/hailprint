// Pure selectors for the Storms workspace. No Preact import.
import type { Storm, StormFiles, ZipCounts } from "../data/types";
import { BELOW_FIRST_CLASS } from "../format";
import type { Fill } from "../impact/power";
import { RULER } from "../ruler";

export type ImpactLayer = "power" | "internet" | "warnings";

/** Default county fill for a storm date: power when present, else internet when present, else none. */
export function defaultFill(files: Pick<StormFiles, "power" | "internet">): Fill {
  if (files.power !== null) return "power";
  if (files.internet !== null) return "internet";
  return "none";
}

/** Ordered impact layer chips for a storm date from its published file map. */
export function impactChips(files: Pick<StormFiles, "power" | "internet" | "warnings">): ImpactLayer[] {
  const chips: ImpactLayer[] = [];
  if (files.power !== null) chips.push("power");
  if (files.internet !== null) chips.push("internet");
  if (files.warnings !== null) chips.push("warnings");
  return chips;
}

/** True when a storm date has at least one impact layer (power, internet, or warnings). */
export function hasImpactLayer(storm: Pick<Storm, "files">): boolean {
  return (
    storm.files.power !== null ||
    storm.files.internet !== null ||
    storm.files.warnings !== null
  );
}

export interface CaseStudy {
  storm_date: string;
  title: string;
  summary: string;
}

export const CASE_STUDIES: readonly CaseStudy[] = [
  {
    storm_date: "2024-05-28",
    title: "2024-05-28 · Derecho & hail",
    summary: "361,418 parcels · 44% peak power out · 9 SPC reports",
  },
  {
    storm_date: "2024-12-24",
    title: "2024-12-24 · 0.50 HSS peak skill",
    summary: "37,881 parcels · 3 SPC reports · highest single-storm skill",
  },
  {
    storm_date: "2023-06-23",
    title: "2023-06-23 · 13 reports (up to 2.00 in)",
    summary: "221,695 parcels · 13 SPC reports · densest ground-truth report day",
  },
  {
    storm_date: "2024-03-15",
    title: "2024-03-15 · 76.6 mm peak MESH",
    summary: "49,315 parcels · 8 scored reports · 76.6 mm peak MESH",
  },
];

/** Case study presets whose storm date is present in the published catalog. */
export function availableCaseStudies(storms: readonly Storm[]): CaseStudy[] {
  const dates = new Set(storms.map((s) => s.storm_date));
  return CASE_STUDIES.filter((cs) => dates.has(cs.storm_date));
}

/**
 * The first-visit storm date:
 * 1. Newest storm with power + internet + >= 5 SPC reports (2024-05-28 in the published catalog),
 * 2. Else newest storm with power + internet,
 * 3. Else newest storm with power,
 * 4. Else newest storm with any impact layer,
 * 5. Else newest storm in catalog.
 */
export function landingStorm(storms: readonly Storm[]): Storm | undefined {
  return (
    storms.find(
      (s) =>
        Boolean(s.files) &&
        s.files.power !== null &&
        s.files.internet !== null &&
        (s.report_count ?? 0) >= 5,
    ) ??
    storms.find((s) => Boolean(s.files) && s.files.power !== null && s.files.internet !== null) ??
    storms.find((s) => Boolean(s.files) && s.files.power !== null) ??
    storms.find((s) => Boolean(s.files) && hasImpactLayer(s)) ??
    storms[0]
  );
}

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

/** The ZIP rows of one class, largest count first, ZIP ascending on a tie, "unknown" last. */
export function zipRows(zip: ZipCounts, thresholdMm: number): { zip: string; parcel_count: number }[] {
  return zip.zips
    .filter((row) => row.threshold_mm === thresholdMm)
    .map(({ zip, parcel_count }) => ({ zip, parcel_count }))
    .sort((a, b) => {
      if (a.zip === "unknown" && b.zip !== "unknown") return 1;
      if (b.zip === "unknown" && a.zip !== "unknown") return -1;
      return b.parcel_count - a.parcel_count || a.zip.localeCompare(b.zip);
    });
}

export interface CrossStormZipEntry {
  storm_date: string;
  parcel_count: number;
  storm_total: number;
  share: number;
  max_mesh_mm: number | null;
}

/**
 * Build a cross-storm exposure ledger for a single 5-digit ZIP across all storms
 * at `thresholdMm`, sorted by `parcel_count` descending then `storm_date` descending.
 */
export function crossStormZipLedger(
  storms: readonly Storm[],
  zipFiles: readonly (ZipCounts | null)[],
  zipCode: string,
  thresholdMm: number,
): CrossStormZipEntry[] {
  const entries: CrossStormZipEntry[] = [];
  storms.forEach((storm, i) => {
    const file = zipFiles[i] ?? null;
    if (file === null) return;
    const row = file.zips.find((z) => z.zip === zipCode && z.threshold_mm === thresholdMm);
    const count = row?.parcel_count ?? 0;
    if (count <= 0) return;
    const classTotal = file.classes.find((c) => c.threshold_mm === thresholdMm)?.parcel_count ?? count;
    entries.push({
      storm_date: storm.storm_date,
      parcel_count: count,
      storm_total: classTotal,
      share: classTotal > 0 ? count / classTotal : 0,
      max_mesh_mm: storm.max_mesh_mm,
    });
  });
  return entries.sort(
    (a, b) => b.parcel_count - a.parcel_count || b.storm_date.localeCompare(a.storm_date),
  );
}

/** The object name of the largest size class at or below `inches`. */
export function objectForSize(inches: number): string {
  let name = BELOW_FIRST_CLASS;
  for (const mark of RULER) if (inches >= mark.threshold_in) name = mark.object;
  return name;
}
