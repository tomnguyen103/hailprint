import { expect, it } from "vitest";
import { href, match } from "./router";

it("redirects the root and bare /storms to the newest storm date", () => {
  expect(match("/")).toEqual({ kind: "redirect-latest" });
  expect(match("/storms")).toEqual({ kind: "redirect-latest" });
  expect(match("/storms/")).toEqual({ kind: "redirect-latest" });
});

it("resolves a storm date to the Map sub-tab by default", () => {
  expect(match("/storms/2024-05-28")).toEqual({ kind: "storms", date: "2024-05-28", tab: "map" });
  expect(match("/storms/2024-05-28/score")).toEqual({ kind: "storms", date: "2024-05-28", tab: "score" });
});

it("falls back to map for a bad tab", () => {
  expect(match("/storms/2024-05-28/nope")).toEqual({ kind: "storms", date: "2024-05-28", tab: "map" });
});

it("gives the area for the four later areas", () => {
  expect(match("/scorecard")).toEqual({ kind: "area", area: "scorecard" });
  expect(match("/pipeline")).toEqual({ kind: "area", area: "pipeline" });
});

it("gives not-found for an unknown path or a bad date", () => {
  expect(match("/unknown")).toEqual({ kind: "not-found" });
  expect(match("/storms/yesterday")).toEqual({ kind: "not-found" });
  expect(match("/storms/2024-05-28/map/extra")).toEqual({ kind: "not-found" });
});

it("builds paths without query strings", () => {
  expect(href({ area: "storms", date: "2024-05-28", tab: "data" })).toBe("/storms/2024-05-28/data");
  expect(href({ area: "storms", date: "2024-05-28" })).toBe("/storms/2024-05-28/map");
  expect(href({ area: "method" })).toBe("/method");
});