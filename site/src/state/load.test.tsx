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
});
