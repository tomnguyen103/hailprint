import type { ComponentChild, VNode } from "preact";
import { describe, expect, it } from "vitest";
import { DataError } from "../data/types";
import { FORBIDDEN_WORD } from "../method/prose";
import { ODIN_LABEL } from "./power";
import { fillNotes, InternetLegend, PowerFillControl, PowerLegend } from "./power-fill";

type Node = VNode<Record<string, unknown>>;

function findAll(node: ComponentChild, match: (vnode: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ComponentChild, match, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const vnode = node as Node;
  if (match(vnode)) out.push(vnode);
  return findAll(vnode.props["children"] as ComponentChild, match, out);
}

function textOf(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map((child) => textOf(child as ComponentChild)).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return textOf((node as Node).props["children"] as ComponentChild);
}

const withClass = (name: string) => (v: Node) => typeof v.props["class"] === "string" && v.props["class"].split(" ").includes(name);

const READY = { available: true, note: null };

describe("the fill control", () => {
  it("offers None, Power, and Internet and reports a pick", () => {
    const picks: string[] = [];
    const tree = PowerFillControl({ fill: "none", power: READY, internet: READY, onFill: (fill) => void picks.push(fill) });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios.map((r) => r.props["type"])).toEqual(["radio", "radio", "radio"]);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false, false]);
    expect(radios.map((r) => r.props["disabled"])).toEqual([false, false, false]);
    expect(textOf(tree)).toContain("None");
    expect(textOf(tree)).toContain("Power");
    expect(textOf(tree)).toContain("Internet");
    (radios[1]!.props["onChange"] as () => void)();
    (radios[2]!.props["onChange"] as () => void)();
    expect(picks).toEqual(["power", "internet"]);
  });

  it("turns Power off and shows one line when the file is unavailable", () => {
    const power = { available: false, note: "Power off. power.json: HTTP 404" };
    const tree = PowerFillControl({ fill: "power", power, internet: READY, onFill: () => {} });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios.map((r) => r.props["disabled"])).toEqual([false, true, false]);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false, false]);
    expect(textOf(tree)).toContain("Power off. power.json: HTTP 404");
  });
});

describe("the fill control with the internet file", () => {
  it("turns Internet off and shows one line when the file is unavailable", () => {
    const internet = { available: false, note: "No internet file for this storm date." };
    const tree = PowerFillControl({ fill: "internet", power: READY, internet, onFill: () => {} });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios.map((r) => r.props["disabled"])).toEqual([false, false, true]);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false, false]);
    expect(textOf(tree)).toContain("No internet file for this storm date.");
  });

  it("keeps Power usable and checked when only the internet file failed", () => {
    const internet = { available: false, note: "Internet reachability off. internet.json: HTTP 500" };
    const radios = findAll(PowerFillControl({ fill: "power", power: READY, internet, onFill: () => {} }), (v) => v.type === "input");
    expect(radios.map((r) => r.props["checked"])).toEqual([false, true, false]);
    expect(radios.map((r) => r.props["disabled"])).toEqual([false, false, true]);
  });
});

