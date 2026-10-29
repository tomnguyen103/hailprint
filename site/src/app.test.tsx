import { h, render, type ComponentChildren, type Context, type VNode } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { AreaBoundary } from "./shell/area-boundary";

type Current = { path: string; route: object };

// Every module that loads DOM, CSS, or MapLibre is a stub. The router and the boundary stay real.
const stub = vi.hoisted(() => ({
  layouts: [] as { children: unknown }[],
  log: [] as string[],
  replaced: [] as string[],
  shown: [] as { error: { message: string }; inLayout: boolean }[],
  storms: [{ storm_date: "2024-05-28" }] as Record<string, unknown>[],
  // The Layout stub provides it, the ErrorState stub reads it: true when the error state renders under the layout.
  layoutContext: undefined as unknown as Context<boolean>,
  armed: true,
  current: { path: "/method/data", route: { kind: "method", page: "data" } } as Current,
}));
vi.mock("./router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./router")>();
  return {
    ...actual,
    replace: (to: string) => {
      stub.replaced.push(to);
    },
  };
});
vi.mock("./shell/layout", async () => {
  const { createContext } = await import("preact");
  stub.layoutContext = createContext(false);
  return {
    Layout: (props: { children: unknown }) => {
      stub.layouts.push(props);
      return h(stub.layoutContext.Provider, { value: true }, props.children as ComponentChildren);
    },
  };
});
vi.mock("./shell/states", async () => {
  const { useContext } = await import("preact/hooks");
  return {
    ErrorState: (props: { error: { message: string } }) => {
      stub.shown.push({ ...props, inLayout: useContext(stub.layoutContext) });
      stub.log.push("error");
      return null;
    },
    EmptyState: () => null,
    LoadingState: () => null,
  };
});
vi.mock("./state/route", () => ({ useRoute: () => stub.current }));
vi.mock("./state/index", () => ({
  useIndex: () => ({ status: "ready", data: { storms: stub.storms }, showLoading: false, retry() {} }),
}));
vi.mock("./storms/workspace", () => ({ Workspace: () => null }));
vi.mock("./method/method", () => ({
  Method: () => {
    stub.log.push("method");
    if (stub.armed) throw new Error("boom");
    return null;
  },
}));
vi.mock("./pipeline/pipeline", () => ({
  Pipeline: () => {
    stub.log.push("pipeline");
    return null;
  },
}));
vi.mock("./scorecard/scorecard", () => ({ Scorecard: () => null }));
vi.mock("./try/try", () => ({ TryIt: () => null }));

