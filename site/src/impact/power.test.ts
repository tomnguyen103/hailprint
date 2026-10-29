import type { FeatureCollection, MultiPolygon } from "geojson";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { METRO_FIPS } from "../data/constants";
import { DataError, type PowerFile } from "../data/types";
import type { Load } from "../state/load";
import {
  ODIN_LABEL,
  POWER_FILL,
  countyFeatures,
  hatchPixels,
  hexRgb,
  percentText,
  powerNote,
  shareOut,
} from "./power";

const receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "eaglei", product: "customers-out", file: "power-2024-05-28.parquet" }],
  confidence: "radar-estimated hail size",
  run_time: "2026-10-26T23:02:33Z",
  package_version: "0.1.0",
};

const METRO = [
  ["48201", "Harris", 1_827_686],
  ["48157", "Fort Bend", 694_780],
  ["48339", "Montgomery", 230_040],
  ["48039", "Brazoria", 144_164],
  ["48167", "Galveston", 144_421],
  ["48473", "Waller", 18_532],
  ["48291", "Liberty", 44_189],
  ["48071", "Chambers", 26_381],
] as const;

function powerFile(out: Record<string, (number | null)[]> = {}, source: "eaglei" | "odin" = "eaglei"): PowerFile {
  return {
    receipt,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    source,
    utilities: source === "odin" ? ["CenterPoint"] : null,
    counties: METRO.map(([fips, name, customers]) => ({
      fips,
      name,
      customers,
      out: out[fips] ?? Array<number | null>(192).fill(0),
    })),
  };
}

const series = (points: Record<number, number | null>, fill: number | null = 0) =>
  Array.from({ length: 192 }, (_, step) => (step in points ? points[step]! : fill));

describe("the share bins", () => {
  it.each([
    [0, "none"],
    [0.0001, "--out-1"],
    [0.01, "--out-2"],
    [0.3, "--out-5"],
    [null, "gap"],
  ])("share %s is bin %s", (share, bin) => {
    expect(POWER_FILL.bin(share)).toBe(bin);
  });

  it.each([
    [0.0099, "--out-1"],
    [0.01, "--out-2"],
    [0.0499, "--out-2"],
    [0.05, "--out-3"],
    [0.1499, "--out-3"],
    [0.15, "--out-4"],
    [0.2999, "--out-4"],
    [0.3, "--out-5"],
    [1, "--out-5"],
  ])("share %s sits in the right band", (share, bin) => {
    expect(POWER_FILL.bin(share)).toBe(bin);
  });

  it("never gives a null step the bin of a zero step", () => {
    expect(POWER_FILL.bin(null)).not.toBe(POWER_FILL.bin(0));
  });
});

// O9: the same table sits in tests/test_power.py; both languages must give the same bin.
const PARITY: [number | null, number, string][] = [
  [0, 1000, "none"],
  [1, 1000, "--out-1"],
  [9, 1000, "--out-1"],
  [10, 1000, "--out-2"],
  [49, 1000, "--out-2"],
  [50, 1000, "--out-3"],
  [149, 1000, "--out-3"],
  [150, 1000, "--out-4"],
  [299, 1000, "--out-4"],
  [300, 1000, "--out-5"],
  [1000, 1000, "--out-5"],
  [null, 1000, "gap"],
  [251_830, 1_827_686, "--out-3"],
  [1_660_703, 1_827_686, "--out-5"],
];

describe("the TS bin and the Python bin", () => {
  it.each(PARITY)("out %s of %s customers is %s", (out, customers, bin) => {
    expect(POWER_FILL.bin(shareOut(out, customers))).toBe(bin);
  });

  it("holds each edge to 1e-9", () => {
    POWER_FILL.edges.forEach((edge, i) => {
      expect(POWER_FILL.bin(edge - 1e-9)).toBe(`--out-${i + 1}`);
      expect(POWER_FILL.bin(edge + 1e-9)).toBe(`--out-${i + 2}`);
    });
  });

  it("reads the same four edges as power.py", () => {
    const path = fileURLToPath(new URL("../../../src/hailprint/power.py", import.meta.url));
    const found = /^BIN_\w+ = \(([^)]*)\)/m.exec(readFileSync(path, "utf8"));
    expect(found).not.toBeNull();
    expect(found![1]!.split(",").map(Number)).toEqual([...POWER_FILL.edges]);
  });
});

describe("the share out", () => {
  it("is customers out over the customers, and null stays null", () => {
    expect(shareOut(913_843, 1_827_686)).toBeCloseTo(0.5, 6);
    expect(shareOut(0, 100)).toBe(0);
    expect(shareOut(null, 100)).toBeNull();
  });

  it("stops at 1 when the utility count passes the MCC customers", () => {
    expect(shareOut(31_398, 18_532)).toBe(1);
    expect(percentText(shareOut(31_398, 18_532))).toBe("100.0%");
  });

  it("writes a share as a percent and a gap as words", () => {
    expect(percentText(0.1378)).toBe("13.8%");
    expect(percentText(0)).toBe("0%");
    expect(percentText(0.0004)).toBe("<0.1%");
    expect(percentText(null)).toBe("no data");
  });
});

