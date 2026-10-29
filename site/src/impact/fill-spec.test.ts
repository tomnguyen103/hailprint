import { describe, expect, it } from "vitest";
import { binOf, type FillSpec } from "./fill-spec";
import { NET_FILL } from "./internet";
import { POWER_FILL } from "./power";

const SPECS: { name: string; spec: FillSpec<string>; family: string; labels: string[] }[] = [
  { name: "power", spec: POWER_FILL, family: "--out", labels: ["0 to 1%", "1 to 5%", "5 to 15%", "15 to 30%", "30% or more"] },
  { name: "internet", spec: NET_FILL, family: "--net", labels: ["above 0 to 2%", "2 to 5%", "5 to 10%", "10 to 20%", "20% or more"] },
];

describe.each(SPECS)("the $name fill spec", ({ spec, family, labels }) => {
  it("names five filled bins, one more than its edges, and a label for each", () => {
    expect(spec.edges).toHaveLength(4);
    expect(spec.bins).toEqual([1, 2, 3, 4, 5].map((i) => `${family}-${i}`));
    expect(spec.labels).toEqual(labels);
  });

  it("puts each edge in the upper bin and the value just below it in the lower bin", () => {
    spec.edges.forEach((edge, i) => {
      expect(spec.bin(edge - 1e-9)).toBe(`${family}-${i + 1}`);
      expect(spec.bin(edge)).toBe(`${family}-${i + 2}`);
      expect(spec.bin(edge + 1e-9)).toBe(`${family}-${i + 2}`);
    });
  });

  it("gives a value just above zero the lowest bin and 1 the top bin", () => {
    expect(spec.bin(1e-9)).toBe(`${family}-1`);
    expect(spec.bin(1)).toBe(`${family}-5`);
    expect(spec.bin(2)).toBe(`${family}-5`);
  });

  it("gives zero and a negative value the none bin", () => {
    expect(spec.bin(0)).toBe("none");
    expect(spec.bin(-0)).toBe("none");
    expect(spec.bin(-1e-9)).toBe("none");
    expect(spec.bin(-1)).toBe("none");
  });

  it("gives null and NaN the gap bin, never the none bin", () => {
    expect(spec.bin(null)).toBe("gap");
    expect(spec.bin(NaN)).toBe("gap");
    expect(spec.bin(null)).not.toBe(spec.bin(0));
  });
});

describe("binOf", () => {
  const edges = [10, 20];
  const bins = ["low", "mid", "high"] as const;

  it("counts the edges that the value reaches and reads that bin", () => {
    expect(binOf(edges, bins, 5)).toBe("low");
    expect(binOf(edges, bins, 10)).toBe("mid");
    expect(binOf(edges, bins, 19.999)).toBe("mid");
    expect(binOf(edges, bins, 20)).toBe("high");
    expect(binOf(edges, bins, 1000)).toBe("high");
  });

  it("gives zero and below none, and a missing value gap", () => {
    expect(binOf(edges, bins, 0)).toBe("none");
    expect(binOf(edges, bins, -3)).toBe("none");
    expect(binOf(edges, bins, null)).toBe("gap");
    expect(binOf(edges, bins, NaN)).toBe("gap");
  });
});
