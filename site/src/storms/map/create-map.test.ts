import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createMap } from "./create-map";
import { LOAD_TIMEOUT_MS } from "./when-loaded";

const stub = vi.hoisted(() => {
  type Handler = (event: object) => void;
  /** The Map methods `createMap` and `whenLoaded` use. `emit` visits a snapshot of the listeners, as MapLibre does. */
  class FakeMap {
    static instances: FakeMap[] = [];
    readonly listeners = new Map<string, Set<Handler>>();
    readonly remove = vi.fn();
    readonly addControl = vi.fn();
    constructor(readonly options: unknown) {
      FakeMap.instances.push(this);
    }
    on(type: string, listener: Handler) {
      this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener));
      return this;
    }
    once(type: string, listener: Handler) {
      const wrapper: Handler = (event) => {
        this.off(type, wrapper);
        listener(event);
      };
      return this.on(type, wrapper);
    }
    off(type: string, listener: Handler) {
      this.listeners.get(type)?.delete(listener);
      return this;
    }
    emit(type: string, event: object = {}) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    }
    listening(type: string) {
      return this.listeners.get(type)?.size ?? 0;
    }
  }
  return { FakeMap };
});

vi.mock("maplibre-gl", () => ({
  Map: stub.FakeMap,
  Marker: class {},
  NavigationControl: class {},
  addProtocol() {},
  setWorkerUrl() {},
}));

// The probe fetches the basemap file. The tests run with no basemap, so the style is the paper one.
vi.mock("./basemap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./basemap")>()),
  probeBasemap: async () => false,
}));

/** The outcome of a promise, readable at any moment. */
function track<T>(promise: Promise<T>) {
  const state: { status: "pending" | "resolved" | "rejected"; value?: T; error?: unknown } = { status: "pending" };
  promise.then(
    (value) => {
      state.status = "resolved";
      state.value = value;
    },
    (error: unknown) => {
      state.status = "rejected";
      state.error = error;
    },
  );
  return state;
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Start `createMap` and wait until it has made its one map. */
async function start() {
  const state = track(createMap({} as HTMLElement, "light"));
  await advance(0);
  const [map, ...rest] = stub.FakeMap.instances;
  expect(rest).toEqual([]);
  return { state, map: map! };
}

describe("createMap", () => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    vi.useFakeTimers();
    stub.FakeMap.instances.length = 0;
    // A tile error logs one warning. The spy keeps it out of the test output.
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", {
      hidden: false,
      documentElement: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#ffffff" }));
  });
  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("stays pending on a tile error, then a load resolves it with a handle over the map", async () => {
    const { state, map } = await start();
    const failure = new Error("503");

    map.emit("error", { error: failure, tile: {} });
    await advance(0);
    expect(state.status).toBe("pending");
    expect(warn).toHaveBeenCalledWith("map tile failed", failure);
    expect(map.remove).not.toHaveBeenCalled();

    map.emit("load");
    await advance(0);
    expect(state.status).toBe("resolved");
    expect(state.value?.map).toBe(map);
    expect(state.value?.basemap).toBe(false);
    expect(map.remove).not.toHaveBeenCalled();
    expect(map.addControl).toHaveBeenCalledTimes(1);
  });

  it("rejects on an error without a tile and removes the map once", async () => {
    const { state, map } = await start();
    const failure = new Error("style is broken");

    map.emit("error", { error: failure });
    await advance(0);

    expect(state.status).toBe("rejected");
    expect(state.error).toBe(failure);
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(map.listening("load")).toBe(0);
    expect(map.listening("error")).toBe(0);
  });

  it("rejects when no load comes within LOAD_TIMEOUT_MS and removes the map once", async () => {
    const { state, map } = await start();

    await advance(LOAD_TIMEOUT_MS - 1);
    expect(state.status).toBe("pending");
    expect(map.remove).not.toHaveBeenCalled();

    await advance(1);
    expect(state.status).toBe("rejected");
    expect(state.error).toEqual(new Error(`map did not load in ${LOAD_TIMEOUT_MS} ms`));
    expect(map.remove).toHaveBeenCalledTimes(1);
  });
});
