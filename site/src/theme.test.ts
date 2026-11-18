import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apply, read, resolve } from "./theme";

describe("resolve", () => {
  it("follows the system scheme when nothing is stored", () => {
    expect(resolve(null, true)).toBe("dark");
    expect(resolve(null, false)).toBe("light");
  });
  it("keeps an explicit selection", () => {
    expect(resolve("light", true)).toBe("light");
    expect(resolve("dark", false)).toBe("dark");
  });
  it("treats garbage as system", () => {
    expect(resolve("banana", false)).toBe("light");
    expect(resolve("system", true)).toBe("dark");
  });
});

describe("read", () => {
  it("returns system when the storage getter throws", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("blocked");
      },
    };
    expect(read(storage)).toBe("system");
  });
  it("returns the stored selection", () => {
    expect(read({ getItem: () => "dark" })).toBe("dark");
    expect(read({ getItem: () => "nope" })).toBe("system");
  });
});

describe("state/theme preference store (US-03.5, US-04.1)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("persists setTheme and updates live on matchMedia changes only in system mode", async () => {
    let mediaMatches = false;
    const mediaListeners: Array<(e: { matches: boolean }) => void> = [];
    const store = new Map<string, string>();
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };

    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    });
    vi.stubGlobal("document", {
      documentElement: root,
      createElement: () => ({}),
      createElementNS: () => ({}),
      createTextNode: () => ({}),
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({
        get matches() {
          return mediaMatches;
        },
        addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
          mediaListeners.push(fn);
        },
      }),
    });

    const mod = await import("./state/theme");
    expect(read()).toBe("system");

    mod.setTheme("dark");
    expect(store.get("theme")).toBe("dark");
    expect(root.dataset["theme"]).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    // In explicit dark mode, OS scheme flip to light must not overwrite data-theme
    mediaMatches = false;
    mediaListeners.forEach((fn) => fn({ matches: false }));
    expect(root.dataset["theme"]).toBe("dark");

    // Returning to system mode follows OS scheme live
    mod.setTheme("system");
    expect(store.get("theme")).toBe("system");
    expect(root.dataset["theme"]).toBe("light");
    mediaMatches = true;
    mediaListeners.forEach((fn) => fn({ matches: true }));
    expect(root.dataset["theme"]).toBe("dark");

    let latest: ReturnType<typeof mod.useTheme> | null = null;
    function Probe() {
      latest = mod.useTheme();
      return null;
    }
    const host = { nodeType: 1, childNodes: [], firstChild: null, appendChild() {}, insertBefore() {}, removeChild() {} } as unknown as HTMLElement;
    await act(() => render(h(Probe, null), host));
    expect(latest!.pref).toBe("system");
    expect(latest!.resolved).toBe("dark");
  });

  it("suppresses transitions across double-rAF, stamps theme before reflow, and cancels prior rAF on rapid apply() (US-01.1)", () => {
    const attrs = new Map<string, string>();
    let nextId = 1;
    const pending = new Map<number, () => void>();
    const cancelled: number[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelled.push(id);
      pending.delete(id);
    });
    const reflowSeenThemes: Array<string | undefined> = [];
    const dataset: Record<string, string> = {};
    const fakeRoot = {
      dataset,
      style: { colorScheme: "" },
      get offsetHeight() {
        reflowSeenThemes.push(dataset["theme"]);
        return 0;
      },
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    } as unknown as HTMLElement;

    apply("dark", fakeRoot);
    expect(fakeRoot.dataset["theme"]).toBe("dark");
    expect(fakeRoot.style.colorScheme).toBe("dark");
    expect(reflowSeenThemes).toEqual(["dark"]);
    expect(attrs.has("data-theme-swap")).toBe(true);
    expect(pending.size).toBe(1);

    // Rapid second apply cancels the first pending rAF
    apply("light", fakeRoot);
    expect(cancelled).toEqual([1]);
    expect(reflowSeenThemes).toEqual(["dark", "light"]);
    expect(attrs.has("data-theme-swap")).toBe(true);
    expect(pending.size).toBe(1);

    // First rAF schedules second rAF; data-theme-swap remains active until after paint
    const firstCb = pending.get(2)!;
    pending.delete(2);
    firstCb();
    expect(attrs.has("data-theme-swap")).toBe(true);
    expect(pending.size).toBe(1);

    // Second rAF removes data-theme-swap
    const secondCb = pending.get(3)!;
    pending.delete(3);
    secondCb();
    expect(attrs.has("data-theme-swap")).toBe(false);
  });
});
