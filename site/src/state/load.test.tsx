import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoad } from "./load";

type Seen = { key: string; status: string; data: string | undefined };

describe("useLoad", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The node test environment has no DOM: `render` only compares its host with `document`.
    vi.stubGlobal("document", {});
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns loading on the first render of a new key, never the data of the old key", async () => {
    const seen: Seen[] = [];
    function Probe({ name }: { name: string }) {
      const load = useLoad(name, () => Promise.resolve(`data of ${name}`));
      seen.push({ key: name, status: load.status, data: load.data });
      return null;
    }
    const host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;

    await act(() => render(h(Probe, { name: "A" }), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(seen.at(-1)).toEqual({ key: "A", status: "ready", data: "data of A" });

    await act(() => render(h(Probe, { name: "B" }), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    const forB = seen.filter((entry) => entry.key === "B");
    expect(forB[0]).toEqual({ key: "B", status: "loading", data: undefined });
    expect(forB.some((entry) => entry.data === "data of A")).toBe(false);
    expect(forB.at(-1)).toEqual({ key: "B", status: "ready", data: "data of B" });
  });

  it("settles synchronously when wait === 0 and clears pending settle timer on unmount (US-03.2)", async () => {
    const clearSpy = vi.fn((id: number) => clearTimeout(id));
    const setSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms));
    vi.stubGlobal("window", {
      setTimeout: setSpy,
      clearTimeout: clearSpy,
    });

    const seen: Seen[] = [];
    let resolveDelayed!: (v: string) => void;
    function Probe({ name, start }: { name: string; start: () => Promise<string> }) {
      const load = useLoad(name, start);
      seen.push({ key: name, status: load.status, data: load.data });
      return null;
    }
    const host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;

    // Immediate promise settles via microtask only without scheduling a 0ms setTimeout
    await act(() => {
      render(h(Probe, { name: "fast", start: () => Promise.resolve("instant") }), host);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(seen.at(-1)).toEqual({ key: "fast", status: "ready", data: "instant" });
    expect(setSpy.mock.calls.some(([, ms]) => ms === 0)).toBe(false);

    // Delayed promise that triggers showLoading (>300ms), settles, then unmounts before 500ms keep timer fires
    await act(async () => {
      render(
        h(Probe, {
          name: "slow",
          start: () =>
            new Promise<string>((resolve) => {
              resolveDelayed = resolve;
            }),
        }),
        host,
      );
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(350)));
    await act(async () => {
      resolveDelayed("late");
    });
    const clearsBeforeUnmount = clearSpy.mock.calls.length;
    await act(() => render(null, host));
    // Cleanup cleared both show timer and pending settle timer
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(clearsBeforeUnmount + 2);
  });
});
