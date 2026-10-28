// The constants the published-file guards and their callers share.
// This module imports nothing, so the data layer needs no import from a layer above it.

/** The 8 metro counties in the order `power.json` lists them: Harris first. */
export const METRO_FIPS = ["48201", "48157", "48339", "48039", "48167", "48473", "48291", "48071"] as const;
export const HARRIS_FIPS = METRO_FIPS[0];

/** A storm date as the path and the index carry it. The guards and the router share it. */
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The impact window grid: 192 steps of 15 minutes. `src/hailprint/impact.py` holds the same two numbers. */
export const STEP_MINUTES = 15;
export const STEPS = 192;
