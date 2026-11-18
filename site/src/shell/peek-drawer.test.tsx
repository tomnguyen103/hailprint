import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRadiusKm, resetRadiusKm, setRadiusKm, subscribeRadius } from "../state/radius";
import { PeekDrawer } from "./peek-drawer";

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

describe("PeekDrawer and shared radius store (US-01.1, US-01.2, US-01.4)", () => {
  beforeEach(() => {
    resetRadiusKm();
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

  it("persists, clamps [0, 20], rounds, rejects NaN, and notifies subscribers on shared verification radius updates", () => {
    const listener = vi.fn();
    const unsub = subscribeRadius(listener);
    expect(getRadiusKm()).toBe(5);

    setRadiusKm(14.6);
    expect(getRadiusKm()).toBe(15);
    expect(listener).toHaveBeenCalledTimes(1);

    // Unchanged rounded value takes early return without notifying listeners
    setRadiusKm(15.2);
    expect(listener).toHaveBeenCalledTimes(1);

    // Non-finite input must not poison store with NaN
    setRadiusKm(Number.NaN);
    expect(getRadiusKm()).toBe(15);
    expect(listener).toHaveBeenCalledTimes(1);

    // Clamps to [0, 20] at exact boundaries and beyond
    setRadiusKm(-1);
    expect(getRadiusKm()).toBe(0);
    setRadiusKm(21);
    expect(getRadiusKm()).toBe(20);
    expect(listener).toHaveBeenCalledTimes(3);

    // resetRadiusKm clamps, rounds, ignores NaN, and skips no-op notifications
    resetRadiusKm(12.4);
    expect(getRadiusKm()).toBe(12);
    expect(listener).toHaveBeenCalledTimes(4);
    resetRadiusKm(12);
    expect(listener).toHaveBeenCalledTimes(4);
    resetRadiusKm(Number.NaN);
    expect(getRadiusKm()).toBe(12);
    expect(listener).toHaveBeenCalledTimes(4);

    resetRadiusKm();
    expect(getRadiusKm()).toBe(5);
    unsub();
  });

  it("focuses drawer on open, does NOT steal focus on parent re-render, and closes on document Escape restoring opener focus once (US-01.4)", async () => {
    const opener = makeFakeElement("button");
    opener.focus();
    const onClose = vi.fn();
    const host = makeFakeElement("div");

    await act(() =>
      render(h(PeekDrawer, { open: false, title: "Hidden", onClose }), host as unknown as HTMLElement),
    );
    expect(findDomNodes(host, (n) => n.tagName === "ASIDE")).toHaveLength(0);

    await act(() =>
      render(
        h(
          PeekDrawer,
          {
            open: true,
            title: "Threshold >= 1.00 in (quarter)",
            subtitle: "25.4 mm · 10 km radius",
            onClose,
          },
          h("p", null, "Contingency breakdown"),
        ),
        host as unknown as HTMLElement,
      ),
    );

    const aside = findDomNodes(host, (n) => n.tagName === "ASIDE")[0]!;
    expect(aside).toBeDefined();
    expect(domText(aside)).toContain("Threshold >= 1.00 in (quarter)");
    expect(domText(aside)).toContain("Contingency breakdown");
    expect(activeEl).toBe(aside);

    // User focuses Close button inside drawer; parent re-renders with updated subtitle
    const closeBtn = findDomNodes(aside, (n) => n.tagName === "BUTTON")[0]!;
    closeBtn.focus();
    expect(activeEl).toBe(closeBtn);

    await act(() =>
      render(
        h(
          PeekDrawer,
          {
            open: true,
            title: "Threshold >= 1.00 in (quarter)",
            subtitle: "25.4 mm · 12 km radius",
            onClose,
          },
          h("p", null, "Updated contingency breakdown"),
        ),
        host as unknown as HTMLElement,
      ),
    );
    expect(activeEl).toBe(closeBtn);

    // Document-level Escape triggers onClose
    await act(() => {
      for (const fn of docListeners.get("keydown") ?? []) {
        fn({ key: "Escape", defaultPrevented: false, preventDefault() {} });
      }
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Closing drawer restores focus to original opener (not the Close button)
    await act(() =>
      render(h(PeekDrawer, { open: false, title: "Hidden", onClose }), host as unknown as HTMLElement),
    );
    expect(activeEl).toBe(opener);

    await act(() => render(null, host as unknown as HTMLElement));
  });
});



