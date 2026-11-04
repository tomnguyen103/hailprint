import { h, render, type VNode } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Method } from "../method/method";
import { Pipeline } from "../pipeline/pipeline";
import { Stamp } from "../storms/stamp";
import { Workspace } from "../storms/workspace";
import { ScopeDrawer } from "./scope-drawer";

vi.mock("../state/index", () => ({
  useIndex: () => ({ status: "loading", showLoading: false, retry: () => {} }),
}));

vi.mock("../state/pipeline", () => ({
  usePipeline: () => ({
    status: "ready",
    data: {
      confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
      run_time: "2026-04-01T00:00:00Z",
      package_version: "0.2.0",
      runs: [],
      archive: null,
      sources: [],
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
  contains: (target: unknown) => boolean;
  querySelectorAll: (selector?: string) => FakeDomNode[];
  [key: string]: unknown;
}

let activeEl: FakeDomNode | null = null;
const docKeyListeners = new Set<(e: unknown) => void>();
const mediaChangeListeners = new Set<(e: { matches: boolean }) => void>();
let isDesktopViewport = false;

class FakeHTMLElement {}

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
      return el.childNodes.some((c) => typeof c.contains === "function" && c.contains(target));
    },
    closest(): FakeDomNode | null {
      return null;
    },
    querySelectorAll(): FakeDomNode[] {
      const out: FakeDomNode[] = [];
      const walk = (n: FakeDomNode) => {
        for (const c of n.childNodes) {
          if (
            c.tagName === "BUTTON" ||
            (c.tagName === "A" && c["href"] !== undefined) ||
            c.tagName === "SUMMARY" ||
            c.tagName === "INPUT"
          ) {
            if (!c["disabled"]) out.push(c);
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

describe("ScopeDrawer focus lifecycle and ARIA (US-13.1, US-13.2, US-13.3)", () => {
  beforeEach(() => {
    activeEl = null;
    docKeyListeners.clear();
    mediaChangeListeners.clear();
    isDesktopViewport = false;

    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("document", {
      get activeElement() {
        return activeEl;
      },
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        if (type === "keydown") docKeyListeners.add(fn);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        if (type === "keydown") docKeyListeners.delete(fn);
      },
    });

    vi.stubGlobal("window", {
      location: { pathname: "/storms/2024-05-28/data" },
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout,
      clearTimeout,
      matchMedia: (query: string) => ({
        media: query,
        get matches() {
          return query.includes("1280px") ? isDesktopViewport : !isDesktopViewport;
        },
        addEventListener: (type: string, fn: (e: { matches: boolean }) => void) => {
          if (type === "change") mediaChangeListeners.add(fn);
        },
        removeEventListener: (type: string, fn: (e: { matches: boolean }) => void) => {
          if (type === "change") mediaChangeListeners.delete(fn);
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("below 1280 px moves focus into the drawer on open, traps Tab at document level, exposes dialog + aria-modal, and returns focus on close (US-13.1)", async () => {
    const opener = makeFakeElement("button", "Dates");
    opener.focus();
    expect(activeEl).toBe(opener);

    const host = makeFakeElement("div");
    let closed = 0;

    await act(() =>
      render(
        h(ScopeDrawer, {
          id: "storms-scope",
          label: "Storm dates",
          title: "Storm dates",
          open: true,
          onClose: () => {
            closed += 1;
          },
          children: h("a", { href: "/storms/2024-05-28/map" }, "2024-05-28"),
        }),
        host as unknown as HTMLElement,
      ),
    );

    const dialogs = findDomNodes(host, (n) => n["role"] === "dialog" && n["aria-modal"] === "true");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]!["aria-label"]).toBe("Storm dates");

    // Focus moved to first focusable inside drawer (the Close button)
    const drawerEl = dialogs[0]!;
    expect(drawerEl.contains(activeEl)).toBe(true);
    expect(activeEl?.tagName).toBe("BUTTON");

    // Tab at document level from the last focusable wraps to the first
    const linkEl = findDomNodes(drawerEl, (n) => n.tagName === "A")[0]!;
    linkEl.focus();
    expect(activeEl).toBe(linkEl);

    let prevented = false;
    for (const fn of docKeyListeners) {
      fn({
        key: "Tab",
        shiftKey: false,
        preventDefault() {
          prevented = true;
        },
      });
    }
    expect(prevented).toBe(true);
    expect(activeEl?.tagName).toBe("BUTTON");

    // Closing returns focus to opener
    await act(() =>
      render(
        h(ScopeDrawer, {
          id: "storms-scope",
          label: "Storm dates",
          title: "Storm dates",
          open: false,
          onClose: () => {
            closed += 1;
          },
          children: h("a", { href: "/storms/2024-05-28/map" }, "2024-05-28"),
        }),
        host as unknown as HTMLElement,
      ),
    );
    expect(activeEl).toBe(opener);
  });

  it("at >= 1280 px never traps Tab and calls onClose when viewport crosses to >= 1280 px while open (US-13.2)", async () => {
    const host = makeFakeElement("div");
    let closed = 0;

    await act(() =>
      render(
        h(ScopeDrawer, {
          id: "storms-scope",
          label: "Storm dates",
          title: "Storm dates",
          open: true,
          onClose: () => {
            closed += 1;
          },
          children: h("a", { href: "/storms/2024-05-28/map" }, "2024-05-28"),
        }),
        host as unknown as HTMLElement,
      ),
    );

    // Cross viewport to >= 1280 px
    isDesktopViewport = true;
    await act(() => {
      for (const fn of mediaChangeListeners) fn({ matches: true });
    });
    expect(closed).toBe(1);

    // Render at >= 1280 px: Tab is not trapped
    const opener = makeFakeElement("button", "External");
    opener.focus();
    await act(() =>
      render(
        h(ScopeDrawer, {
          id: "storms-scope",
          label: "Storm dates",
          title: "Storm dates",
          open: false,
          onClose: () => {},
          children: h("a", { href: "/storms/2024-05-28/map" }, "2024-05-28"),
        }),
        host as unknown as HTMLElement,
      ),
    );
    let prevented = false;
    for (const fn of docKeyListeners) {
      fn({
        key: "Tab",
        shiftKey: false,
        preventDefault() {
          prevented = true;
        },
      });
    }
    expect(prevented).toBe(false);
    expect(activeEl).toBe(opener);
  });

  it("removes aria-haspopup='dialog' from scope triggers and renders Pipeline sidebar as <aside> (US-13.3)", async () => {
    const storm = {
      storm_date: "2024-05-28",
      report_count: 5,
      max_size_in: 1.5,
      report_source: "wcm" as const,
      max_mesh_mm: 40,
      scored_reports: 5,
      excluded_reports: 0,
      table: [],
      parcel_total: null,
      files: {
        swath: "s",
        reports: "r",
        pairs: "p",
        zip_counts: null,
        warnings: null,
        power: null,
        internet: null,
      },
    };
    const receipt = {
      storm_date: "2024-05-28",
      sources: [],
      confidence: "c",
      run_time: "2024-06-01T00:00:00Z",
      package_version: "0.1.0",
    };

    const stampVnode = Stamp({
      storm,
      reports: { status: "loading" },
      step: null,
      indexReceipt: receipt,
      datesOpen: false,
      onOpenDates: () => {},
    }) as VNode<Record<string, unknown>>;
    const stampBtn = (stampVnode.props["children"] as VNode<Record<string, unknown>>[])[0]!;
    expect(stampBtn.props["aria-haspopup"]).toBeUndefined();

    const host = makeFakeElement("div");
    await act(() => render(h(Method, { page: "data" }), host as unknown as HTMLElement));
    const methodTrigger = findDomNodes(host, (n) => n.tagName === "BUTTON" && n["aria-controls"] === "method-scope")[0]!;
    expect(methodTrigger["aria-haspopup"]).toBeUndefined();
    const methodNavs = findDomNodes(host, (n) => n.tagName === "NAV");
    expect(methodNavs.length).toBeGreaterThanOrEqual(1);

    const pipeHost = makeFakeElement("div");
    await act(() => render(h(Pipeline, { view: "runs" }), pipeHost as unknown as HTMLElement));
    const pipeTrigger = findDomNodes(pipeHost, (n) => n.tagName === "BUTTON" && n["aria-controls"] === "pipeline-scope")[0]!;
    expect(pipeTrigger["aria-haspopup"]).toBeUndefined();

    // Pipeline sidebar holds no links, so its inner semantic landmark is <aside>, not <nav>
    const pipeAsides = findDomNodes(pipeHost, (n) => n.tagName === "ASIDE");
    expect(pipeAsides).toHaveLength(1);
    expect(pipeAsides[0]!["aria-label"]).toBe("Services");
    const pipeScopeNavs = findDomNodes(pipeHost, (n) => n.tagName === "NAV" && n["aria-label"] === "Services");
    expect(pipeScopeNavs).toHaveLength(0);

    // Workspace trigger check: renders Dates button without aria-haspopup
    const wsHost = makeFakeElement("div");
    await act(() =>
      render(
        h(Workspace, {
          index: {
            confidence: "c",
            run_time: "2026-04-01T00:00:00Z",
            package_version: "0.2.0",
            radius_km_default: 5,
            storms: [storm],
          },
          storm,
          tab: "data",
        }),
        wsHost as unknown as HTMLElement,
      ),
    );
    const wsTrigger = findDomNodes(
      wsHost,
      (n) => n.tagName === "BUTTON" && n["aria-controls"] === "storms-scope" && n["class"] !== "stamp-date stamp-date-button mono",
    )[0]!;
    expect(wsTrigger).toBeDefined();
    expect(wsTrigger["aria-haspopup"]).toBeUndefined();
    await act(() => {
      render(null, host as unknown as HTMLElement);
      render(null, pipeHost as unknown as HTMLElement);
      render(null, wsHost as unknown as HTMLElement);
    });
  });
});
