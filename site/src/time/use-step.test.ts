import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WRITE_MS, createWriter } from "./use-step";

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
