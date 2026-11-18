import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataError } from "../../data/types";
import type { MapHandle } from "./create-map";
import type { Theme } from "./layers";
import { useMap, type UseMapOptions } from "./use-map";

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

const createMapMock = vi.fn();

vi.mock("./create-map", () => ({
  createMap: (...args: unknown[]) => createMapMock(...args),
}));

function makeStubHandle() {
  return {
    basemap: false,
    map: { on: vi.fn(), off: vi.fn(), getCenter: vi.fn(), getZoom: vi.fn(), getBearing: vi.fn(), getPitch: vi.fn(), jumpTo: vi.fn() },
    setData: vi.fn(),
    setTheme: vi.fn(),
    setClassVisible: vi.fn(),
    setLayerVisible: vi.fn(),
    setWarnings: vi.fn(),
    setCounties: vi.fn(),
    setFill: vi.fn(),
    setReportCutoff: vi.fn(),
    fit: vi.fn(),
    setPoint: vi.fn(),
    flyTo: vi.fn(),
    destroy: vi.fn(),
  } as unknown as MapHandle;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useMap shared MapLibre lifecycle hook (US-02.1, US-02.3, US-02.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createMapMock.mockReset();
    vi.stubGlobal("document", {
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
    });
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const flush = async () => {
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
  };

  it("mounts MapLibre once with options, runs onReady, updates theme live, and destroys on unmount (US-02.1)", async () => {
    const stub = makeStubHandle();
    const onReady = vi.fn();
    createMapMock.mockResolvedValueOnce(stub);

    let latest: ReturnType<typeof useMap> | null = null;
    function Probe({ theme, options }: { theme: Theme; options?: UseMapOptions }) {
      const state = useMap(theme, options);
      latest = state;
      return h("div", { ref: state.container });
    }

    const host = makeFakeElement("div");
    await act(() => render(h(Probe, { theme: "light", options: { navigation: false, onReady } }), host as unknown as HTMLElement));
    await flush();

    expect(createMapMock).toHaveBeenCalledTimes(1);
    expect(createMapMock).toHaveBeenCalledWith(host.firstChild, "light", { navigation: false });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(stub);
    expect(latest!.ready).toBe(true);
    expect(latest!.error).toBeNull();
    expect(latest!.handle.current).toBe(stub);

    await act(() => render(h(Probe, { theme: "dark", options: { navigation: false, onReady } }), host as unknown as HTMLElement));
    await flush();
    expect(stub.setTheme).toHaveBeenCalledWith("dark");
    expect(createMapMock).toHaveBeenCalledTimes(1);

    await act(() => render(null, host as unknown as HTMLElement));
    await flush();
    expect(stub.destroy).toHaveBeenCalledTimes(1);
    expect(latest!.handle.current).toBeNull();
  });

  it("destroys a stale MapHandle immediately when cleanup runs before createMap settles (US-02.4)", async () => {
    const gate = deferred<MapHandle>();
    const stale = makeStubHandle();
    const onReady = vi.fn();
    createMapMock.mockReturnValueOnce(gate.promise);

    let latest: ReturnType<typeof useMap> | null = null;
    function Probe({ theme }: { theme: Theme }) {
      const state = useMap(theme, { onReady });
      latest = state;
      return h("div", { ref: state.container });
    }

    const host = makeFakeElement("div");
    await act(() => render(h(Probe, { theme: "light" }), host as unknown as HTMLElement));
    await flush();
    expect(createMapMock).toHaveBeenCalledTimes(1);
    expect(latest!.ready).toBe(false);

    // Unmount while createMap is still pending
    await act(() => render(null, host as unknown as HTMLElement));
    await flush();

    await act(async () => {
      gate.resolve(stale);
      await gate.promise;
    });
    await flush();

    expect(stale.destroy).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
    expect(latest!.handle.current).toBeNull();
    expect(latest!.ready).toBe(false);
  });

  it("captures async createMap failure as DataError and recovers cleanly on retry (US-02.3)", async () => {
    const fresh = makeStubHandle();
    createMapMock
      .mockRejectedValueOnce(new Error("WebGL init failed"))
      .mockResolvedValueOnce(fresh);

    let latest: ReturnType<typeof useMap> | null = null;
    function Probe({ theme }: { theme: Theme }) {
      const state = useMap(theme);
      latest = state;
      return h("div", { ref: state.container });
    }

    const host = makeFakeElement("div");
    await act(() => render(h(Probe, { theme: "light" }), host as unknown as HTMLElement));
    await flush();

    expect(latest!.ready).toBe(false);
    expect(latest!.error).toBeInstanceOf(DataError);
    expect(latest!.error?.file).toBe("map");
    expect(latest!.error?.reason).toContain("WebGL init failed");

    await act(() => {
      latest!.retry();
    });
    await flush();

    expect(createMapMock).toHaveBeenCalledTimes(2);
    expect(latest!.error).toBeNull();
    expect(latest!.ready).toBe(true);
    expect(latest!.handle.current).toBe(fresh);

    await act(() => render(null, host as unknown as HTMLElement));
    await flush();
    expect(fresh.destroy).toHaveBeenCalledTimes(1);
  });

  it("ignores rejection after unmount without updating error state (US-02.3, US-02.4)", async () => {
    const gate = deferred<MapHandle>();
    createMapMock.mockReturnValueOnce(gate.promise);

    let latest: ReturnType<typeof useMap> | null = null;
    function Probe({ theme }: { theme: Theme }) {
      const state = useMap(theme);
      latest = state;
      return h("div", { ref: state.container });
    }

    const host = makeFakeElement("div");
    await act(() => render(h(Probe, { theme: "light" }), host as unknown as HTMLElement));
    await flush();
    await act(() => render(null, host as unknown as HTMLElement));
    await flush();

    await act(async () => {
      gate.reject(new Error("late failure"));
      await gate.promise.catch(() => {});
    });
    await flush();

    expect(latest!.error).toBeNull();
    expect(latest!.ready).toBe(false);
  });
});
