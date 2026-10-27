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

it("gives the method page, the first page when absent", () => {
  expect(match("/method")).toEqual({ kind: "method", page: "data" });
  expect(match("/method/scoring")).toEqual({ kind: "method", page: "scoring" });
  expect(match("/method/limits")).toEqual({ kind: "method", page: "limits" });
  expect(match("/method/nope")).toEqual({ kind: "not-found" });
  expect(match("/method/scoring/extra")).toEqual({ kind: "not-found" });
});

it("gives the pipeline view, runs when absent", () => {
  expect(match("/pipeline")).toEqual({ kind: "pipeline", view: "runs" });
  expect(match("/pipeline/archive")).toEqual({ kind: "pipeline", view: "archive" });
  expect(match("/pipeline/x")).toEqual({ kind: "not-found" });
});

it("builds method and pipeline paths", () => {
  expect(href({ area: "method", page: "scoring" })).toBe("/method/scoring");
  expect(href({ area: "pipeline" })).toBe("/pipeline");
  expect(href({ area: "pipeline", view: "archive" })).toBe("/pipeline/archive");
});

it("resolves Scorecard views, Table by default", () => {
  expect(match("/scorecard")).toEqual({ kind: "scorecard", view: "table" });
  expect(match("/scorecard/curve")).toEqual({ kind: "scorecard", view: "curve" });
  expect(match("/scorecard/nope")).toEqual({ kind: "not-found" });
});

it("resolves Try it tools, Tune by default", () => {
  expect(match("/try")).toEqual({ kind: "try", tool: "tune" });
  expect(match("/try/run")).toEqual({ kind: "try", tool: "run" });
  expect(match("/try/compare")).toEqual({ kind: "try", tool: "compare" });
  expect(match("/try/x")).toEqual({ kind: "not-found" });
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
  expect(href({ area: "scorecard" })).toBe("/scorecard");
  expect(href({ area: "scorecard", view: "grid" })).toBe("/scorecard/grid");
  expect(href({ area: "try", tool: "point" })).toBe("/try/point");
});