import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { GLYPHS_URL, basemapLabelLayers, basemapLayers, spriteUrl } from "./basemap";
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
  return { FakeMap, hasBasemap: false };
});

vi.mock("maplibre-gl", () => ({
  Map: stub.FakeMap,
  Marker: class {},
  NavigationControl: class {},
  addProtocol() {},
  setWorkerUrl() {},
}));

// The probe fetches the basemap file. Most tests run with no basemap, so the style is the paper one.
vi.mock("./basemap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./basemap")>()),
  probeBasemap: async () => stub.hasBasemap,
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
    stub.hasBasemap = false;
    // A tile error logs one warning. The spy keeps it out of the test output.
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), setTimeout, clearTimeout });
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

  it("sandwiches thematic layers between basemap geometry and haloed labels when basemap is present", async () => {
    expect(GLYPHS_URL).toBe("https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf");
    expect(spriteUrl("light")).toBe("https://protomaps.github.io/basemaps-assets/sprites/v4/light");
    expect(spriteUrl("dark")).toBe("https://protomaps.github.io/basemaps-assets/sprites/v4/dark");

    const tokenValues: Record<string, string> = {
      "--paper": "#f7f6f2",
      "--sheet-muted": "#efede6",
      "--rule": "#e2dfd5",
      "--water": "#e4eae8",
      "--road-major": "#cfcbc0",
      "--ink": "#1f1e1b",
      "--ink-muted": "#4a4840",
    };
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => tokenValues[name] ?? `#tok-${name}`,
    }));

    const geomLayers = basemapLayers("light");
    const waterLayer = geomLayers.find((l) => l.id === "water") as { paint?: Record<string, unknown> } | undefined;
    expect(waterLayer?.paint?.["fill-color"]).toBe("#e4eae8");
    const highwayLayer = geomLayers.find((l) => l.id === "roads_highway") as { paint?: Record<string, unknown> } | undefined;
    expect(highwayLayer?.paint?.["line-color"]).toBe("#cfcbc0");
    expect(geomLayers.every((l) => l.type !== "symbol")).toBe(true);

    const labelLayers = basemapLabelLayers("light") as { id: string; type: string; paint?: Record<string, unknown> }[];
    expect(labelLayers.length).toBeGreaterThan(0);
    expect(labelLayers.every((l) => l.type === "symbol")).toBe(true);
    const labelIds = labelLayers.map((l) => l.id);
    expect(labelIds).toContain("places_locality");
    expect(labelIds).toContain("roads_shields");
    for (const excluded of [
      "pois",
      "address_label",
      "roads_oneway",
      "roads_labels_minor",
      "earth_label_islands",
      "places_country",
    ]) {
      expect(labelIds).not.toContain(excluded);
    }
    const locality = labelLayers.find((l) => l.id === "places_locality");
    expect(locality?.paint?.["text-color"]).toBe("#1f1e1b");
    expect(locality?.paint?.["text-halo-color"]).toBe("#f7f6f2");

    stub.hasBasemap = true;
    const { state, map } = await start();
    map.emit("load");
    await advance(0);
    expect(state.status).toBe("resolved");
    expect(state.value?.basemap).toBe(true);

    const style = (
      map.options as { style: { glyphs?: string; sprite?: string; layers: { id: string; source?: string }[] } }
    ).style;
    expect(style.glyphs).toBe("https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf");
    expect(style.sprite).toBe("https://protomaps.github.io/basemaps-assets/sprites/v4/light");

    const ids = style.layers.map((l) => l.id);
    const waterIdx = ids.indexOf("water");
    const powerFillIdx = ids.indexOf("power-fill");
    const swathTopIdx = ids.indexOf("swath-fill-63.5");
    const localityIdx = ids.indexOf("places_locality");
    const warningsSvIdx = ids.indexOf("warnings-sv");
    expect(waterIdx).toBeGreaterThan(0);
    expect(waterIdx).toBeLessThan(powerFillIdx);
    expect(powerFillIdx).toBeLessThan(swathTopIdx);
    expect(swathTopIdx).toBeLessThan(localityIdx);
    expect(localityIdx).toBeLessThan(warningsSvIdx);
  });

  it("preserves sandwiched basemap layer order and updates sprite on setTheme", async () => {
    stub.hasBasemap = true;
    const { state, map } = await start();
    const style = (map.options as { style: { layers: { id: string; source?: string }[] } }).style;
    const liveLayers = [...style.layers];
    const setSprite = vi.fn();
    Object.assign(map, {
      setPaintProperty: vi.fn(),
      getStyle: () => ({ layers: [...liveLayers] }),
      removeLayer: (id: string) => {
        const idx = liveLayers.findIndex((l) => l.id === id);
        if (idx >= 0) liveLayers.splice(idx, 1);
      },
      addLayer: (layer: { id: string; source?: string }, beforeId?: string) => {
        const idx = beforeId ? liveLayers.findIndex((l) => l.id === beforeId) : -1;
        if (idx >= 0) liveLayers.splice(idx, 0, layer);
        else liveLayers.push(layer);
      },
      setSprite,
    });

    map.emit("load");
    await advance(0);
    const handle = state.value!;
    handle.setTheme("dark");
    handle.setTheme("light");

    expect(setSprite).toHaveBeenNthCalledWith(1, "https://protomaps.github.io/basemaps-assets/sprites/v4/dark");
    expect(setSprite).toHaveBeenNthCalledWith(2, "https://protomaps.github.io/basemaps-assets/sprites/v4/light");

    const ids = liveLayers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf("water")).toBeLessThan(ids.indexOf("power-fill"));
    expect(ids.indexOf("swath-fill-63.5")).toBeLessThan(ids.indexOf("places_locality"));
    expect(ids.indexOf("places_locality")).toBeLessThan(ids.indexOf("warnings-sv"));
  });

  it("omits glyphs, sprite, and basemap layers when probeBasemap resolves false", async () => {
    stub.hasBasemap = false;
    const { state, map } = await start();
    map.emit("load");
    await advance(0);
    expect(state.value?.basemap).toBe(false);
    const style = (
      map.options as {
        style: { glyphs?: string; sprite?: string; sources: Record<string, unknown>; layers: { id: string; source?: string }[] };
      }
    ).style;
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(style.sources["basemap"]).toBeUndefined();
    expect(style.layers.some((l) => l.source === "basemap")).toBe(false);
  });

  it("probeBasemap returns true only for a non-HTML 200 response and false on 404, HTML fallback, or network failure", async () => {
    const actual = await vi.importActual<typeof import("./basemap")>("./basemap");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/octet-stream" },
      }),
    );
    expect(await actual.probeBasemap()).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "text/html; charset=utf-8" },
      }),
    );
    expect(await actual.probeBasemap()).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        headers: { get: () => "application/octet-stream" },
      }),
    );
    expect(await actual.probeBasemap()).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network down")));
    expect(await actual.probeBasemap()).toBe(false);
  });
});
