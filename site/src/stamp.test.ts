import { expect, it } from "vitest";
import { cellFor, cells, formatStormFieldNote } from "./stamp";

it("maps a UTC HHMM report time to its 12Z-window cell", () => {
  expect(cellFor("1823")).toBe(6);
  expect(cellFor("0559")).toBe(17);
  expect(cellFor("1200")).toBe(0);
  expect(cellFor("1159")).toBe(23);
});

it("gives null for a bad time", () => {
  expect(cellFor("abcd")).toBeNull();
  expect(cellFor("2460")).toBeNull();
  expect(cellFor("123")).toBeNull();
});

it("fills one cell per report hour over 24 cells", () => {
  const filled = cells(["1823", "1845", "0600", "zzzz"]);
  expect(filled).toHaveLength(24);
  expect(filled.filter(Boolean)).toHaveLength(2);
  expect(filled[6]).toBe(true);
  expect(filled[18]).toBe(true);
});

it("formats a plain-text storm field note with report count, max size, and receipt provenance", () => {
  const note = formatStormFieldNote(
    {
      storm_date: "2024-05-28",
      report_count: 8,
      max_size_in: 1.75,
      report_source: "wcm",
      max_mesh_mm: 54.2,
      scored_reports: 8,
      excluded_reports: 0,
      table: [],
      parcel_total: 245000,
      files: {
        swath: "storms/2024-05-28/swath.geojson",
        reports: "storms/2024-05-28/reports.geojson",
        pairs: "storms/2024-05-28/pairs.json",
        zip_counts: "storms/2024-05-28/zip-counts.json",
        power: "storms/2024-05-28/power.json",
        internet: "storms/2024-05-28/internet.json",
        warnings: "storms/2024-05-28/warnings.geojson",
      },
    },
    {
      storm_date: "2024-05-28",
      sources: [{ source: "NOAA MRMS", product: "MESH_Max_1440min", file: "2024-05-28.grib2" }],
      confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
      run_time: "2026-04-20T00:00:00Z",
      package_version: "0.1.0",
    },
  );
  expect(note).toContain("Hailprint field note — 2024-05-28");
  expect(note).toContain("8 SPC hail reports (max 1.75 in)");
  expect(note).toContain("245,000 parcels");
  expect(note).toContain("NOAA MRMS MESH_Max_1440min");
  expect(note).toContain("Radar-estimated hail size.");

  const fallbackNote = formatStormFieldNote(
    {
      storm_date: "2024-05-28",
      report_count: 9,
      max_size_in: 1.75,
      report_source: "wcm",
      max_mesh_mm: 52.8,
      scored_reports: 10,
      excluded_reports: 0,
      table: [],
      parcel_total: null,
      files: {
        swath: "storms/2024-05-28/swath.geojson",
        reports: "storms/2024-05-28/reports.geojson",
        pairs: "storms/2024-05-28/pairs.json",
        zip_counts: null,
        power: null,
        internet: null,
        warnings: null,
      },
    },
    {
      storm_date: "2024-05-28",
      sources: [],
      confidence: "Radar-estimated hail size.",
      run_time: "2026-04-20T00:00:00Z",
      package_version: "0.1.0",
    },
  );
  expect(fallbackNote).toContain("Source: NOAA MRMS MESH_Max_1440min, SPC hail");
});