import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AREAS, AREA_LABELS } from "../router";
import { RouteSidebar } from "./route-sidebar";

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
    onmousedown: null,
    querySelector: () => null,
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
    focus() {},
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

describe("RouteSidebar (US-04.1, US-04.2)", () => {
  const storage = new Map<string, string>();
  const docListeners = new Map<string, Set<(e: unknown) => void>>();

  beforeEach(() => {
    storage.clear();
    docListeners.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
    });
    vi.stubGlobal("document", {
      activeElement: null,
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
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      location: { pathname: "/storms/2024-05-28/map" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all 6 area links, active aria-current, avoids drawer label, and persists collapse via toggle and Ctrl+B", async () => {
    const onCloseMobile = vi.fn();
    const host = makeFakeElement("div");
    await act(() =>
      render(h(RouteSidebar, { active: "storms", mobileOpen: false, onCloseMobile }), host as unknown as HTMLElement),
    );

    const aside = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    expect(aside).toBeDefined();
    expect(String(aside["aria-label"] ?? "").toLowerCase()).not.toContain("drawer");
    expect(String(aside["aria-label"] ?? "").toLowerCase()).not.toContain("inspector");
    expect(aside["data-collapsed"]).toBe(false);

    const links = findDomNodes(aside, (n) => n.tagName === "A");
    expect(links.map((a) => domText(a).trim())).toEqual(AREAS.map((a) => AREA_LABELS[a]));
    const activeLinks = links.filter((a) => a["aria-current"] === "page");
    expect(activeLinks).toHaveLength(1);
    expect(domText(activeLinks[0]!).trim()).toBe("Storms");

    const collapseBtn = findDomNodes(aside, (n) => n.tagName === "BUTTON" && Boolean(n["aria-controls"]))[0]!;
    expect(collapseBtn["aria-expanded"]).toBe(true);

    await act(() => {
      (collapseBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(aside["data-collapsed"]).toBe(true);
    expect(storage.get("hailprint-sidebar")).toBe("collapsed");

    // Ctrl+B expands again
    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({
          key: "b",
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
          preventDefault() {},
        });
      }
    });
    expect(aside["data-collapsed"]).toBe(false);
    expect(storage.get("hailprint-sidebar")).toBe("expanded");
  });

  it("closes mobile drawer on Escape when mobileOpen is true", async () => {
    const onCloseMobile = vi.fn();
    const host = makeFakeElement("div");
    await act(() =>
      render(h(RouteSidebar, { active: "live", mobileOpen: true, onCloseMobile }), host as unknown as HTMLElement),
    );

    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "Escape", preventDefault() {} });
      }
    });
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});
