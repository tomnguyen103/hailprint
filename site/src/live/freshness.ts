export const AGING_MIN = 20;
export const STALE_MIN = 60;

export type Freshness = "fresh" | "aging" | "stale";

/** Whole minutes since `runTime`, floored at 0 for clock skew, or null when `runTime` does not parse. */
export function ageMinutes(runTime: string, now: Date): number | null {
  const then = new Date(runTime).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor(Math.max(0, now.getTime() - then) / 60_000);
}

/** Age text for whole minutes: "<n> min ago" under 1 h, "<n> h ago" under 1 d, else "<n> d ago". */
export function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

/** Age state of `now.json`: fresh under 20 min, aging from 20 to 59 min, stale at 60 min and up. */
export function freshness(runTime: string, now: Date): Freshness {
  const age = ageMinutes(runTime, now);
  if (age === null || age >= STALE_MIN) return "stale";
  if (age >= AGING_MIN) return "aging";
  return "fresh";
}
