import type { FeatureCollection, MultiPolygon } from "geojson";
import { describe, expect, it } from "vitest";
import { DataError, type InternetFile, type PowerFile } from "../data/types";
import { FORBIDDEN_WORD } from "../method/prose";
import type { Load } from "../state/load";
import { METRO_FIPS, percentText } from "./power";
import { NET_FILL, dropOf, internetFeatures, internetNote, isInternet } from "./internet";

const receipt = {
  storm_date: "2024-05-17",
  sources: [{ source: "ioda", product: "ping-slash24", file: "internet-2024-05-17.parquet" }],
  confidence: "radar-estimated hail size",
  run_time: "2026-10-26T23:02:33Z",
  package_version: "0.1.0",
};

const NAMES = ["Harris", "Fort Bend", "Montgomery", "Brazoria", "Galveston", "Waller", "Liberty", "Chambers"];

function internetFile(ratio: Record<string, (number | null)[]> = {}): InternetFile {
  return {
    receipt,
    window: { start: "2024-05-17T12:00:00Z", step_minutes: 15, steps: 192 },
    signal: "ping-slash24",
    baseline_days: 7,
    counties: METRO_FIPS.map((fips, i) => ({
      fips,
      name: NAMES[i]!,
      baseline: 100,
      ratio: ratio[fips] ?? Array<number | null>(192).fill(1),
    })),
  };
}

describe("the drop", () => {
  // O9: the same table sits in tests/test_internet.py; both languages must give the same drop.
  it.each([
    [0.9, 0.1],
    [0.0, 1],
    [1.0, 0],
    [1.2, 0],
    [0.98, 0.02],
    [0.905, 0.095],
    [null, null],
  ])("ratio %s is drop %s", (ratio, drop) => {
    expect(dropOf(ratio)).toBe(drop);
  });

  it("rounds to three decimals so 1 - 0.9 reads as 0.1 and not 0.09999999999999998", () => {
    expect(dropOf(0.9)).toBe(0.1);
    expect(NET_FILL.bin(dropOf(0.9))).toBe("--net-4");
  });

  it("never gives a zero drop the sign of a negative zero", () => {
    expect(Object.is(dropOf(1.0), 0)).toBe(true);
    expect(Object.is(dropOf(1.5), 0)).toBe(true);
  });
});

describe("the drop bins", () => {
  it.each([
    [0, "none"],
    [0.019, "--net-1"],
    [0.02, "--net-2"],
    [0.2, "--net-5"],
    [null, "gap"],
  ])("drop %s is bin %s", (drop, bin) => {
    expect(NET_FILL.bin(drop)).toBe(bin);
  });

  it.each([
    [0.0001, "--net-1"],
    [0.0199, "--net-1"],
    [0.02, "--net-2"],
    [0.0499, "--net-2"],
    [0.05, "--net-3"],
    [0.0999, "--net-3"],
    [0.1, "--net-4"],
    [0.1999, "--net-4"],
    [0.2, "--net-5"],
    [1, "--net-5"],
  ])("drop %s sits in the right band", (drop, bin) => {
    expect(NET_FILL.bin(drop)).toBe(bin);
  });

  it("reads 1.9 percent as the first bin and 2 percent as the second", () => {
    expect(NET_FILL.bin(dropOf(0.981))).toBe("--net-1");
    expect(NET_FILL.bin(dropOf(0.98))).toBe("--net-2");
    expect(NET_FILL.bin(dropOf(0.8))).toBe("--net-5");
    expect(NET_FILL.bin(dropOf(1))).toBe("none");
  });

  it("holds each edge to 1e-9", () => {
    NET_FILL.edges.forEach((edge, i) => {
      expect(NET_FILL.bin(edge - 1e-9)).toBe(`--net-${i + 1}`);
      expect(NET_FILL.bin(edge + 1e-9)).toBe(`--net-${i + 2}`);
    });
  });

  it("never gives a null ratio the bin of a zero drop", () => {
    expect(NET_FILL.bin(dropOf(null))).toBe("gap");
    expect(NET_FILL.bin(dropOf(null))).not.toBe(NET_FILL.bin(dropOf(1)));
  });

  it("names the five filled bins and a label for each", () => {
    expect(NET_FILL.bins).toEqual(["--net-1", "--net-2", "--net-3", "--net-4", "--net-5"]);
    expect(NET_FILL.labels).toEqual(["above 0 to 2%", "2 to 5%", "5 to 10%", "10 to 20%", "20% or more"]);
  });
});

