import type { ArchiveSummary } from "../data/types";

export interface CoverageRow {
  label: string;
  days: number;
  daysWith12z: number;
  share: number;
}

function row(label: string, days: number, daysWith12z: number): CoverageRow {
  return { label, days, daysWith12z, share: days === 0 ? 0 : daysWith12z / days };
}

/** One archive coverage row per year, ascending, then a Total row. */
export function coverageRows(archive: ArchiveSummary): CoverageRow[] {
  const years = [...archive.years].sort((a, b) => a.year - b.year);
  const rows = years.map((y) => row(String(y.year), y.days, y.days_with_12z));
  const days = years.reduce((sum, y) => sum + y.days, 0);
  const with12z = years.reduce((sum, y) => sum + y.days_with_12z, 0);
  return [...rows, row("Total", days, with12z)];
}
