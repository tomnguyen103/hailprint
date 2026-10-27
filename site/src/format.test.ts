import { expect, it } from "vitest";
import { metricText } from "./format";

it("renders a null metric as an en dash with the hidden text", () => {
  expect(metricText(null)).toEqual({ text: "\u2013", hidden: "undefined, zero denominator" });
  expect(metricText(0.5)).toEqual({ text: "0.50", hidden: null });
  expect(metricText(1)).toEqual({ text: "1.00", hidden: null });
});
