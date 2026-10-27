import { describe, expect, it } from "vitest";
import { POINT_HINT, parsePoint } from "./point-form";

describe("parsePoint", () => {
  it("returns [lon, lat] for a point inside Harris County", () => {
    expect(parsePoint("29.76", "-95.37")).toEqual([-95.37, 29.76]);
  });

  it("returns null outside the bbox and for text that is not a number", () => {
    expect(parsePoint("31", "-95")).toBeNull();
    expect(parsePoint("abc", "-95")).toBeNull();
    expect(parsePoint("", "")).toBeNull();
  });
});

describe("POINT_HINT", () => {
  it("names the bbox to two decimals", () => {
    expect(POINT_HINT).toBe("Enter a point inside Harris County: lat 29.45 to 30.22, lon -96.01 to -94.86.");
  });
});