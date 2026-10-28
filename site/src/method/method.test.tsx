import type { ComponentChild, VNode } from "preact";
import { expect, it } from "vitest";
import { METHOD_LABELS, METHOD_PAGES } from "../router";
import { Blocks } from "./blocks";
import { METHOD_CONTENT } from "./content";
import { PageList } from "./method";

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

const links = (node: ComponentChild) => findAll(node, (v) => typeof v.props["href"] === "string");

it("lists every Method page in the nav, the Impacts page last", () => {
  const rows = links(PageList({ page: "data", onNavigate: () => {} }));
  expect(rows.map((v) => [textOf(v), v.props["href"]])).toEqual(
    METHOD_PAGES.map((p) => [METHOD_LABELS[p], `/method/${p}`]),
  );
  expect(rows.at(-1)?.props["href"]).toBe("/method/impacts");
  expect(textOf(rows.at(-1))).toBe("Impacts");
});

it("marks only the current page in the nav", () => {
  const rows = links(PageList({ page: "impacts", onNavigate: () => {} }));
  const current = rows.filter((v) => v.props["aria-current"] === "page");
  expect(current.map((v) => v.props["href"])).toEqual(["/method/impacts"]);
});

it("renders the Impacts blocks: four headings, four sources, and the fill legends as the one figure", () => {
  const index = { status: "loading", showLoading: false, retry: () => {} } as const;
  const tree = Blocks({ blocks: METHOD_CONTENT.impacts.blocks, index });
  expect(findAll(tree, (v) => v.type === "h2").map(textOf)).toEqual(["NWS warnings", "Power out", "Internet reachability", "Gaps"]);
  const sources = findAll(tree, (v) => v.type === "p").map(textOf).filter((t) => t.startsWith("Source:"));
  expect(sources).toHaveLength(4);
  const figures = findAll(tree, (v) => v.props["class"] === "figure");
  expect(figures).toHaveLength(1);
  // the figure child is a component vnode; call it as a plain function to read its legends
  const child = (figures[0]!.props["children"] as Node);
  const text = textOf((child.type as (props: object) => ComponentChild)(child.props));
  expect(text).toContain("Customers out");
  expect(text).toContain("Reachability below baseline");
});
