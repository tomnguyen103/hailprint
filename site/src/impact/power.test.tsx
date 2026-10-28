import type { ComponentChild, VNode } from "preact";
import { describe, expect, it } from "vitest";
import { ODIN_LABEL } from "./power";
import { PowerFillControl, PowerLegend } from "./power-fill";

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

describe("the fill control", () => {
  it("offers None and Power and reports a pick", () => {
    const picks: string[] = [];
    const tree = PowerFillControl({ fill: "none", available: true, note: null, onFill: (fill) => void picks.push(fill) });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios.map((r) => r.props["type"])).toEqual(["radio", "radio"]);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false]);
    expect(textOf(tree)).toContain("None");
    expect(textOf(tree)).toContain("Power");
    (radios[1]!.props["onChange"] as () => void)();
    expect(picks).toEqual(["power"]);
  });

  it("turns Power off and shows one line when the file is unavailable", () => {
    const tree = PowerFillControl({ fill: "power", available: false, note: "Power off. power.json: HTTP 404", onFill: () => {} });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios[1]!.props["disabled"]).toBe(true);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false]);
    expect(textOf(tree)).toContain("Power off. power.json: HTTP 404");
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
