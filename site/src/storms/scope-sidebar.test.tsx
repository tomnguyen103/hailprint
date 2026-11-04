import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { h, render, type ComponentChild, type VNode } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

interface FakeDomNode {
  nodeType: number;
  tagName: string;
  data?: string;
  childNodes: FakeDomNode[];
  firstChild: FakeDomNode | null;
  parentNode: FakeDomNode | null;
  namespaceURI: string;
  style: Record<string, unknown>;
  [key: string]: unknown;
}

class FakeHTMLElement {}

let activeEl: FakeDomNode | null = null;

function makeFakeElement(tag: string, text = ""): FakeDomNode {
  const el = Object.assign(new FakeHTMLElement(), {
    nodeType: tag === "#text" ? 3 : 1,
    tagName: tag.toUpperCase(),
    data: text,
    childNodes: [] as FakeDomNode[],
    firstChild: null as FakeDomNode | null,
    parentNode: null as FakeDomNode | null,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    style: {},
    onclick: null,
    onkeydown: null,
    ontoggle: null,
    setAttribute(k: string, v: unknown) {
      if (k === "open") el["open"] = v === "" || Boolean(v);
      else el[k] = v;
    },
    getAttribute(k: string) {
      return el[k] ?? null;
    },
    removeAttribute(k: string) {
      if (k === "open") el["open"] = false;
      else delete el[k];
    },
    addEventListener(type: string, fn: (e?: unknown) => void) {
      el[`on_${type}`] = fn.bind(el);
    },
    removeEventListener(type: string) {
      delete el[`on_${type}`];
    },
    appendChild(child: FakeDomNode) {
      if (child.parentNode) {
        const prev = child.parentNode.childNodes;
        const i = prev.indexOf(child);
        if (i >= 0) prev.splice(i, 1);
      }
      el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    insertBefore(child: FakeDomNode, ref: FakeDomNode | null) {
      if (child.parentNode) {
        const prev = child.parentNode.childNodes;
        const i = prev.indexOf(child);
        if (i >= 0) prev.splice(i, 1);
      }
      const idx = ref ? el.childNodes.indexOf(ref) : -1;
      if (idx >= 0) el.childNodes.splice(idx, 0, child);
      else el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    removeChild(child: FakeDomNode) {
      const idx = el.childNodes.indexOf(child);
      if (idx >= 0) el.childNodes.splice(idx, 1);
      child.parentNode = null;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    focus() {
      activeEl = el;
    },
    contains(target: unknown): boolean {
      if (target === el) return true;
      return el.childNodes.some((c) => typeof c.contains === "function" && (c.contains as (t: unknown) => boolean)(target));
    },
    closest(selector: string): FakeDomNode | null {
      if (selector === "details:not([open])") {
        let cur: FakeDomNode | null = el.parentNode;
        while (cur) {
          if (cur.tagName === "DETAILS" && !cur["open"]) return cur;
          cur = cur.parentNode;
        }
      }
      return null;
    },
    querySelectorAll(selector: string): FakeDomNode[] {
      const out: FakeDomNode[] = [];
      const walk = (n: FakeDomNode) => {
        for (const c of n.childNodes) {
          if (selector.includes("summary") && (c.tagName === "SUMMARY" || (c.tagName === "A" && c["href"] !== undefined))) {
            out.push(c);
          }
          walk(c);
        }
      };
      walk(el);
      return out;
    },
  }) as unknown as FakeDomNode;
  return el;
}

function findDomNodes(root: FakeDomNode, match: (n: FakeDomNode) => boolean, out: FakeDomNode[] = []): FakeDomNode[] {
  if (match(root)) out.push(root);
  for (const child of root.childNodes) findDomNodes(child, match, out);
  return out;
}

function domText(node: FakeDomNode): string {
  if (node.nodeType === 3) return String(node.data ?? "");
  return node.childNodes.map(domText).join("");
}

describe("ScopeSidebar (US-15.1, US-15.2, US-15.3, US-15.4)", () => {
  beforeEach(() => {
    activeEl = null;
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("document", {
      get activeElement() {
        return activeEl;
      },
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders two-line row structure: row 1 with mono date and report-count badge, row 2 with impact chips when present (US-15.1)", async () => {
    const storms = [
      makeStorm("2026-08-28", 3, { warnings: "w.geojson" }),
      makeStorm("2024-05-28", 12, {
        power: "p.json",
        internet: "i.json",
        warnings: "w.geojson",
      }),
      makeStorm("2023-06-23", 4),
    ];
    const host = makeFakeElement("div");
    await act(() =>
      render(h(ScopeSidebar, { storms, current: storms[0]!, open: false, onClose: () => {} }), host as unknown as HTMLElement),
    );

    const items = findDomNodes(host, (n) => n.tagName === "LI");
    expect(items).toHaveLength(3);

    // Row 1 holds mono date + badge inside .scope-row-top; row 2 holds impact chips inside .scope-badges
    const topRows = findDomNodes(items[1]!, (n) => n["class"] === "scope-row-top");
    expect(topRows).toHaveLength(1);
    expect(domText(topRows[0]!)).toContain("2024-05-28");
    expect(domText(topRows[0]!)).toContain("12");

    const chips = (item: FakeDomNode) =>
      findDomNodes(item, (n) => n["class"] === "scope-chip").map((c) => domText(c).trim());

    expect(chips(items[0]!)).toEqual(["warnings"]);
    expect(chips(items[1]!)).toEqual(["power", "internet", "warnings"]);
    expect(chips(items[2]!)).toEqual([]);
  });

  it("moves focus with ArrowDown, ArrowUp, Home, and End across visible year summaries and storm links (US-15.2)", async () => {
    const storms = [
      makeStorm("2026-08-28", 3),
      makeStorm("2025-05-01", 8),
      makeStorm("2024-05-28", 12),
    ];
    const host = makeFakeElement("div");
    await act(() =>
      render(h(ScopeSidebar, { storms, current: storms[0]!, open: false, onClose: () => {} }), host as unknown as HTMLElement),
    );

    const nav = findDomNodes(host, (n) => n.tagName === "NAV")[0]!;
    const summaries = findDomNodes(nav, (n) => n.tagName === "SUMMARY");
    const links = findDomNodes(nav, (n) => n.tagName === "A");
    // 2026 is open (summary 0 + link 0); 2025 is closed (summary 1 only); 2024 is closed (summary 2 only)
    summaries[0]!.focus();
    expect(activeEl).toBe(summaries[0]);

    const sendKey = (key: string) => {
      let prevented = false;
      const fn = (nav["on_keydown"] ?? nav["on_KeyDown"]) as ((e: unknown) => void) | undefined;
      fn?.({
        type: "keydown",
        key,
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    };

    expect(sendKey("ArrowDown")).toBe(true);
    expect(activeEl).toBe(links[0]);

    // Next ArrowDown skips links inside closed 2025 details and lands on 2025 summary
    expect(sendKey("ArrowDown")).toBe(true);
    expect(activeEl).toBe(summaries[1]);

    expect(sendKey("End")).toBe(true);
    expect(activeEl).toBe(summaries[2]);

    expect(sendKey("Home")).toBe(true);
    expect(activeEl).toBe(summaries[0]);

    expect(sendKey("ArrowUp")).toBe(true);
    expect(activeEl).toBe(summaries[2]);
  });

  it("keeps opened or closed year state across re-renders and route changes (US-15.3)", async () => {
    const storms = [
      makeStorm("2026-08-28", 3),
      makeStorm("2025-05-01", 8),
      makeStorm("2024-05-28", 12),
    ];
    const host = makeFakeElement("div");
    await act(() =>
      render(h(ScopeSidebar, { storms, current: storms[0]!, open: false, onClose: () => {} }), host as unknown as HTMLElement),
    );

    const getDetails = () => findDomNodes(host, (n) => n.tagName === "DETAILS");
    expect(Boolean(getDetails()[0]!["open"])).toBe(true); // 2026 (newest + current)
    expect(Boolean(getDetails()[1]!["open"])).toBe(false); // 2025

    // User opens 2025; in a real browser native details toggles open on the DOM node without changing the previous vnode prop
    await act(() => {
      const d2025 = getDetails()[1]!;
      d2025["open"] = true;
      const onToggle = (d2025["on_toggle"] ?? d2025["on_Toggle"]) as ((e: unknown) => void) | undefined;
      onToggle?.({ type: "toggle", currentTarget: d2025 });
    });
    expect(Boolean(getDetails()[1]!["open"])).toBe(true);

    // Re-render on route change to 2024-05-28: 2025 stays open AND 2024 opens for the new current storm
    await act(() => {
      render(h(ScopeSidebar, { storms, current: storms[2]!, open: false, onClose: () => {} }), host as unknown as HTMLElement);
    });
    expect(Boolean(getDetails()[0]!["open"])).toBe(true);
    expect(Boolean(getDetails()[1]!["open"])).toBe(true);
    expect(Boolean(getDetails()[2]!["open"])).toBe(true);

    // User closes 2026: 2026 stays closed across subsequent re-render when current is 2024-05-28
    await act(() => {
      const d2026 = getDetails()[0]!;
      d2026["open"] = false;
      const onToggle = (d2026["on_toggle"] ?? d2026["on_Toggle"]) as ((e: unknown) => void) | undefined;
      onToggle?.({ type: "toggle", currentTarget: d2026 });
    });
    await act(() => {
      render(h(ScopeSidebar, { storms, current: storms[2]!, open: true, onClose: () => {} }), host as unknown as HTMLElement);
    });
    expect(Boolean(getDetails()[0]!["open"])).toBe(false);
    expect(Boolean(getDetails()[1]!["open"])).toBe(true);
    expect(Boolean(getDetails()[2]!["open"])).toBe(true);
    expect(domText(getDetails()[1]!)).toContain("2025");
  });

  it("replaces the 56 px vertical tablet rail with a horizontal scope bar from 768 to 1279 px (US-15.4)", () => {
    const css = readFileSync(fileURLToPath(new URL("../styles/scope.css", import.meta.url)), "utf8");
    expect(css).not.toContain("56px");
    expect(css).not.toContain("vertical-rl");
  });

  it("passes id='storms-scope' to ScopeDrawer", async () => {
    const storms = [makeStorm("2024-05-28", 12)];
    const host = makeFakeElement("div");
    await act(() =>
      render(h(ScopeSidebar, { storms, current: storms[0]!, open: true, onClose: () => {} }), host as unknown as HTMLElement),
    );
    const nav = findDomNodes(host, (n) => n.tagName === "NAV")[0]!;
    expect(nav["id"]).toBe("storms-scope");
  });
});
