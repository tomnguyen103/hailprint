import { ageMinutes } from "../live/freshness";

/** The age of an ISO time as "N min ago", "N h ago", or "N d ago", floored; never negative; "unknown" for a time that does not parse. */
export function ageOf(iso: string, now: Date): string {
  const minutes = ageMinutes(iso, now);
  if (minutes === null) return "unknown";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
