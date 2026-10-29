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

/** The newest storm date with an impact layer, or the newest storm date when none has one. */
export function landingStorm(storms: readonly Storm[]): Storm | undefined {
  return storms.find((s) => Boolean(s.files) && hasImpactLayer(s)) ?? storms[0];
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
