// The report-time stamp: 24 cells over the storm date, 12Z D to 12Z D+1.
// SPC daily CSV report times are UTC, so 1200 fills cell 0 and 1159 fills cell 23.

export const CELLS = 24;

const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;

/** Cell index 0..23 for a CST `HHMM` time; null for a bad time. */
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