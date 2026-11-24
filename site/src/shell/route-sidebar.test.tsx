import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AREAS, AREA_LABELS } from "../router";
import { setSidebarExpanded } from "../state/sidebar";
import { Layout } from "./layout";
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
  contains: (target: unknown) => boolean;
  querySelectorAll: (selector?: string) => FakeDomNode[];
  closest: () => FakeDomNode | null;
  [key: string]: unknown;
}

let activeEl: FakeDomNode | null = null;

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
    contains(target: unknown): boolean {
      if (target === el) return true;
      return el.childNodes.some((c) => c.contains(target));
    },
    closest() {
      return null;
    },
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

describe("RouteSidebar and single top-bar hamburger (US-01.1, US-01.2, US-01.5)", () => {
  const storage = new Map<string, string>();
  const docListeners = new Map<string, Set<(e: unknown) => void>>();
  let desktopMatches = true;

  beforeEach(() => {
    storage.clear();
    docListeners.clear();
    activeEl = null;
    desktopMatches = true;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
    });
    setSidebarExpanded(true);
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
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: (query: string) => ({
        media: query,
        get matches() {
          return query.includes("min-width: 768px") ? desktopMatches : false;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      location: { pathname: "/storms/2024-05-28/map" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all 6 area links, zero bottom-left collapse button, and toggles desktop rail via single top-bar hamburger and Ctrl+B", async () => {
    const host = makeFakeElement("div");
    await act(() =>
      render(h(Layout, { active: "storms", routePath: "/storms/2024-05-28/map", children: h("div", null, "Body") }), host as unknown as HTMLElement),
    );

    const aside = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    expect(aside).toBeDefined();
    expect(String(aside["aria-label"] ?? "").toLowerCase()).not.toContain("drawer");
    expect(String(aside["aria-label"] ?? "").toLowerCase()).not.toContain("inspector");
    expect(aside["data-collapsed"]).toBe(false);

    // The one hamburger sits in the aside header; no second collapse button
    expect(findDomNodes(aside, (n) => n.tagName === "BUTTON")).toHaveLength(1);

    const areaNav = findDomNodes(aside, (n) => n.tagName === "NAV" && n["aria-label"] === "Primary")[0]!;
    const navs = findDomNodes(aside, (n) => n.tagName === "NAV");
    expect(navs).toHaveLength(1);
    expect(aside["aria-label"]).toBeUndefined();
    const links = findDomNodes(areaNav, (n) => n.tagName === "A");
    expect(links.map((a) => domText(a).trim())).toEqual(AREAS.map((a) => AREA_LABELS[a]));
    const activeLinks = links.filter((a) => a["aria-current"] === "page");
    expect(activeLinks).toHaveLength(1);
    expect(domText(activeLinks[0]!).trim()).toBe("Storms");

    // Single hamburger in the aside header controls the desktop rail
    const hamburger = findDomNodes(aside, (n) => n.tagName === "BUTTON" && n["aria-controls"] === "route-sidebar")[0]!;
    expect(hamburger).toBeDefined();
    expect(hamburger["aria-label"]).toBe("Collapse sidebar");
    expect(hamburger["title"]).toBe("Toggle navigation (Ctrl+B)");
    expect(String(hamburger["class"] ?? "")).toContain("sidebar-toggle");
    expect(hamburger["aria-expanded"]).toBe(true);

    await act(() => {
      (hamburger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(aside["data-collapsed"]).toBe(true);
    expect(hamburger["aria-expanded"]).toBe(false);
    expect(hamburger["aria-label"]).toBe("Expand sidebar");
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

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("below 768px opens mobile drawer as role='dialog' aria-modal='true', traps Tab, and restores focus to hamburger on Escape", async () => {
    desktopMatches = false;
    const host = makeFakeElement("div");
    await act(() =>
      render(h(Layout, { active: "live", routePath: "/live", children: h("div", null, "Body") }), host as unknown as HTMLElement),
    );

    const header = findDomNodes(host, (n) => n.tagName === "HEADER")[0]!;
    const hamburger = findDomNodes(header, (n) => n.tagName === "BUTTON" && n["aria-controls"] === "route-sidebar")[0]!;
    hamburger.focus();
    expect(hamburger["aria-expanded"]).toBe(false);

    await act(() => {
      (hamburger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });

    const aside = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    expect(aside["role"]).toBe("dialog");
    expect(aside["aria-modal"]).toBe("true");
    expect(aside["data-mobile-open"]).toBe(true);
    expect(aside.contains(activeEl)).toBe(true);

    // Tab wraps from last link back to first link inside mobile drawer
    const focusables = aside.querySelectorAll();
    const last = focusables[focusables.length - 1]!;
    last.focus();
    let prevented = false;
    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({
          key: "Tab",
          shiftKey: false,
          defaultPrevented: false,
          preventDefault() {
            prevented = true;
          },
        });
      }
    });
    expect(prevented).toBe(true);
    expect(activeEl).toBe(focusables[0]);

    // Escape closes mobile drawer and restores focus to opener hamburger
    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "Escape", defaultPrevented: false, preventDefault() {} });
      }
    });
    expect(aside["data-mobile-open"]).toBe(false);
    expect(aside["role"]).toBeUndefined();
    expect(activeEl).toBe(hamburger);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("closes mobile drawer on Escape when RouteSidebar renders standalone with mobileOpen", async () => {
    desktopMatches = false;
    const onCloseMobile = vi.fn();
    const host = makeFakeElement("div");
    await act(() =>
      render(h(RouteSidebar, { active: "live", mobileOpen: true, onCloseMobile }), host as unknown as HTMLElement),
    );

    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "Escape", defaultPrevented: false, preventDefault() {} });
      }
    });
    expect(onCloseMobile).toHaveBeenCalledTimes(1);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("preserves in-memory collapsed sidebar state across mounts when localStorage throws (US-01.5)", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });

    const host = makeFakeElement("div");
    await act(() =>
      render(h(Layout, { active: "storms", routePath: "/storms/2024-05-28/map", children: h("div", null, "Body") }), host as unknown as HTMLElement),
    );
    const aside0 = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    const hamburger = findDomNodes(aside0, (n) => n.tagName === "BUTTON" && n["aria-controls"] === "route-sidebar")[0]!;
    await act(() => {
      (hamburger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!["data-collapsed"]).toBe(true);

    // Remounting another Layout must keep collapsed in-memory state instead of clobbering it from blocked storage
    await act(() => render(null, host as unknown as HTMLElement));
    await act(() =>
      render(h(Layout, { active: "live", routePath: "/live", children: h("div", null, "Body") }), host as unknown as HTMLElement),
    );
    expect(findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!["data-collapsed"]).toBe(true);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("closes the mobile drawer when routePath changes within the same area", async () => {
    desktopMatches = false;
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Layout, {
          active: "storms",
          routePath: "/storms/2024-05-28/map",
          children: h("div", null, "Body"),
        }),
        host as unknown as HTMLElement,
      ),
    );

    const header = findDomNodes(host, (n) => n.tagName === "HEADER")[0]!;
    const hamburger = findDomNodes(header, (n) => n.tagName === "BUTTON" && n["aria-controls"] === "route-sidebar")[0]!;
    await act(() => {
      (hamburger["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!["data-mobile-open"]).toBe(true);

    await act(() =>
      render(
        h(Layout, {
          active: "storms",
          routePath: "/storms/2024-05-16/map",
          children: h("div", null, "Body"),
        }),
        host as unknown as HTMLElement,
      ),
    );
    expect(findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!["data-mobile-open"]).toBe(false);

    await act(() => render(null, host as unknown as HTMLElement));
  });

  const hamburgers = (host: FakeDomNode) =>
    findDomNodes(host, (n) => n["aria-controls"] === "route-sidebar");

  it("renders exactly one hamburger at desktop, inside the aside before the brand link (US-01.1, US-01.3)", async () => {
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Layout, { active: "live", routePath: "/live", children: h("div", null, "Body") }),
        host as unknown as HTMLElement,
      ),
    );
    const found = hamburgers(host);
    expect(found).toHaveLength(1);
    const aside = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    expect(aside.contains(found[0])).toBe(true);
    const sidebarHeader = findDomNodes(aside, (n) => n["class"] === "route-sidebar-header")[0]!;
    expect(sidebarHeader.childNodes[0]).toBe(found[0]);
    const brand = sidebarHeader.childNodes[1]!;
    expect(brand["href"]).toBe("/");
    expect(domText(brand)).toBe("Hailprint");
    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("renders exactly one hamburger below 768px, in the top bar, with open and close labels (US-01.2, US-01.3)", async () => {
    desktopMatches = false;
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Layout, { active: "live", routePath: "/live", children: h("div", null, "Body") }),
        host as unknown as HTMLElement,
      ),
    );
    const header = findDomNodes(host, (n) => n.tagName === "HEADER")[0]!;
    const found = hamburgers(host);
    expect(found).toHaveLength(1);
    expect(header.contains(found[0])).toBe(true);
    expect(found[0]!["aria-label"]).toBe("Open navigation");
    expect(found[0]!["title"]).toBe("Toggle navigation (Ctrl+B)");

    await act(() => {
      (found[0]!["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(hamburgers(host)).toHaveLength(1);
    expect(found[0]!["aria-label"]).toBe("Close navigation");
    const aside = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    const brand = findDomNodes(aside, (n) => n.tagName === "A" && n["href"] === "/")[0];
    expect(brand).toBeDefined();
    await act(() => render(null, host as unknown as HTMLElement));
  });

  it("keeps every header link inside the breadcrumb (US-01.3)", async () => {
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Layout, { active: "storms", routePath: "/storms/2024-05-28/score", children: h("div", null, "Body") }),
        host as unknown as HTMLElement,
      ),
    );
    const header = findDomNodes(host, (n) => n.tagName === "HEADER")[0]!;
    const crumb = findDomNodes(header, (n) => n.tagName === "NAV" && n["aria-label"] === "Breadcrumb")[0]!;
    expect(crumb).toBeDefined();
    const links = findDomNodes(header, (n) => n.tagName === "A");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(crumb.contains(link)).toBe(true);
    await act(() => render(null, host as unknown as HTMLElement));
  });
});
