// The constants the published-file guards and their callers share.
// This module imports nothing, so the data layer needs no import from a layer above it.

/** The 8 metro counties in the order `power.json` lists them: Harris first. */
export const METRO_FIPS = ["48201", "48157", "48339", "48039", "48167", "48473", "48291", "48071"] as const;
export const HARRIS_FIPS = METRO_FIPS[0];

/** The 8 metro counties as `[fips, name]` pairs in `METRO_FIPS` order. */
export const METRO_COUNTIES: readonly (readonly [string, string])[] = [
  ["48201", "Harris"],
  ["48157", "Fort Bend"],
  ["48339", "Montgomery"],
  ["48039", "Brazoria"],
  ["48167", "Galveston"],
  ["48473", "Waller"],
  ["48291", "Liberty"],
  ["48071", "Chambers"],
] as const;

/** A storm date as the path and the index carry it. The guards and the router share it. */
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `text` is a calendar-valid YYYY-MM-DD date (e.g. 2024-02-29 passes; 2024-02-31 and 2023-02-29 fail). */
export function isValidCalendarDate(text: string): boolean {
  if (!DATE.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** The impact window grid: 192 steps of 15 minutes. `src/hailprint/impact.py` holds the same two numbers. */
export const STEP_MINUTES = 15;
export const STEPS = 192;
