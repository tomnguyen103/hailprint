import { h, render, type VNode } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { AreaBoundary } from "./shell/area-boundary";

type Current = { path: string; route: object };

// Every module that loads DOM, CSS, or MapLibre is a stub. The router and the boundary stay real.
const stub = vi.hoisted(() => ({
  layouts: [] as { children: unknown }[],
  log: [] as string[],
  shown: [] as { error: { message: string } }[],
  armed: true,
  current: { path: "/method/data", route: { kind: "method", page: "data" } } as Current,
}));
vi.mock("./shell/layout", () => ({
  Layout: (props: { children: unknown }) => {
    stub.layouts.push(props);
    return props.children;
  },
}));
vi.mock("./shell/states", () => ({
  ErrorState: (props: { error: { message: string } }) => {
    stub.shown.push(props);
    stub.log.push("error");
    return null;
  },
  EmptyState: () => null,
  LoadingState: () => null,
}));
vi.mock("./state/route", () => ({ useRoute: () => stub.current }));
vi.mock("./state/index", () => ({
  useIndex: () => ({ status: "ready", data: { storms: [{ storm_date: "2024-05-28" }] }, showLoading: false, retry() {} }),
}));
vi.mock("./areas/storms", () => ({ StormsArea: () => null }));
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
    stub.shown.length = 0;
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

  it("a page that throws shows the error state and keeps the layout", async () => {
    await mount();

    expect(stub.shown.at(-1)?.error.message).toBe("page: Error: boom");
    expect(stub.layouts.length).toBeGreaterThan(0);
  });

  it("a new path clears the error state and renders the new page", async () => {
    await mount();
    stub.current = { path: "/pipeline/runs", route: { kind: "pipeline", view: "runs" } };

    await mount();

    expect(stub.log.at(-1)).toBe("pipeline");
  });
});
