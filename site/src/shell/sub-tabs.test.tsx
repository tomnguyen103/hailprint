import type { VNode } from "preact";
import { describe, expect, it } from "vitest";
import { SubTabs } from "./sub-tabs";

type Props = Record<string, unknown> & { children?: unknown };

function walk(node: unknown, out: VNode<Props>[] = []): VNode<Props>[] {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === "object" && "props" in node) {
    const v = node as VNode<Props>;
    out.push(v);
    walk(v.props.children, out);
  }
  return out;
}

const tabs = [
  { id: "table", label: "Table", href: "/scorecard/table" },
  { id: "grid", label: "Grid", href: "/scorecard/grid" },
  { id: "curve", label: "Curve", href: "/scorecard/curve" },
];

describe("SubTabs (US-03.1)", () => {
  const root = SubTabs({ label: "Scorecard views", tabs, selected: "grid" }) as VNode<Props>;
  const all = walk(root);

  it("renders a nav named by the caller that holds one link per tab", () => {
    expect(root.type).toBe("nav");
    expect(root.props["aria-label"]).toBe("Scorecard views");
    const links = all.filter((n) => typeof n.type !== "string" || n.type === "a");
    expect(links.map((l) => l.props["href"])).toEqual(tabs.map((t) => t.href));
  });

  it("marks only the active link with aria-current page", () => {
    const current = all.filter((n) => n.props["aria-current"] === "page");
    expect(current).toHaveLength(1);
    expect(current[0]!.props["href"]).toBe("/scorecard/grid");
  });

  it("uses no tab roles, aria-selected, or roving tabindex", () => {
    for (const n of all) {
      expect(n.props["role"]).toBeUndefined();
      expect(n.props["aria-selected"]).toBeUndefined();
      expect(n.props["tabIndex"]).toBeUndefined();
      expect(n.props["onKeyDown"]).toBeUndefined();
    }
  });
});
