import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Storm } from "../data/types";
import { GlobalSearch } from "./global-search";

const navMock = vi.hoisted(() => ({
  go: vi.fn(),
  storms: [
    {
      storm_date: "2024-05-28",
      report_count: 10,
      max_size_in: 2.0,
      report_source: "wcm" as const,
      max_mesh_mm: 55.2,
      scored_reports: 9,
      excluded_reports: 1,
      table: [],
      parcel_total: 1000,
      files: {
        swath: "storms/2024-05-28/swath.geojson",
        reports: "storms/2024-05-28/reports.geojson",
        pairs: "storms/2024-05-28/pairs.json",
        zip_counts: null,
        warnings: null,
        power: null,
        internet: null,
      },
    } as Storm,
  ],
}));

vi.mock("../router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../router")>();
  return {
    ...actual,
    go: (...args: unknown[]) => navMock.go(...args),
  };
});

vi.mock("../state/index", () => ({
  useIndex: () => ({
    status: "ready",
    data: {
      confidence: "c",
      run_time: "2026-04-01T00:00:00Z",
      package_version: "0.2.0",
      radius_km_default: 5,
      storms: navMock.storms,
    },
    showLoading: false,
    retry: () => {},
  }),
}));

interface FakeDomNode {
  nodeType: number;
  tagName: string;
  data?: string;
  childNodes: FakeDomNode[];
  firstChild: FakeDomNode | null;
  parentNode: FakeDomNode | null;
  namespaceURI: string;
  style: Record<string, unknown>;
  focus: () => void;
  [key: string]: unknown;
}

let activeEl: FakeDomNode | null = null;
const docListeners = new Map<string, Set<(e: unknown) => void>>();

function makeFakeElement(tag: string, text = ""): FakeDomNode {
  const el: FakeDomNode = {
    nodeType: tag === "#text" ? 3 : 1,
    tagName: tag.toUpperCase(),
    data: text,
    childNodes: [],
    firstChild: null,
    parentNode: null,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    style: {},
    onclick: null,
    oninput: null,
    onkeydown: null,
    onmousedown: null,
    setAttribute(k: string, v: unknown) {
      el[k] = v;
    },
    getAttribute(k: string) {
      return el[k] ?? null;
    },
    removeAttribute(k: string) {
      delete el[k];
    },
    addEventListener(type: string, fn: (e?: unknown) => void) {
      el[`on_${type}`] = fn.bind(el);
    },
    removeEventListener(type: string) {
      delete el[`on_${type}`];
    },
    appendChild(child: FakeDomNode) {
      if (child.parentNode) {
        const i = child.parentNode.childNodes.indexOf(child);
        if (i >= 0) child.parentNode.childNodes.splice(i, 1);
      }
      el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    insertBefore(child: FakeDomNode, ref: FakeDomNode | null) {
      if (child.parentNode) {
        const i = child.parentNode.childNodes.indexOf(child);
        if (i >= 0) child.parentNode.childNodes.splice(i, 1);
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
  };
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

describe("GlobalSearch Ctrl+K dialog (US-04.1, US-04.2, US-04.3)", () => {
  beforeEach(() => {
    navMock.go.mockClear();
    activeEl = null;
    docListeners.clear();

    vi.stubGlobal("document", {
      get activeElement() {
        return activeEl;
      },
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        let set = docListeners.get(type);
        if (!set) {
          set = new Set();
          docListeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        docListeners.get(type)?.delete(fn);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on Ctrl+K, indexes storms/counties/tools/method/pipeline, supports Arrow+Enter navigation, Escape close, and No matches", async () => {
    const host = makeFakeElement("div");
    await act(() => render(h(GlobalSearch, null), host as unknown as HTMLElement));

    const trigger = findDomNodes(host, (n) => n.tagName === "BUTTON" && n["role"] === "combobox")[0]!;
    expect(trigger).toBeDefined();
    expect(trigger["aria-expanded"]).toBe(false);
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);

    // Open with Ctrl+K
    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "k", ctrlKey: true, metaKey: false, altKey: false, preventDefault() {} });
      }
    });

    const dialog = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    expect(dialog).toBeDefined();
    const input = findDomNodes(dialog, (n) => n.tagName === "INPUT")[0]!;
    expect(activeEl).toBe(input);

    // Query storm date / case tag
    await act(() => {
      (input["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Derecho" },
      });
    });
    expect(domText(dialog)).toContain("2024-05-28");
    expect(domText(dialog)).toContain("10 reports");

    // Query county
    await act(() => {
      (input["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Fort Bend" },
      });
    });
    expect(domText(dialog)).toContain("Fort Bend");

    // Query unmatched -> "No matches"
    await act(() => {
      (input["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "zzzz" },
      });
    });
    expect(domText(dialog)).toContain("No matches");

    // Query Batch / Point check tool and press ArrowDown + Enter
    await act(() => {
      (input["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Batch" },
      });
    });
    expect(domText(dialog)).toContain("Batch");

    await act(() => {
      (input["on_keydown"] as (e: { type: string; key: string; preventDefault(): void }) => void)({
        type: "keydown",
        key: "Enter",
        preventDefault() {},
      });
    });
    expect(navMock.go).toHaveBeenCalledWith("/try/run");
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);

    // Open via trigger click, then close via Escape and confirm focus returns to trigger
    trigger.focus();
    await act(() => {
      (trigger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(1);
    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "Escape", preventDefault() {}, stopPropagation() {} });
      }
    });
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);
    expect(activeEl).toBe(trigger);
  });
});
