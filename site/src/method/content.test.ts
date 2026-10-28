import { expect, it } from "vitest";
import { METHOD_PAGES } from "../router";
import { CAVEAT } from "../shell/caveat";
import { METHOD_CONTENT } from "./content";
import { proseFindings, sentences } from "./prose";

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
    impacts: ["bins"],
  });
});

/** Every text of the Impacts page in order: headings, prose, and list items. */
function impactTexts(): string[] {
  return METHOD_CONTENT.impacts.blocks.flatMap((b) => (b.kind === "list" ? b.items : "text" in b ? [b.text] : []));
}

const attributionLines = () => impactTexts().filter((text) => text.startsWith("Source:"));

it("gives each impact source its attribution line", () => {
  const lines = attributionLines();
  expect(lines).toHaveLength(4);
  expect(lines[0]).toContain("Iowa Environmental Mesonet (IEM)");
  expect(lines[0]).toContain("Credit IEM");
  expect(lines[1]).toContain("EAGLE-I");
  expect(lines[1]).toContain("Oak Ridge National Laboratory (ORNL)");
  expect(lines[1]).toContain("CC BY 4.0");
  expect(lines[2]).toContain("ODIN");
  expect(lines[2]).toContain("ORNL");
  expect(lines[3]).toContain("IODA");
  expect(lines[3]).toContain("Georgia Tech");
  expect(lines[3]).toContain("All Rights Reserved");
});

it("explains the warnings, the power layer, the internet layer, and the gap rule under four headings", () => {
  const headings = METHOD_CONTENT.impacts.blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []));
  expect(headings).toEqual(["NWS warnings", "Power out", "Internet reachability", "Gaps"]);
});

it("puts the fill legends before the first section so every section sits below the fold", () => {
  const kinds = METHOD_CONTENT.impacts.blocks.map((b) => b.kind);
  expect(kinds.indexOf("figure")).toBe(1);
  expect(METHOD_CONTENT.impacts.blocks[1]).toEqual({ kind: "figure", id: "bins" });
});

it("states the internet baseline, the ratio, the drop, the coverage, and the publish gate", () => {
  const text = impactTexts().join(" ");
  expect(text).toContain("median of the 7 days before the window starts");
  expect(text).toContain("The ratio is the signal divided by the baseline.");
  expect(text).toContain("The drop is 1 minus the ratio, never below zero.");
  expect(text).toContain("from 2022-03 to 2024-05 only");
  expect(text).toContain("has no internet file");
  expect(text).toContain("reads No county signal.");
  expect(text).toContain("--with-internet");
  expect(text).toContain("internet reachability below baseline");
});

it("never calls the internet failed and never names a cause for a drop", () => {
  const text = impactTexts().join(" ").toLowerCase();
  // joined here so the banned phrases stay out of the site source scan in tests/test_wording.py
  const banned = [["internet", "down"], ["caused", "by", "hail"], ["because", "of", "hail"]].map((words) => words.join(" "));
  for (const phrase of [...banned, "outage"]) expect(text).not.toContain(phrase);
});

it("lists internet.json among the published files on the Data page", () => {
  const items = METHOD_CONTENT.data.blocks.flatMap((b) => (b.kind === "list" ? b.items : []));
  expect(items.filter((item) => item.startsWith("internet.json:"))).toHaveLength(1);
  const sources = METHOD_CONTENT.data.blocks.flatMap((b) => (b.kind === "prose" ? [b.text] : [])).join(" ");
  expect(sources).toContain("IODA publishes the county internet reachability signal.");
});

it("names the MCC 2022 denominator, the CenterPoint limit, and the one-source rule", () => {
  const text = impactTexts().join(" ");
  expect(text).toContain("divided by the MCC");
  expect(text).toContain("2022");
  expect(text).toContain("CenterPoint customers only");
  expect(text).toContain("lower bound");
  expect(text).toContain("One file never mixes the two");
});

it("writes the gap rule as null, never a zero", () => {
  const text = impactTexts().join(" ");
  expect(text).toContain("A step with no source row is null.");
  expect(text).toContain("never a zero");
});

it("says the layers show the same window and never claims a cause", () => {
  const text = impactTexts().join(" ");
  expect(text).toContain("in the same window as the storm");
  const causal = sentences(text).filter((s) => /\b(caus\w*|because|due to|led to|results? in)\b/i.test(s));
  expect(causal).toEqual(["No layer says hail caused it."]);
});

it("ends the Limits page with the caveat line", () => {
  const caveats = METHOD_CONTENT.limits.blocks.filter((b) => b.kind === "caveat");
  expect(caveats).toEqual([{ kind: "caveat", text: CAVEAT }]);
  expect(METHOD_CONTENT.limits.blocks.at(-1)).toEqual({ kind: "caveat", text: CAVEAT });
});

it("names every page with its label", () => {
  for (const page of METHOD_PAGES) expect(METHOD_CONTENT[page].title.length).toBeGreaterThan(0);
});
