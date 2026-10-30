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
    summary: "361,418 parcels · 44% peak power out · 8 SPC reports",
  },
  {
    storm_date: "2024-12-24",
    title: "2024-12-24 · 0.50 HSS peak skill",
    summary: "68,537 parcels · 6 SPC reports · highest single-storm skill",
  },
  {
    storm_date: "2023-06-23",
    title: "2023-06-23 · 13 reports (up to 2.00 in)",
    summary: "438,243 parcels · densest ground-truth report day",
  },
  {
    storm_date: "2024-03-15",
    title: "2024-03-15 · 76.6 mm peak MESH",
    summary: "49,315 parcels · 5 SPC reports · intense core swath",
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

/** The ZIP rows of one class, largest count first, ZIP ascending on a tie. */
export function zipRows(zip: ZipCounts, thresholdMm: number): { zip: string; parcel_count: number }[] {
  return zip.zips
    .filter((row) => row.threshold_mm === thresholdMm)
    .map(({ zip, parcel_count }) => ({ zip, parcel_count }))
    .sort((a, b) => b.parcel_count - a.parcel_count || a.zip.localeCompare(b.zip));
}

/** The object name of the largest size class at or below `inches`. */
export function objectForSize(inches: number): string {
  let name = BELOW_FIRST_CLASS;
  for (const mark of RULER) if (inches >= mark.threshold_in) name = mark.object;
  return name;
}
