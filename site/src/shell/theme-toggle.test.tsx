import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../theme";
import { ThemeToggle } from "./theme-toggle";

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
  [key: string]: unknown;
}

const themeMock = vi.hoisted(() => ({
  pref: "system" as Selection,
  resolved: "light" as "light" | "dark",
  set: vi.fn((next: Selection) => {
    themeMock.pref = next;
    themeMock.resolved = next === "dark" ? "dark" : "light";
  }),
}));

vi.mock("../state/theme", () => ({
  useTheme: () => themeMock,
}));

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
    onkeydown: null,
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
    contains(target: unknown): boolean {
      if (target === el) return true;
      return el.childNodes.some((c) => c.contains(target));
    },
    querySelectorAll(): FakeDomNode[] {
      const out: FakeDomNode[] = [];
      const walk = (n: FakeDomNode) => {
        for (const c of n.childNodes) {
          if (c["role"] === "menuitemradio" || c.tagName === "BUTTON") out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
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

describe("ThemeToggle 3-state icon menu (US-04.1, US-04.3)", () => {
  beforeEach(() => {
    themeMock.pref = "system";
    themeMock.resolved = "light";
    themeMock.set.mockClear();
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

  it("opens Light/Dark/System menuitemradio menu, applies selection, and closes on Escape/outside click", async () => {
    const host = makeFakeElement("div");
    await act(() => render(h(ThemeToggle, null), host as unknown as HTMLElement));

    const trigger = findDomNodes(host, (n) => n.tagName === "BUTTON" && n["aria-haspopup"] === "menu")[0]!;
    expect(trigger).toBeDefined();
    expect(trigger["aria-label"]).toBe("Theme");
    expect(trigger["aria-expanded"]).toBe(false);
    expect(findDomNodes(host, (n) => n["role"] === "menu")).toHaveLength(0);

    await act(() => {
      (trigger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });

    expect(trigger["aria-expanded"]).toBe(true);
    const menu = findDomNodes(host, (n) => n["role"] === "menu")[0]!;
    expect(menu).toBeDefined();
    const items = findDomNodes(menu, (n) => n["role"] === "menuitemradio");
    expect(items.map((i) => domText(i).trim())).toEqual(["Light", "Dark", "System"]);
    expect(items.map((i) => i["aria-checked"])).toEqual([false, false, true]);

    // Select Dark
    await act(() => {
      (items[1]!["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(themeMock.set).toHaveBeenCalledWith("dark");
    expect(findDomNodes(host, (n) => n["role"] === "menu")).toHaveLength(0);
    expect(activeEl).toBe(trigger);

    // Re-open, verify Dark is checked, then close via Escape
    await act(() => {
      (trigger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    const openMenu = findDomNodes(host, (n) => n["role"] === "menu")[0]!;
    const openItems = findDomNodes(openMenu, (n) => n["role"] === "menuitemradio");
    expect(openItems[1]!["aria-checked"]).toBe(true);

    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "Escape", preventDefault() {}, stopPropagation() {} });
      }
    });
    expect(findDomNodes(host, (n) => n["role"] === "menu")).toHaveLength(0);
    expect(activeEl).toBe(trigger);

    // Re-open and close via outside mousedown
    await act(() => {
      (trigger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(findDomNodes(host, (n) => n["role"] === "menu")).toHaveLength(1);
    const outside = makeFakeElement("div");
    await act(() => {
      for (const fn of docListeners.get("mousedown") ?? []) {
        fn({ target: outside });
      }
    });
    expect(findDomNodes(host, (n) => n["role"] === "menu")).toHaveLength(0);
  });
});
