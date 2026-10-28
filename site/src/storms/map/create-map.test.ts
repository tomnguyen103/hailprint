import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOAD_TIMEOUT_MS, whenLoaded } from "./create-map";

vi.mock("maplibre-gl", () => ({
  Marker: class {},
  Map: class {},
  NavigationControl: class {},
  addProtocol() {},
  setWorkerUrl() {},
}));

type Listener = (event: object) => void;

/** The three Map methods `whenLoaded` uses. `emit` visits a snapshot of the listeners, as MapLibre does. */
function fakeMap() {
  const listeners = new Map<string, Set<Listener>>();
  const remove = vi.fn();
  const map = {
    on(type: string, listener: Listener) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
      return map;
    },
    off(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
      return map;
    },
    remove,
  };
  return {
    map: map as unknown as Pick<MapLibreMap, "on" | "off" | "remove">,
    remove,
    emit(type: string, event: object = {}) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    listening: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

/** The outcome of a promise, readable at any moment. */
function track(promise: Promise<void>) {
  const state: { status: "pending" | "resolved" | "rejected"; error?: unknown } = { status: "pending" };
  promise.then(
    () => void (state.status = "resolved"),
    (error: unknown) => {
      state.status = "rejected";
      state.error = error;
    },
  );
  return state;
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("whenLoaded", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a tile error does not fail the load", async () => {
    const fake = fakeMap();
    const state = track(whenLoaded(fake.map));

    fake.emit("error", { error: new Error("404"), tile: {} });
    await advance(0);
    expect(state.status).toBe("pending");

    fake.emit("load");
    await advance(0);
    expect(state.status).toBe("resolved");
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("the timeout rejects at 15 000 ms and removes the map", async () => {
    expect(LOAD_TIMEOUT_MS).toBe(15_000);
    const fake = fakeMap();
    const state = track(whenLoaded(fake.map));

    await advance(14_999);
    expect(state.status).toBe("pending");
    expect(fake.remove).not.toHaveBeenCalled();

    await advance(1);
    expect(state.status).toBe("rejected");
    expect(state.error).toEqual(new Error("map did not load in 15000 ms"));
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it("a load at 14 999 ms resolves and clears the timer", async () => {
    const fake = fakeMap();
    const state = track(whenLoaded(fake.map));

    await advance(14_999);
    fake.emit("load");
    await advance(0);

    expect(state.status).toBe("resolved");
    expect(vi.getTimerCount()).toBe(0);
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("an error without a tile rejects with the event error and removes the map", async () => {
    const fake = fakeMap();
    const state = track(whenLoaded(fake.map));
    const failure = new Error("style is broken");

    fake.emit("error", { error: failure });
    await advance(0);

    expect(state.status).toBe("rejected");
    expect(state.error).toBe(failure);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it("an error event with no error field rejects with a fallback message", async () => {
    const fake = fakeMap();
    const state = track(whenLoaded(fake.map));

    fake.emit("error", {});
    await advance(0);

    expect(state.status).toBe("rejected");
    expect(state.error).toEqual(new Error("map failed to load"));
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it("a settled load ignores later events and holds no listener", async () => {
    const loaded = fakeMap();
    const loadedState = track(whenLoaded(loaded.map));
    loaded.emit("load");
    loaded.emit("load");
    loaded.emit("error", { error: new Error("late") });
    await advance(20_000);
    expect(loadedState.status).toBe("resolved");
    expect(loaded.remove).not.toHaveBeenCalled();
    expect(loaded.listening("load")).toBe(0);
    expect(loaded.listening("error")).toBe(0);

    const failed = fakeMap();
    const failedState = track(whenLoaded(failed.map));
    failed.emit("error", { error: new Error("first") });
    failed.emit("error", { error: new Error("second") });
    failed.emit("load");
    await advance(20_000);
    expect(failedState.status).toBe("rejected");
    expect(failedState.error).toEqual(new Error("first"));
    expect(failed.remove).toHaveBeenCalledTimes(1);
    expect(failed.listening("load")).toBe(0);
    expect(failed.listening("error")).toBe(0);
  });
});