describe("App", () => {
  let host: HTMLElement;
  const mount = () => act(() => render(h(App, null), host));

  beforeEach(() => {
    vi.useFakeTimers();
    // The node test environment has no DOM: `render` only compares its host with `document`.
    vi.stubGlobal("document", {});
    host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;
    vi.spyOn(console, "error").mockImplementation(() => {});
    stub.layouts.length = 0;
    stub.log.length = 0;
    stub.replaced.length = 0;
    stub.shown.length = 0;
    stub.storms = [{ storm_date: "2024-05-28" }];
    stub.armed = true;
    stub.current = { path: "/method/data", route: { kind: "method", page: "data" } };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("the layout wraps the page body in an AreaBoundary keyed by the path", async () => {
    stub.armed = false;
    await mount();

    const body = stub.layouts.at(-1)?.children as VNode<{ resetKey: string }>;
    expect(body.type).toBe(AreaBoundary);
    expect(body.props.resetKey).toBe("/method/data");
  });

  it("a page that throws shows the error state under the layout", async () => {
    await mount();

    expect(stub.shown.at(-1)?.error.message).toBe("page: Error: boom");
    expect(stub.shown.at(-1)?.inLayout).toBe(true);
  });

  it("a new path clears the error state and renders the new page", async () => {
    await mount();
    stub.current = { path: "/pipeline/runs", route: { kind: "pipeline", view: "runs" } };

    await mount();

    expect(stub.log.at(-1)).toBe("pipeline");
  });

  it("redirects / to the newest storm date that has an impact layer", async () => {
    stub.storms = [
      {
        storm_date: "2026-08-28",
        files: { swath: "s", reports: "r", pairs: "p", zip_counts: null, warnings: null, power: null, internet: null },
      },
      {
        storm_date: "2025-05-01",
        files: {
          swath: "s",
          reports: "r",
          pairs: "p",
          zip_counts: null,
          warnings: null,
          power: "storms/2025-05-01/power.json",
          internet: null,
        },
      },
    ];
    stub.current = { path: "/", route: { kind: "redirect-latest" } };

    await mount();

    expect(stub.replaced).toEqual(["/storms/2025-05-01/map"]);
  });
});

describe("ReceiptChip & ScopeDrawer accessibility", () => {
  it("coordinates ReceiptChip single-open state and clamps fixed coordinates", async () => {
    const { ReceiptChip, openReceiptChip, getActiveReceiptChipId, clampPopoverPosition } = await import(
      "./shell/receipt-chip"
    );
    expect(typeof openReceiptChip).toBe("function");
    expect(typeof getActiveReceiptChipId).toBe("function");
    openReceiptChip("chip-a");
    expect(getActiveReceiptChipId()).toBe("chip-a");
    openReceiptChip("chip-b");
    expect(getActiveReceiptChipId()).toBe("chip-b");
    openReceiptChip(null);
    expect(getActiveReceiptChipId()).toBeNull();
    expect(typeof ReceiptChip).toBe("function");

    // Near left edge of 390px mobile screen: clamps left to >= 8
    const leftClamped = clampPopoverPosition(
      { top: 100, bottom: 124, left: 12, right: 80 },
      { width: 320, height: 160 },
      { width: 390, height: 844 },
    );
    expect(leftClamped.left).toBe(8);
    expect(leftClamped.top).toBe(130);

    // Near bottom edge: flips above trigger
    const bottomFlipped = clampPopoverPosition(
      { top: 760, bottom: 784, left: 200, right: 360 },
      { width: 300, height: 160 },
      { width: 1280, height: 800 },
    );
    expect(bottomFlipped.top).toBe(594);
  });

  it("wraps Tab focus inside ScopeDrawer when open", async () => {
    const { trapDrawerTab } = await import("./shell/scope-drawer");
    const focused: string[] = [];
    const first = { tagName: "BUTTON", closest: () => null, focus: () => focused.push("first") };
    const last = { tagName: "A", closest: () => null, focus: () => focused.push("last") };
    const root = {
      querySelectorAll: () => [first, last],
      contains: (el: unknown) => el === first || el === last,
    } as unknown as HTMLElement;

    vi.stubGlobal("document", { activeElement: last });
    let prevented = false;
    trapDrawerTab(
      { key: "Tab", shiftKey: false, preventDefault: () => { prevented = true; } } as unknown as KeyboardEvent,
      root,
      true,
    );
    expect(prevented).toBe(true);
    expect(focused).toEqual(["first"]);
  });

  it("renders Stamp mobile date button with aria-expanded, aria-controls, and chevron", async () => {
    const { Stamp } = await import("./storms/stamp");
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
    const vnode = Stamp({
      storm,
      reports: { status: "loading", showLoading: false, retry: () => {} },
      step: null,
      indexReceipt: {
        storm_date: "2024-05-28",
        sources: [],
        confidence: "c",
        run_time: "2024-06-01T00:00:00Z",
        package_version: "0.1.0",
      },
      datesOpen: true,
      onOpenDates: () => {},
    } as never) as VNode<Record<string, unknown>>;
    const children = vnode.props["children"] as VNode<Record<string, unknown>>[];
    const btn = children[0]!;
    expect(btn.props["aria-expanded"]).toBe(true);
    expect(btn.props["aria-controls"]).toBe("storms-scope");
  });

  it("clears stale MapPane pick synchronously on storm switch and preserves step in Workspace Map tab href", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { pathname: "/storms/2024-05-28/map" },
    });
    const { isPickForStorm } = await import("./storms/map-pane");
    expect(typeof isPickForStorm).toBe("function");
    expect(
      isPickForStorm(
        { date: "2024-05-28", lngLat: [-95.36, 29.76], coveringMm: 25.4, nearest: null },
        "2024-05-28",
      ),
    ).toBe(true);
    expect(
      isPickForStorm(
        { date: "2024-05-28", lngLat: [-95.36, 29.76], coveringMm: 25.4, nearest: null },
        "2025-05-01",
      ),
    ).toBe(false);
    expect(isPickForStorm(null, "2024-05-28")).toBe(false);

    const { stormTabItems } = await vi.importActual<typeof import("./storms/workspace")>("./storms/workspace");
    expect(typeof stormTabItems).toBe("function");
    const items = stormTabItems("2024-05-28", 64);
    expect(items.find((t: { id: string; href: string }) => t.id === "map")?.href).toBe("/storms/2024-05-28/map/64");
    expect(items.find((t: { id: string; href: string }) => t.id === "parcels")?.href).toBe("/storms/2024-05-28/parcels");
  });
});
