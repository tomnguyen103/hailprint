import { describe, expect, it } from "vitest";
import { HEIGHT, LITERATURE_HSS, MARGIN, WIDTH, pathOf, xOf, yOf } from "./curve";

describe("curve scales", () => {
  it("maps the threshold range to the plot width", () => {
    expect(xOf(0.75)).toBe(MARGIN.left);
    expect(xOf(0.75)).toBe(48);
    expect(xOf(2.5)).toBe(WIDTH - MARGIN.right);
    expect(xOf(2.5)).toBe(624);
  });

  it("maps 0..1 to the plot height, bottom up", () => {
    expect(yOf(0)).toBe(HEIGHT - MARGIN.bottom);
    expect(yOf(0)).toBe(280);
    expect(yOf(1)).toBe(MARGIN.top);
    expect(yOf(1)).toBe(16);
  });

  it("holds the literature HSS", () => {
    expect(LITERATURE_HSS).toBe(0.38);
  });
});

describe("pathOf", () => {
  it("opens a new M after each null", () => {
    const d = pathOf([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: null },
      { x: 3, y: 4 },
      { x: 4, y: 5 },
    ]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(d).toBe("M0 1L1 2M3 4L4 5");
  });

  it("is empty when every value is null", () => {
    expect(pathOf([{ x: 0, y: null }, { x: 1, y: null }])).toBe("");
  });
});