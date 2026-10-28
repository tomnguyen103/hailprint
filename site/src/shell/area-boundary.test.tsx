import { h, render, type ComponentChildren } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataError } from "../data/types";
import { AreaBoundary } from "./area-boundary";

type Shown = { error: DataError; onRetry: () => void };

// ErrorState builds DOM nodes, and the node environment has none: a recorder stands in for it.
const stub = vi.hoisted(() => ({ shown: [] as Shown[] }));
vi.mock("./states", () => ({
  ErrorState: (props: Shown) => {
    stub.shown.push(props);
    return null;
  },
}));

const seen: string[] = [];
let armed = true;
let payload: unknown = new Error("boom");

function Child({ name }: { name: string }) {
  seen.push(name);
  return null;
}
function Boom() {
  if (armed) throw payload;
  return null;
}
const Middle = () => h(Boom, null);
const Outer = () => h(Middle, null);

const last = (): Shown => {
  const shown = stub.shown.at(-1);
  if (!shown) throw new Error("ErrorState never rendered");
  return shown;
};

describe("AreaBoundary", () => {
  let host: HTMLElement;
  let logged: ReturnType<typeof vi.spyOn>;
  const mount = (resetKey: string, ...children: ComponentChildren[]) =>
    act(() => render(h(AreaBoundary, { resetKey, children }), host));

  beforeEach(() => {
    vi.useFakeTimers();
    // The node test environment has no DOM: `render` only compares its host with `document`.
    vi.stubGlobal("document", {});
    host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub.shown.length = 0;
    seen.length = 0;
    armed = true;
    payload = new Error("boom");
  });
  afterEach(() => {
    logged.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a render throw shows the error state and holds the children back", async () => {
    await mount("/a", h(Boom, null), h(Child, { name: "page" }));

    expect(last().error.file).toBe("page");
    expect(last().error.message).toBe("page: Error: boom");

    // Preact renders the siblings of the child that throws once. A later render shows the error state alone.
    seen.length = 0;
    await mount("/a", h(Boom, null), h(Child, { name: "page" }));
    expect(seen).toEqual([]);
  });

  it("children render when nothing throws", async () => {
    armed = false;
    await mount("/a", h(Child, { name: "page" }));

    expect(seen).toEqual(["page"]);
    expect(stub.shown).toEqual([]);
  });

  it("a deep throw is caught", async () => {
    await mount("/a", h(Outer, null));

    expect(last().error.message).toBe("page: Error: boom");
  });

  it("a thrown string shows its text", async () => {
    payload = "boom";
    await mount("/a", h(Boom, null));

    expect(last().error.message).toBe("page: boom");
  });

  it("Retry renders the children again", async () => {
    await mount("/a", h(Boom, null), h(Child, { name: "page" }));
    armed = false;
    seen.length = 0;
    const shownBefore = stub.shown.length;

    await act(() => last().onRetry());

    expect(seen).toEqual(["page"]);
    expect(stub.shown).toHaveLength(shownBefore);
  });

  it("Retry on a child that throws again shows the error state again and stops", async () => {
    await mount("/a", h(Boom, null));
    const before = stub.shown.length;

    await act(() => last().onRetry());
    await vi.advanceTimersByTimeAsync(100);

    expect(stub.shown).toHaveLength(before + 1);
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it("a new resetKey renders the children again after an error", async () => {
    await mount("/a", h(Boom, null), h(Child, { name: "page" }));
    armed = false;
    seen.length = 0;

    await mount("/b", h(Boom, null), h(Child, { name: "page" }));

    expect(seen).toEqual(["page"]);
  });

  it("a new resetKey with no error renders the children again and shows no error state", async () => {
    armed = false;
    await mount("/a", h(Child, { name: "page" }));

    await mount("/b", h(Child, { name: "page" }));

    expect(seen).toEqual(["page", "page"]);
    expect(stub.shown).toEqual([]);
  });

  it("the error is logged once", async () => {
    await mount("/a", h(Boom, null));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe(payload);
  });
});
