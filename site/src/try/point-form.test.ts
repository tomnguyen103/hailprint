import { describe, expect, it } from "vitest";
import { POINT_HINT, parsePoint } from "./point-form";

describe("parsePoint (US-01.6)", () => {
  it("returns [lon, lat] for points across the 8-county Houston Metro (Harris, Katy/Fort Bend, Galveston)", () => {
    expect(parsePoint("29.76", "-95.37")).toEqual([-95.37, 29.76]);
    expect(parsePoint("29.7420", "-95.8240")).toEqual([-95.824, 29.742]);
    expect(parsePoint("29.3013", "-94.7977")).toEqual([-94.7977, 29.3013]);
  });

  it("returns null outside METRO_BBOX and for text that is not a number", () => {
    expect(parsePoint("31", "-95")).toBeNull();
    expect(parsePoint("29.76", "-94")).toBeNull();
    expect(parsePoint("abc", "-95")).toBeNull();
    expect(parsePoint("", "")).toBeNull();
  });
});

describe("POINT_HINT", () => {
  it("names the 8-county Houston Metro bounds", () => {
    expect(POINT_HINT).toBe(
      "Enter a latitude between 28.82 and 30.63 and a longitude between -96.30 and -94.35 (8-county Houston Metro).",
    );
  });
});
