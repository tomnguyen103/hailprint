import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WRITE_MS, createWriter, reconcile, writeStep } from "./use-step";

describe("writeStep", () => {
  const DATE = "2024-05-28";

  function ports(pathname: string) {
    const replace = vi.fn();
    return { replace, ports: { pathname: () => pathname, replace } };
  }

  it("writes on the bare storm path, where the router shows the map", () => {
    const { replace, ports: p } = ports(`/storms/${DATE}`);
    expect(writeStep(DATE, 12, p)).toBe(true);
    expect(replace).toHaveBeenCalledWith(DATE, 12);
  });

  it("writes on the map path with a step", () => {
    const { replace, ports: p } = ports(`/storms/${DATE}/map/12`);
    expect(writeStep(DATE, 13, p)).toBe(true);
    expect(replace).toHaveBeenCalledWith(DATE, 13);
  });

  it("writes nothing on another tab", () => {
    const { replace, ports: p } = ports(`/storms/${DATE}/score`);
    expect(writeStep(DATE, 12, p)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("writes nothing on another date or another area", () => {
    for (const path of ["/storms/2024-05-29/map/12", "/scorecard/table", "/"]) {
      const { replace, ports: p } = ports(path);
      expect(writeStep(DATE, 12, p)).toBe(false);
      expect(replace).not.toHaveBeenCalled();
    }
  });
});

describe("reconcile", () => {
  it("keeps a newer pending move on the route change of the hook's own write", () => {
    expect(reconcile({ pending: 20, written: 10 }, 10)).toEqual({ pending: 20, written: null, cancel: false });
  });

  it("clears the pending move when the own write matches it", () => {
    expect(reconcile({ pending: 10, written: 10 }, 10)).toEqual({ pending: null, written: null, cancel: false });
  });

  it("clears the pending move and cancels the timer on an outside navigation", () => {
    expect(reconcile({ pending: 20, written: 10 }, 5)).toEqual({ pending: null, written: null, cancel: true });
    expect(reconcile({ pending: 20, written: null }, 5)).toEqual({ pending: null, written: null, cancel: true });
  });
});

describe("createWriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces calls inside the delay into one write of the last value", () => {
    const write = vi.fn();
    const writer = createWriter({ write, delayMs: WRITE_MS });
    for (let step = 0; step < 50; step++) {
      writer.schedule(step);
      vi.advanceTimersByTime(WRITE_MS - 1);
    }
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(49);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("writes again for a call after the first write", () => {
    const write = vi.fn();
    const writer = createWriter({ write, delayMs: WRITE_MS });
    writer.schedule(5);
    vi.advanceTimersByTime(WRITE_MS);
    writer.schedule(6);
    vi.advanceTimersByTime(WRITE_MS);
    expect(write.mock.calls).toEqual([[5], [6]]);
  });

  it("swallows a throwing write", () => {
    const write = vi.fn(() => {
      throw new DOMException("too many calls", "SecurityError");
    });
    const writer = createWriter({ write, delayMs: WRITE_MS });
    writer.schedule(7);
    expect(() => vi.advanceTimersByTime(WRITE_MS)).not.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("skips the write after cancel", () => {
    const write = vi.fn();
    const writer = createWriter({ write, delayMs: WRITE_MS });
    writer.schedule(8);
    writer.cancel();
    vi.advanceTimersByTime(WRITE_MS * 4);
    expect(write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
