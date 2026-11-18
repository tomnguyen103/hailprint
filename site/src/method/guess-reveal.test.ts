import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StormsIndex } from "../data/types";
import * as pairsAll from "../state/pairs-all";
import { difference, GuessReveal } from "./guess-reveal";

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
    setAttribute(k: string, v: unknown) {
      el[k] = v;
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
      el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    insertBefore(child: FakeDomNode, ref: FakeDomNode | null) {
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
  };
  return el;
}

function domText(node: FakeDomNode): string {
  if (node.nodeType === 3) return String(node.data ?? "");
  return node.childNodes.map(domText).join("");
}

function findDomNodes(root: FakeDomNode, match: (n: FakeDomNode) => boolean, out: FakeDomNode[] = []): FakeDomNode[] {
  if (match(root)) out.push(root);
  for (const child of root.childNodes) findDomNodes(child, match, out);
  return out;
}

describe("GuessReveal", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("signs the difference between the guess and the actual, en dash when the actual is null", () => {
    expect(difference(0.5, 0.38)).toBe("+0.12");
    expect(difference(0.33, 0.38)).toBe("-0.05");
    expect(difference(0.38, 0.38)).toBe("+0.00");
    expect(difference(0.5, null)).toBe("–");
  });

  it("defers usePairsAll until Reveal is clicked", async () => {
    const spy = vi.spyOn(pairsAll, "usePairsAll").mockReturnValue({
      status: "loading",
      data: undefined,
      error: undefined,
      showLoading: false,
      retry: () => {},
    });
    const index: StormsIndex = {
      confidence: "radar-estimated hail size",
      run_time: "2026-10-30T21:15:20Z",
      package_version: "0.1.0",
      radius_km_default: 5,
      storms: [],
    };

    const host = makeFakeElement("div");
    await act(() => render(h(GuessReveal, { index }), host as unknown as HTMLElement));

    expect(spy).not.toHaveBeenCalled();

    const revealBtn = findDomNodes(host, (n) => n.tagName === "BUTTON" && domText(n).trim() === "Reveal")[0]!;
    expect(revealBtn).toBeDefined();

    await act(() => {
      (revealBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(index);
    expect(domText(revealBtn).trim()).toBe("Hide");
  });
});
