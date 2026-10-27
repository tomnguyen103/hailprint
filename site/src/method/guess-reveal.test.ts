import { expect, it } from "vitest";
import { difference } from "./guess-reveal";

it("signs the difference between the guess and the actual, en dash when the actual is null", () => {
  expect(difference(0.5, 0.38)).toBe("+0.12");
  expect(difference(0.33, 0.38)).toBe("-0.05");
  expect(difference(0.38, 0.38)).toBe("+0.00");
  expect(difference(0.5, null)).toBe("–");
});
