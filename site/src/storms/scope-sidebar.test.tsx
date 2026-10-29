import type { ComponentChild, VNode } from "preact";
import { describe, expect, it } from "vitest";
import type { Storm, StormFiles } from "../data/types";
import { ScopeSidebar } from "./scope-sidebar";

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
  const vnode = node as Node;
  return textOf(vnode.props["children"] as ComponentChild);
}

function makeStorm(storm_date: string, report_count: number, files: Partial<StormFiles> = {}): Storm {
  return {
    storm_date,
    report_count,
    max_size_in: 1.5,
    report_source: "wcm",
    max_mesh_mm: 35,
    scored_reports: report_count,
    excluded_reports: 0,
    table: [],
    parcel_total: null,
    files: {
      swath: `storms/${storm_date}/swath.geojson`,
      reports: `storms/${storm_date}/reports.geojson`,
      pairs: `storms/${storm_date}/pairs.json`,
      zip_counts: null,
      warnings: null,
      power: null,
      internet: null,
      ...files,
    },
  };
}

describe("ScopeSidebar", () => {
  it("renders one chip per present impact layer beside the report-count badge", () => {
    const storms = [
      makeStorm("2026-08-28", 3, { warnings: "w.geojson" }),
      makeStorm("2024-05-28", 12, {
        power: "p.json",
        internet: "i.json",
        warnings: "w.geojson",
      }),
      makeStorm("2023-06-23", 4),
    ];
    const tree = ScopeSidebar({
      storms,
      current: storms[0]!,
      open: false,
      onClose: () => {},
    });

    const items = findAll(tree, (v) => v.type === "li");
    expect(items).toHaveLength(3);

    const chips = (item: Node) =>
      findAll(item, (v) => v.props["class"] === "scope-chip").map((c) => textOf(c).trim());

    expect(chips(items[0]!)).toEqual(["warnings"]);
    expect(chips(items[1]!)).toEqual(["power", "internet", "warnings"]);
    expect(chips(items[2]!)).toEqual([]);
  });

  it("passes id='storms-scope' to ScopeDrawer", () => {
    const storms = [makeStorm("2024-05-28", 12)];
    const tree = ScopeSidebar({
      storms,
      current: storms[0]!,
      open: true,
      onClose: () => {},
    }) as Node;
    expect(tree.props["id"]).toBe("storms-scope");
  });
});