describe("the power line in the layers control", () => {
  const file = "storms/2024-05-28/power.json";

  it("says the storm date has no power file when the index names none", () => {
    expect(powerNote(null, { status: "ready", data: null })).toBe("No power file for this storm date.");
  });

  it("names the failed file and reason", () => {
    const failed: Load<PowerFile | null> = { status: "error", error: new DataError("power.json", "HTTP 404") };
    expect(powerNote(file, failed)).toBe("Power off. power.json: HTTP 404");
  });

  it("stays quiet while the file loads and once it is ready", () => {
    expect(powerNote(file, { status: "loading" })).toBeNull();
    expect(powerNote(file, { status: "ready", data: powerFile() })).toBeNull();
  });

  it("holds the ODIN label for the CenterPoint limit", () => {
    expect(ODIN_LABEL).toBe("CenterPoint customers only");
  });
});

const outline = (fips: string, name: string, x: number) => ({
  type: "Feature" as const,
  properties: { fips, name },
  geometry: { type: "MultiPolygon" as const, coordinates: [[[[x, 29], [x + 1, 29], [x + 1, 30], [x, 30], [x, 29]]]] },
});

const OUTLINES: FeatureCollection<MultiPolygon> = {
  type: "FeatureCollection",
  features: METRO.map(([fips, name], i) => outline(fips, name, -96 + i)),
};

describe("the county features at a step", () => {
  it("lists the metro counties in file order", () => {
    expect([...METRO_FIPS]).toEqual(METRO.map(([fips]) => fips));
  });

  it("gives each county its share and bin at the step", () => {
    const file = powerFile({
      "48201": series({ 60: 251_830 }),
      "48157": series({ 60: 1 }),
      "48339": series({ 60: null }),
    });
    const features = countyFeatures(OUTLINES, file, 60);
    const by = Object.fromEntries(features.features.map((f) => [f.properties.fips, f.properties]));
    expect(by["48201"]!.bin).toBe("--out-3");
    expect(by["48201"]!.share).toBeCloseTo(251_830 / 1_827_686, 9);
    expect(by["48157"]!.bin).toBe("--out-1");
    expect(by["48339"]!.bin).toBe("gap");
    expect(by["48339"]!.share).toBeNull();
    expect(by["48039"]!.bin).toBe("none");
  });

  it("draws a gap, never a zero, for a step the source did not report", () => {
    const file = powerFile({ "48201": series({}, null) });
    const [harris] = countyFeatures(OUTLINES, file, 60).features;
    expect(harris!.properties.bin).toBe("gap");
    expect(harris!.properties.bin).not.toBe(POWER_FILL.bin(0));
  });

  it("draws a gap for a county the file does not list", () => {
    const file = powerFile();
    file.counties = file.counties.filter((c) => c.fips !== "48071");
    const features = countyFeatures(OUTLINES, file, 10).features;
    expect(features.find((f) => f.properties.fips === "48071")!.properties.bin).toBe("gap");
  });

  it("treats a step outside the file as a gap", () => {
    const file = powerFile();
    expect(countyFeatures(OUTLINES, file, 192).features[0]!.properties.bin).toBe("gap");
    expect(countyFeatures(OUTLINES, file, -1).features[0]!.properties.bin).toBe("gap");
  });

  it("returns nothing without outlines", () => {
    expect(countyFeatures(null, powerFile(), 0).features).toEqual([]);
  });
});

describe("the hatch bitmap", () => {
  it("reads a hex token as bytes and rejects anything else", () => {
    expect(hexRgb("#8a5300")).toEqual([138, 83, 0]);
    expect(() => hexRgb("rgb(1, 2, 3)")).toThrow(/#rrggbb/);
    expect(() => hexRgb("")).toThrow(/#rrggbb/);
  });

  it("draws one 45 degree line per tile with the token colour", () => {
    const { width, height, data } = hatchPixels([10, 20, 30], 8);
    expect([width, height, data.length]).toEqual([8, 8, 8 * 8 * 4]);
    const solid: [number, number][] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        if (data[at + 3] === 255) {
          solid.push([x, y]);
          expect([data[at], data[at + 1], data[at + 2]]).toEqual([10, 20, 30]);
        } else {
          expect(data[at + 3]).toBe(0);
        }
      }
    }
    expect(solid).toHaveLength(8);
    expect(solid.every(([x, y]) => x === y)).toBe(true);
  });
});
