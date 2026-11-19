import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Storm } from "../data/types";
import { getSelectedCounty, resetSelectedCounty } from "../state/county";
import { GlobalSearch } from "./global-search";
import { ScopeDrawer } from "./scope-drawer";

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
  contains: (target: unknown) => boolean;
  querySelectorAll: (selector?: string) => FakeDomNode[];
  closest: () => FakeDomNode | null;
  [key: string]: unknown;
}

let activeEl: FakeDomNode | null = null;
const captureListeners = new Map<string, Set<(e: unknown) => void>>();
const bubbleListeners = new Map<string, Set<(e: unknown) => void>>();

function dispatchKey(init: Record<string, unknown>): { defaultPrevented: boolean; stoppedImmediate: boolean } {
  let defaultPrevented = false;
  let stoppedImmediate = false;
  const event = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {
      stoppedImmediate = true;
    },
  };
  for (const fn of [...(captureListeners.get("keydown") ?? [])]) {
    if (stoppedImmediate) break;
    fn(event);
  }
  if (!stoppedImmediate) {
    for (const fn of [...(bubbleListeners.get("keydown") ?? [])]) {
      if (stoppedImmediate) break;
      fn(event);
    }
  }
  return { defaultPrevented, stoppedImmediate };
}

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
    contains(target: unknown): boolean {
      if (target === el) return true;
      return el.childNodes.some((c) => c.contains(target));
    },
    closest() {
      return null;
    },
    querySelectorAll() {
      const out: FakeDomNode[] = [];
      const walk = (n: FakeDomNode) => {
        for (const c of n.childNodes) {
          if (
            c.tagName === "BUTTON" ||
            (c.tagName === "A" && c["href"] !== undefined) ||
            c.tagName === "INPUT" ||
            c.tagName === "SUMMARY"
          ) {
            if (!c["disabled"]) out.push(c);
          }
          walk(c);
        }
      };
      walk(el);
      return out;
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

describe("GlobalSearch Ctrl+K and / dialog (US-01.1, US-01.2, US-01.3, US-01.5)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    navMock.go.mockClear();
    resetSelectedCounty();
    activeEl = null;
    captureListeners.clear();
    bubbleListeners.clear();
    storage.clear();

    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
    });

    vi.stubGlobal("document", {
      get activeElement() {
        return activeEl;
      },
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) => {
        const bucket = capture ? captureListeners : bubbleListeners;
        let set = bucket.get(type);
        if (!set) {
          set = new Set();
          bucket.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) => {
        (capture ? captureListeners : bubbleListeners).get(type)?.delete(fn);
      },
    });
  });

  afterEach(() => {
    resetSelectedCounty();
    vi.unstubAllGlobals();
  });

  it("opens on Ctrl+K, keeps single combobox on input, includes Scorecard & Run, traps Tab/Shift+Tab, wires County selection, and clears query on Ctrl+K close", async () => {
    const host = makeFakeElement("div");
    await act(() => render(h(GlobalSearch, { storms: navMock.storms }), host as unknown as HTMLElement));

    const trigger = findDomNodes(host, (n) => n.tagName === "BUTTON" && n["aria-haspopup"] === "dialog")[0]!;
    expect(trigger).toBeDefined();
    expect(trigger["role"]).toBeUndefined();
    expect(trigger["aria-expanded"]).toBe(false);
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);

    // Ctrl+Shift+K is ignored
    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true, shiftKey: true });
    });
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);

    // Open with Ctrl+K
    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true });
    });

    const dialog = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    expect(dialog).toBeDefined();
    const comboboxes = findDomNodes(host, (n) => n["role"] === "combobox");
    expect(comboboxes).toHaveLength(1);
    const input = findDomNodes(dialog, (n) => n.tagName === "INPUT")[0]!;
    expect(comboboxes[0]).toBe(input);
    expect(activeEl).toBe(input);

    // Results grouped under role="group"
    const groups = findDomNodes(dialog, (n) => n["role"] === "group");
    expect(groups.length).toBeGreaterThan(0);

    // Tab focus trap wraps from last focusable back to first inside dialog
    const focusables = dialog.querySelectorAll();
    const last = focusables[focusables.length - 1]!;
    last.focus();
    let tabResult = { defaultPrevented: false, stoppedImmediate: false };
    await act(() => {
      tabResult = dispatchKey({ key: "Tab", shiftKey: false });
    });
    expect(tabResult.defaultPrevented).toBe(true);
    expect(activeEl).toBe(focusables[0]);

    // Shift+Tab when focus rests on the dialog root itself wraps to the last focusable
    dialog.focus();
    let shiftTabResult = { defaultPrevented: false, stoppedImmediate: false };
    await act(() => {
      shiftTabResult = dispatchKey({ key: "Tab", shiftKey: true });
    });
    expect(shiftTabResult.defaultPrevented).toBe(true);
    expect(activeEl).toBe(last);

    // Query Scorecard routes
    await act(() => {
      (input["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "scorecard" },
      });
    });
    const scorecardText = domText(dialog);
    expect(scorecardText).toContain("Table");
    expect(scorecardText).toContain("Grid");
    expect(scorecardText).toContain("Curve");

    // Closing via Ctrl+K clears query
    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true });
    });
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);
    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true });
    });
    const dialog2 = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    const input2 = findDomNodes(dialog2, (n) => n.tagName === "INPUT")[0]!;
    expect(input2["value"]).toBe("");

    // Query storm date / case tag
    await act(() => {
      (input2["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Derecho" },
      });
    });
    expect(domText(dialog2)).toContain("2024-05-28");
    expect(domText(dialog2)).toContain("10 reports");

    // Query unmatched -> "No matches"
    await act(() => {
      (input2["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "zzzz" },
      });
    });
    expect(domText(dialog2)).toContain("No matches");

    // Query Run tool via "Batch" keyword -> shows "Run" title and navigates to /try/run
    await act(() => {
      (input2["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Batch" },
      });
    });
    expect(domText(dialog2)).toContain("Run");
    expect(domText(dialog2)).not.toContain("Batch");

    await act(() => {
      (input2["on_keydown"] as (e: { type: string; key: string; preventDefault(): void }) => void)({
        type: "keydown",
        key: "Enter",
        preventDefault() {},
      });
    });
    expect(navMock.go).toHaveBeenCalledWith("/try/run");
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);
    expect(JSON.parse(storage.get("hailprint-recent-searches") ?? "[]")).toEqual(["tool-run"]);

    // Selecting a County updates shared selectedCounty store and routes to storm data
    await act(() => {
      (trigger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    const reopened = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    const firstGroup = findDomNodes(reopened, (n) => n["role"] === "group")[0]!;
    expect(domText(firstGroup)).toContain("Recent");
    expect(domText(firstGroup)).toContain("Run");

    const input3 = findDomNodes(reopened, (n) => n.tagName === "INPUT")[0]!;
    await act(() => {
      (input3["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Fort Bend" },
      });
    });
    await act(() => {
      (input3["on_keydown"] as (e: { type: string; key: string; preventDefault(): void }) => void)({
        type: "keydown",
        key: "Enter",
        preventDefault() {},
      });
    });
    expect(getSelectedCounty()).toBe("48157");
    expect(navMock.go).toHaveBeenCalledWith("/storms/2024-05-28/data");

    // Reopen and press Escape -> restores focus to trigger
    trigger.focus();
    await act(() => {
      (trigger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    await act(() => {
      dispatchKey({ key: "Escape" });
    });
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);
    expect(activeEl).toBe(trigger);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("ignores IME composition keydown (keyCode 229 or isComposing) on the search input", async () => {
    const host = makeFakeElement("div");
    await act(() => render(h(GlobalSearch, { storms: navMock.storms }), host as unknown as HTMLElement));
    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true });
    });
    const dialog = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    const input = findDomNodes(dialog, (n) => n.tagName === "INPUT")[0]!;
    const keydown = input["on_keydown"] as (e: Record<string, unknown>) => void;
    const prevented = vi.fn();
    for (const extra of [{ keyCode: 229 }, { isComposing: true }]) {
      await act(() => {
        keydown({ type: "keydown", key: "Enter", preventDefault: prevented, ...extra });
      });
    }
    expect(prevented).not.toHaveBeenCalled();
    expect(navMock.go).not.toHaveBeenCalled();
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(1);
    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("opens on / shortcut outside editable targets, ignores / inside inputs, caps recent searches at 5, and recovers from corrupt storage", async () => {
    storage.set("hailprint-recent-searches", "{corrupt-json");
    const host = makeFakeElement("div");
    await act(() => render(h(GlobalSearch, { storms: navMock.storms }), host as unknown as HTMLElement));

    // '/' inside an input does NOT open search
    const inputTarget = makeFakeElement("input");
    await act(() => {
      dispatchKey({ key: "/", target: inputTarget });
    });
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(0);

    // '/' on a non-editable target opens search cleanly even with corrupt localStorage
    const bodyTarget = makeFakeElement("div");
    let slashRes = { defaultPrevented: false, stoppedImmediate: false };
    await act(() => {
      slashRes = dispatchKey({ key: "/", target: bodyTarget });
    });
    expect(slashRes.defaultPrevented).toBe(true);
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(1);

    // Preload 5 items and select a 6th distinct item -> capped at 5 most recent
    storage.set(
      "hailprint-recent-searches",
      JSON.stringify(["live", "storm-2024-05-28", "tool-point", "tool-compare", "tool-tune"]),
    );
    await act(() => render(null, host as unknown as HTMLElement));
    await act(() => render(h(GlobalSearch, { storms: navMock.storms }), host as unknown as HTMLElement));

    await act(() => {
      dispatchKey({ key: "/", target: bodyTarget });
    });
    const dialog = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    const input = findDomNodes(dialog, (n) => n.tagName === "INPUT")[0]!;
    await act(() => {
      (input["on_input"] as (e: { type: string; currentTarget: { value: string } }) => void)({
        type: "input",
        currentTarget: { value: "Run" },
      });
    });
    await act(() => {
      (input["on_keydown"] as (e: { type: string; key: string; preventDefault(): void }) => void)({
        type: "keydown",
        key: "Enter",
        preventDefault() {},
      });
    });
    const stored = JSON.parse(storage.get("hailprint-recent-searches") ?? "[]") as string[];
    expect(stored).toEqual(["tool-run", "live", "storm-2024-05-28", "tool-point", "tool-compare"]);
    expect(stored).toHaveLength(5);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("Escape closes only the top GlobalSearch overlay when ScopeDrawer is also open underneath", async () => {
    const host = makeFakeElement("div");
    let scopeClosed = 0;
    await act(() =>
      render(
        h(
          "div",
          null,
          h(GlobalSearch, { storms: navMock.storms }),
          h(ScopeDrawer, {
            id: "storms-scope",
            label: "Storm dates",
            title: "Storm dates",
            open: true,
            onClose: () => {
              scopeClosed += 1;
            },
            children: h("a", { href: "/storms/2024-05-28/map" }, "2024-05-28"),
          }),
        ),
        host as unknown as HTMLElement,
      ),
    );

    // Open GlobalSearch on top of open ScopeDrawer
    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true });
    });
    expect(findDomNodes(host, (n) => n["aria-label"] === "Search Hailprint" && n["role"] === "dialog")).toHaveLength(1);

    // First Escape closes GlobalSearch only; ScopeDrawer stays open
    await act(() => {
      dispatchKey({ key: "Escape" });
    });
    expect(findDomNodes(host, (n) => n["aria-label"] === "Search Hailprint" && n["role"] === "dialog")).toHaveLength(0);
    expect(scopeClosed).toBe(0);

    // Second Escape closes ScopeDrawer
    await act(() => {
      dispatchKey({ key: "Escape" });
    });
    expect(scopeClosed).toBe(1);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("ignores Enter during IME composition without selecting or closing the search dialog", async () => {
    const host = makeFakeElement("div");
    await act(() => render(h(GlobalSearch, { storms: navMock.storms }), host as unknown as HTMLElement));

    await act(() => {
      dispatchKey({ key: "k", ctrlKey: true });
    });
    const dialog = findDomNodes(host, (n) => n["role"] === "dialog")[0]!;
    const input = findDomNodes(dialog, (n) => n.tagName === "INPUT")[0]!;
    let prevented = false;

    await act(() => {
      (input["on_keydown"] as (e: { type: string; key: string; isComposing: boolean; preventDefault(): void }) => void)({
        type: "keydown",
        key: "Enter",
        isComposing: true,
        preventDefault() {
          prevented = true;
        },
      });
    });

    expect(prevented).toBe(false);
    expect(navMock.go).not.toHaveBeenCalled();
    expect(findDomNodes(host, (n) => n["role"] === "dialog")).toHaveLength(1);

    await act(() => render(null, host as unknown as HTMLElement));
  });
});