describe("the internet note", () => {
  const ready: Load<InternetFile | null> = { status: "ready", data: null };

  it("says so when the date has no internet file", () => {
    expect(internetNote(null, ready)).toBe("No internet file for this storm date.");
  });

  it("names the failure when the file fails its guard", () => {
    const failed: Load<InternetFile | null> = { status: "error", error: new DataError("internet.json", "counties has 3 entries, not 8") };
    expect(internetNote("storms/2024-05-17/internet.json", failed)).toBe(
      "Internet reachability off. internet.json: counties has 3 entries, not 8",
    );
  });

  it("says nothing while the file loads or when it is valid", () => {
    expect(internetNote("storms/2024-05-17/internet.json", { status: "loading" })).toBeNull();
    expect(internetNote("storms/2024-05-17/internet.json", { status: "ready", data: internetFile() })).toBeNull();
  });

  it("never says down, the forbidden word, or a cause", () => {
    const failed: Load<InternetFile | null> = { status: "error", error: new DataError("internet.json", "bad") };
    const text = [internetNote(null, ready), internetNote("x", failed), ...NET_FILL.labels].join(" ").toLowerCase();
    for (const word of ["down", FORBIDDEN_WORD, "caused", "because"]) expect(text).not.toContain(word);
  });
});

function outline(fips: string, name: string, x: number) {
  const ring = [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]];
  return {
    type: "Feature" as const,
    properties: { fips, name },
    geometry: { type: "MultiPolygon" as const, coordinates: [[ring]] },
  };
}

const OUTLINES: FeatureCollection<MultiPolygon> = {
  type: "FeatureCollection",
  features: METRO_FIPS.map((fips, i) => outline(fips, NAMES[i]!, i * 2)),
};

describe("the county features", () => {
  it("gives each county its drop and bin at the step", () => {
    const file = internetFile({ "48201": Array.from({ length: 192 }, (_, i) => (i === 20 ? 0.8 : 1)) });
    const at = (step: number) => internetFeatures(OUTLINES, file, step).features.map((f) => f.properties);
    expect(at(20)[0]).toEqual({ fips: "48201", name: "Harris", drop: 0.2, bin: "--net-5" });
    expect(at(20)[1]).toEqual({ fips: "48157", name: "Fort Bend", drop: 0, bin: "none" });
    expect(at(21)[0]).toMatchObject({ drop: 0, bin: "none" });
  });

  it("reads a null ratio, a missing county, and a null file as a gap", () => {
    const file = internetFile({ "48201": Array<number | null>(192).fill(null) });
    expect(internetFeatures(OUTLINES, file, 5).features[0]!.properties).toMatchObject({ drop: null, bin: "gap" });
    const lacking: InternetFile = { ...file, counties: file.counties.slice(1) };
    expect(internetFeatures(OUTLINES, lacking, 5).features[0]!.properties).toMatchObject({ drop: null, bin: "gap" });
    for (const feature of internetFeatures(OUTLINES, null, 5).features) expect(feature.properties.bin).toBe("gap");
  });

  it("returns no feature without outlines and keeps the outline geometry", () => {
    expect(internetFeatures(null, internetFile(), 0).features).toEqual([]);
    expect(internetFeatures(OUTLINES, internetFile(), 0).features[3]!.geometry).toBe(OUTLINES.features[3]!.geometry);
  });

  it("shows the drop as a percent with the same text rule as the power share", () => {
    expect(percentText(dropOf(0.9))).toBe("10.0%");
    expect(percentText(dropOf(1))).toBe("0%");
    expect(percentText(dropOf(null))).toBe("no data");
  });
});

describe("the file kind", () => {
  it("tells an internet file from a power file and from null", () => {
    const power: PowerFile = { receipt, window: internetFile().window, source: "eaglei", utilities: null, counties: [] };
    expect(isInternet(internetFile())).toBe(true);
    expect(isInternet(power)).toBe(false);
    expect(isInternet(null)).toBe(false);
  });
});
