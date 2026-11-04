import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "../data/types";
import { resetPinStore } from "../state/pin";
import { Inspector } from "../storms/map/inspector";
import { ReceiptChip, getActiveReceiptChipId } from "./receipt-chip";

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
const docKeyListeners: Array<(e: unknown) => void> = [];
let isMobileViewport = false;

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
    getBoundingClientRect() {
      return { top: 40, bottom: 64, left: 40, right: 120, width: 80, height: 24 };
    },
    focus() {
      activeEl = el;
    },
    contains(target: unknown): boolean {
      if (target === el) return true;
      return el.childNodes.some((c) => typeof c.contains === "function" && (c.contains as (t: unknown) => boolean)(target));
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

function dispatchDocumentKey(key: string, shiftKey = false): boolean {
  let defaultPrevented = false;
  let propagationStopped = false;
  const event = {
    key,
    shiftKey,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
  };
  for (const fn of [...docKeyListeners]) {
    fn(event);
  }
  return defaultPrevented && propagationStopped;
}

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "NOAA MRMS", product: "MESH_Max_1440min", file: "2024-05-28.grib2" }],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-05-29T12:00:00Z",
  package_version: "0.1.0",
};

describe("ReceiptChip Escape layering & Inspector mobile modal (US-14.1, US-14.2, US-14.3)", () => {
  beforeEach(() => {
    resetPinStore();
    activeEl = null;
    docKeyListeners.length = 0;
    isMobileViewport = false;

    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("document", {
      get activeElement() {
        return activeEl;
      },
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) => {
        if (type === "keydown") {
          if (capture) docKeyListeners.unshift(fn);
          else docKeyListeners.push(fn);
        }
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        if (type === "keydown") {
          const i = docKeyListeners.indexOf(fn);
          if (i >= 0) docKeyListeners.splice(i, 1);
        }
      },
    });

    vi.stubGlobal("window", {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: (query: string) => ({
        media: query,
        get matches() {
          return query.includes("767px") ? isMobileViewport : false;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Escape with a receipt popover open inside the inspector closes the popover only; a second Escape closes the inspector (US-14.1)", async () => {
    const host = makeFakeElement("div");
    let inspectorClosed = 0;

    await act(() =>
      render(
        h(Inspector, {
          pick: { lngLat: [-95.3698, 29.7604], coveringMm: 25.4, nearest: null },
          receipt,
          power: null,
          internet: null,
          step: 0,
          fips: "48201",
          onCounty: () => {},
          onClose: () => {
            inspectorClosed += 1;
          },
        }),
        host as unknown as HTMLElement,
      ),
    );

    const chipBtn = findDomNodes(host, (n) => n.tagName === "BUTTON" && n["class"] === "chip mono")[0]!;
    expect(chipBtn).toBeDefined();

    // Open receipt popover inside the inspector
    await act(() => {
      (chipBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(getActiveReceiptChipId()).not.toBeNull();
    expect(findDomNodes(host, (n) => n["class"] === "receipt-pop")).toHaveLength(1);

    // First Escape: closes popover, calls preventDefault + stopPropagation, leaves inspector open
    let stoppedAndPrevented = false;
    await act(() => {
      stoppedAndPrevented = dispatchDocumentKey("Escape");
    });
    expect(stoppedAndPrevented).toBe(true);
    expect(getActiveReceiptChipId()).toBeNull();
    expect(inspectorClosed).toBe(0);

    // Second Escape: closes inspector
    await act(() => {
      dispatchDocumentKey("Escape");
    });
    expect(inspectorClosed).toBe(1);
    expect(typeof ReceiptChip).toBe("function");
  });

  it("below 768 px renders the inspector sheet with role='dialog', aria-modal='true', moves focus into it, traps Tab, and restores focus on close (US-14.2)", async () => {
    isMobileViewport = true;
    const mapFrame = makeFakeElement("div");
    mapFrame.focus();
    expect(activeEl).toBe(mapFrame);

    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Inspector, {
          pick: { lngLat: [-95.3698, 29.7604], coveringMm: 25.4, nearest: null },
          receipt,
          power: null,
          internet: null,
          step: 0,
          fips: "48201",
          onCounty: () => {},
          onClose: () => {},
        }),
        host as unknown as HTMLElement,
      ),
    );

    const dialog = findDomNodes(host, (n) => n["class"] === "inspector")[0]!;
    expect(dialog["role"]).toBe("dialog");
    expect(dialog["aria-modal"]).toBe("true");
    expect(dialog["aria-labelledby"]).toBe("inspector-title");

    // Focus moved inside the inspector sheet
    expect(dialog.contains(activeEl)).toBe(true);

    // Tab wraps from last focusable back to first
    const focusables = dialog.querySelectorAll() as FakeDomNode[];
    expect(focusables.length).toBeGreaterThan(1);
    const last = focusables[focusables.length - 1]!;
    last.focus();
    expect(activeEl).toBe(last);

    let prevented = false;
    for (const fn of docKeyListeners) {
      fn({
        key: "Tab",
        shiftKey: false,
        defaultPrevented: false,
        preventDefault() {
          prevented = true;
        },
      });
    }
    expect(prevented).toBe(true);
    expect(activeEl).toBe(focusables[0]);

    // Unmounting restores focus to the map frame
    await act(() => render(null, host as unknown as HTMLElement));
    expect(activeEl).toBe(mapFrame);
  });

  it("gives .inspector-try-link an inline-flex target at least 40 px tall in map.css (US-14.3)", () => {
    const css = readFileSync(fileURLToPath(new URL("../styles/map.css", import.meta.url)), "utf8");
    const block = css.match(/\.inspector-try-link\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toContain("inline-flex");
    expect(block).toMatch(/min-height:\s*40px/);
  });
});
