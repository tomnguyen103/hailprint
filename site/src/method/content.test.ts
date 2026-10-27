import { expect, it } from "vitest";
import { METHOD_PAGES } from "../router";
import { CAVEAT } from "../shell/caveat";
import { METHOD_CONTENT } from "./content";
import { proseFindings } from "./prose";

it("keeps every Method page inside the prose budget", () => {
  expect(proseFindings(METHOD_CONTENT)).toEqual([]);
});

it("sets the figure blocks per page", () => {
  const figures = Object.fromEntries(
    METHOD_PAGES.map((page) => [page, METHOD_CONTENT[page].blocks.flatMap((b) => (b.kind === "figure" ? [b.id] : []))]),
  );
  expect(figures).toEqual({
    data: ["receipt"],
    "storm-date": ["stamp"],
    "size-classes": ["ruler"],
    scoring: ["grid", "guess"],
    limits: [],
  });
});

it("ends the Limits page with the caveat line", () => {
  const caveats = METHOD_CONTENT.limits.blocks.filter((b) => b.kind === "caveat");
  expect(caveats).toEqual([{ kind: "caveat", text: CAVEAT }]);
  expect(METHOD_CONTENT.limits.blocks.at(-1)).toEqual({ kind: "caveat", text: CAVEAT });
});

it("names every page with its label", () => {
  for (const page of METHOD_PAGES) expect(METHOD_CONTENT[page].title.length).toBeGreaterThan(0);
});
