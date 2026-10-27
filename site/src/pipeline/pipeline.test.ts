import { expect, it } from "vitest";
import type { PipelineFile } from "../data/types";
import { services } from "./pipeline";

const empty: PipelineFile = {
  confidence: "radar-estimated hail size",
  run_time: "2026-10-26T23:02:33Z",
  package_version: "0.1.0",
  runs: [],
  archive: null,
  sources: [],
};

const row = (source: string, product: string) => ({ source, product, storm_dates: ["2024-05-28"] });

/** The services of the file keyed by name. */
const state = (file: PipelineFile) => Object.fromEntries(services(file).map((s) => [s.name, s.ok]));

it("marks every service missing on an empty file", () => {
  expect(state(empty)).toEqual({ "MESH archive": false, "SPC reports": false, "HCAD parcels": false });
});

it("reads SPC from the product and HCAD from the source", () => {
  expect(state({ ...empty, sources: [row("spc-daily", "preliminary hail reports")] })["SPC reports"]).toBe(true);
  expect(state({ ...empty, sources: [row("noaa-mrms-pds", "MESH_Max_1440min_00.50")] })["HCAD parcels"]).toBe(false);
  expect(state({ ...empty, sources: [row("hcad", "Parcels.gdb")] })["HCAD parcels"]).toBe(true);
});
