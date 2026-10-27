/** The age of an ISO time as "N min ago", "N h ago", or "N d ago", floored; never negative. */
export function ageOf(iso: string, now: Date): string {
  const minutes = Math.floor(Math.max(0, now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