describe("the fill notes", () => {
  const files = { power: "power.json", internet: "internet.json" };
  const ready = { status: "ready", data: null } as const;
  const outlinesFailed = { status: "error", error: new DataError("counties.geojson", "HTTP 500") } as const;

  it("names a failed county outline file on the power line and never on the internet line", () => {
    expect(fillNotes(files, ready, ready, outlinesFailed)).toEqual({
      power: "Power off. counties.geojson: HTTP 500",
      internet: null,
    });
  });

  it("keeps the outline error on the power line when the power file is off too", () => {
    const failed = { status: "error", error: new DataError("power.json", "HTTP 500") } as const;
    expect(fillNotes(files, failed, ready, outlinesFailed).power).toBe("Power off. power.json: HTTP 500 counties.geojson: HTTP 500");
    expect(fillNotes({ ...files, power: null }, ready, ready, outlinesFailed).power).toBe(
      "No power file for this storm date. counties.geojson: HTTP 500",
    );
    expect(fillNotes({ ...files, power: null }, ready, ready, ready, "2026-04-30").power).toBe(
      "No power source for this date.",
    );
  });

  it("keeps the note of an internet file that failed", () => {
    const failed = { status: "error", error: new DataError("internet.json", "HTTP 500") } as const;
    expect(fillNotes(files, ready, failed, outlinesFailed).internet).toBe("Internet reachability off. internet.json: HTTP 500");
    expect(fillNotes({ ...files, internet: null }, ready, ready, outlinesFailed).internet).toBe("No internet file for this storm date.");
  });

  it("draws no note while every file loads or is ready", () => {
    expect(fillNotes(files, ready, ready, { status: "loading" })).toEqual({ power: null, internet: null });
    expect(fillNotes(files, ready, ready, ready)).toEqual({ power: null, internet: null });
  });
});

describe("the internet legend", () => {
  it("draws nothing unless the internet fill is chosen", () => {
    expect(InternetLegend({ fill: "none" })).toBeNull();
    expect(InternetLegend({ fill: "power" })).toBeNull();
  });

  it("lists the five drop bins with text, a plain 0% swatch, and a hatched Missing swatch", () => {
    const tree = InternetLegend({ fill: "internet" });
    const text = textOf(tree);
    for (const label of ["0%", "above 0 to 2%", "2 to 5%", "5 to 10%", "10 to 20%", "20% or more", "Missing", "below baseline"]) {
      expect(text).toContain(label);
    }
    const swatches = findAll(tree, withClass("power-swatch"));
    const colours = swatches.map((s) => (s.props["style"] as { background?: string } | undefined)?.background);
    expect(colours.slice(1, 6)).toEqual(["var(--net-1)", "var(--net-2)", "var(--net-3)", "var(--net-4)", "var(--net-5)"]);
    expect(findAll(tree, withClass("power-swatch-gap"))).toHaveLength(1);
  });

  it("never says the internet is down or names a cause", () => {
    const words = (textOf(InternetLegend({ fill: "internet" })) + textOf(PowerFillControl({ fill: "none", power: READY, internet: READY, onFill: () => {} }))).toLowerCase();
    for (const banned of ["down", FORBIDDEN_WORD, "caused", "because"]) expect(words).not.toContain(banned);
  });
});

describe("the power legend", () => {
  it("draws nothing with the fill off", () => {
    expect(PowerLegend({ fill: "none", source: "eaglei" })).toBeNull();
  });

  it("lists the five bins with text, a plain None swatch, and a hatched Missing swatch", () => {
    const tree = PowerLegend({ fill: "power", source: "eaglei" });
    const text = textOf(tree);
    for (const label of ["0%", "0 to 1%", "1 to 5%", "5 to 15%", "15 to 30%", "30% or more", "Missing"]) {
      expect(text).toContain(label);
    }
    const swatches = findAll(tree, withClass("power-swatch"));
    const gap = findAll(tree, withClass("power-swatch-gap"));
    expect(swatches.length).toBeGreaterThanOrEqual(7);
    expect(gap).toHaveLength(1);
    const colours = swatches.map((s) => (s.props["style"] as { background?: string } | undefined)?.background);
    expect(colours.slice(1, 6)).toEqual(["var(--out-1)", "var(--out-2)", "var(--out-3)", "var(--out-4)", "var(--out-5)"]);
    expect(gap[0]!.props["style"]).toBeUndefined();
  });

  it("shows the CenterPoint label for an ODIN file and none for EAGLE-I", () => {
    const odin = textOf(PowerLegend({ fill: "power", source: "odin" }));
    expect(odin).toContain(ODIN_LABEL);
    expect(odin).toContain("Lower bound");
    expect(textOf(PowerLegend({ fill: "power", source: "eaglei" }))).not.toContain(ODIN_LABEL);
  });
});
