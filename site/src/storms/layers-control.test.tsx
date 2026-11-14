import type { ComponentChild, VNode } from "preact";
import { describe, expect, it } from "vitest";
import { LayersControl } from "./layers-control";

type Node = VNode<Record<string, unknown>>;

function collectInputs(node: ComponentChild, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) collectInputs(child as ComponentChild, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const vnode = node as Node;
  if (vnode.type === "input") out.push(vnode);
  return collectInputs(vnode.props["children"] as ComponentChild, out);
}

describe("LayersControl form input names (US-01.1)", () => {
  it("assigns distinct non-empty name attributes to all three layer checkboxes", () => {
    const tree = LayersControl({
      layers: { swath: true, reports: true, warnings: false },
      warnings: { available: true, note: null },
      onToggle: () => {},
    });
    const inputs = collectInputs(tree);
    expect(inputs.map((n) => n.props["name"])).toEqual(["layer-swath", "layer-reports", "layer-warnings"]);
  });
});
