export const AGING_MIN = 20;
export const STALE_MIN = 60;

export type Freshness = "fresh" | "aging" | "stale";

/** Whole minutes since `runTime`, floored at 0 for clock skew, or null when `runTime` does not parse. */
export function ageMinutes(runTime: string, now: Date): number | null {
  const then = new Date(runTime).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor(Math.max(0, now.getTime() - then) / 60_000);
}

/** Age state of `now.json`: fresh under 20 min, aging from 20 to 59 min, stale at 60 min and up. */
export function freshness(runTime: string, now: Date): Freshness {
  const age = ageMinutes(runTime, now);
  if (age === null || age >= STALE_MIN) return "stale";
  if (age >= AGING_MIN) return "aging";
  return "fresh";
}
