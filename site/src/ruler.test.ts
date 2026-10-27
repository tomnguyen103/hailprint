import { expect, it } from "vitest";
import { RULER, diameterPx, objectName } from "./ruler";

it("scales diameters with the size in inches", () => {
  expect(diameterPx(2.5)).toBeCloseTo(28, 1);
  expect(diameterPx(0.75)).toBeCloseTo(8.4, 1);
  for (const mark of RULER) {
    expect(diameterPx(mark.threshold_in) / mark.threshold_in).toBeCloseTo(11.2, 6);
  }
});

it("names the object for each size class", () => {
  expect(objectName(38.1)).toBe("walnut");
  expect(objectName(63.5)).toBe("tennis ball");
  expect(objectName(1)).toBeNull();
  expect(RULER.map((m) => m.object)).toEqual([
    "penny", "quarter", "half dollar", "walnut", "golf ball", "hen egg", "tennis ball",
  ]);
});