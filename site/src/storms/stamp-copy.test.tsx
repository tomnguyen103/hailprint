import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt, Storm } from "../data/types";
import { Stamp } from "./stamp";

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

const storm: Storm = {
  storm_date: "2024-05-28",
  report_count: 5,
  max_size_in: 1.5,
  report_source: "wcm",
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

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-06-01T00:00:00Z",
  package_version: "0.1.0",
};

describe("Stamp copy feedback & UI polish contracts (US-16.1, US-16.2, US-16.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () => Promise.resolve(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows 'Copied' for ~2 s and announces via aria-live when 'Copy field note' is clicked on Stamp (US-16.3)", async () => {
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Stamp, {
          storm,
          reports: { status: "loading" },
          step: null,
          indexReceipt: receipt,
          datesOpen: false,
          onOpenDates: () => {},
        }),
        host as unknown as HTMLElement,
      ),
    );

    const copyBtn = findDomNodes(host, (n) => n.tagName === "BUTTON" && n["class"] === "button button-small stamp-copy")[0]!;
    expect(domText(copyBtn)).toBe("Copy field note");

    await act(async () => {
      (copyBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
      await Promise.resolve();
    });
    expect(domText(copyBtn)).toBe("Copied");

    const liveRegion = findDomNodes(host, (n) => n["aria-live"] === "polite")[0]!;
    expect(liveRegion).toBeDefined();
    expect(domText(liveRegion)).toBe("Copied");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(domText(copyBtn)).toBe("Copy field note");
    expect(domText(liveRegion)).toBe("");
  });

  it("enforces navigation indicators, sub-tab height, forced-colors, live stat borders, and token rules across CSS (US-16.1, US-16.2, US-16.3)", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const shellCss = read("../styles/shell.css");
    const liveCss = read("../styles/live.css");
    const stormsCss = read("../styles/storms.css");
    const pipelineCss = read("../styles/pipeline.css");
    const liveMapTsx = read("./map/live-map.tsx");

    // Bottom bar active item has 2px top indicator and weight 600
    expect(shellCss).toContain('.bottom-bar a[aria-current="page"]::before');
    expect(shellCss).toContain("font-weight: 600");
    // Sub-tabs min-height 40px and forced-colors
    expect(shellCss).toContain("min-height: 40px");
    expect(shellCss).toContain("forced-colors: active");
    // Receipt pop uses dvh
    expect(shellCss).toContain("100dvh");

    // Live 5-stat strip at 768-1023px cleans up column 3 right border and row 2 bottom border
    expect(liveCss).toContain(":nth-child(3n)");
    expect(liveCss).toContain(":nth-child(n + 4)");

    // .pane h2 uses design.md pane-heading face (--sans) and 18px / 600
    const paneH2 = stormsCss.match(/\.pane h2\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(paneH2).toContain("var(--sans)");
    expect(paneH2).toContain("600");

    // .share-bar uses chrome token (--accent), not a hail token
    const shareBar = pipelineCss.match(/\.share-bar\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(shareBar).not.toContain("--hail-");
    expect(shareBar).toContain("var(--accent)");

    // Live map frame uses tabIndex={-1}
    expect(liveMapTsx).toContain("tabIndex={-1}");
  });
});
