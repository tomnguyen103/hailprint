import { expect, it } from "vitest";
import { cellFor, cells } from "./stamp";

it("maps a CST HHMM report time to its 12Z-window cell", () => {
  expect(cellFor("1823")).toBe(12);
  expect(cellFor("0559")).toBe(23);
  expect(cellFor("0600")).toBe(0);
  expect(cellFor("1200")).toBe(6);
});

it("gives null for a bad time", () => {
  expect(cellFor("abcd")).toBeNull();
  expect(cellFor("2460")).toBeNull();
  expect(cellFor("123")).toBeNull();
});

it("fills one cell per report hour over 24 cells", () => {
  const filled = cells(["1823", "1845", "0600", "zzzz"]);
  expect(filled).toHaveLength(24);
  expect(filled.filter(Boolean)).toHaveLength(2);
  expect(filled[12]).toBe(true);
  expect(filled[0]).toBe(true);
});