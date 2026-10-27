import { expect, it } from "vitest";
import type { ArchiveSummary, ArchiveYear } from "../data/types";
import { coverageRows } from "./coverage";

function archive(years: ArchiveYear[]): ArchiveSummary {
  const days = years.reduce((sum, y) => sum + y.days, 0);
  const with12z = years.reduce((sum, y) => sum + y.days_with_12z, 0);
  return { days, first_storm_date: "2020-10-14", last_storm_date: "2024-05-28", days_without_12z: days - with12z, years };
}

it("gives one row per year and a total row", () => {
  const rows = coverageRows(archive([{ year: 2024, days: 149, days_with_12z: 148 }]));
  expect(rows).toEqual([
    { label: "2024", days: 149, daysWith12z: 148, share: 148 / 149 },
    { label: "Total", days: 149, daysWith12z: 148, share: 148 / 149 },
  ]);
});

it("keeps twelve years in ascending order before the total", () => {
  const years = Array.from({ length: 12 }, (_, i) => ({ year: 2013 + i, days: 10, days_with_12z: 5 }));
  const rows = coverageRows(archive(years));
  expect(rows).toHaveLength(13);
  expect(rows.map((r) => r.label)).toEqual([...years.map((y) => String(y.year)), "Total"]);
  expect(rows[12]).toEqual({ label: "Total", days: 120, daysWith12z: 60, share: 0.5 });
});

it("gives share 0 for a year without a 12Z file and 1 for a full year", () => {
  const rows = coverageRows(
    archive([
      { year: 2020, days: 4, days_with_12z: 0 },
      { year: 2021, days: 6, days_with_12z: 6 },
    ]),
  );
  expect(rows.map((r) => r.share)).toEqual([0, 1, 0.6]);
});

it("gives share 0 when a year has no days", () => {
  const rows = coverageRows(archive([{ year: 2022, days: 0, days_with_12z: 0 }]));
  expect(rows.map((r) => r.share)).toEqual([0, 0]);
});
