import { h, type VNode } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRadiusKm, resetRadiusKm, setRadiusKm, subscribeRadius } from "../state/radius";
import { PeekDrawer } from "./peek-drawer";

function findNodes(
  node: unknown,
  pred: (v: VNode<Record<string, unknown>>) => boolean,
): VNode<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findNodes(n, pred));
  const v = node as VNode<Record<string, unknown>>;
  const self = pred(v) ? [v] : [];
  return [...self, ...findNodes(v.props?.["children"], pred)];
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(textOf).join("");
  const v = node as VNode<Record<string, unknown>>;
  return textOf(v.props?.["children"]);
}

describe("PeekDrawer and shared radius store (US-01.1, US-01.2)", () => {
  beforeEach(() => {
    resetRadiusKm();
  });

  it("persists, clamps [0, 20], rounds, rejects NaN, and notifies subscribers on shared verification radius updates", () => {
    const listener = vi.fn();
    const unsub = subscribeRadius(listener);
    expect(getRadiusKm()).toBe(5);

    setRadiusKm(14.6);
    expect(getRadiusKm()).toBe(15);
    expect(listener).toHaveBeenCalledTimes(1);

    // Unchanged rounded value takes early return without notifying listeners
    setRadiusKm(15.2);
    expect(listener).toHaveBeenCalledTimes(1);

    // Non-finite input must not poison store with NaN
    setRadiusKm(Number.NaN);
    expect(getRadiusKm()).toBe(15);
    expect(listener).toHaveBeenCalledTimes(1);

    // Clamps to [0, 20] at exact boundaries and beyond
    setRadiusKm(-1);
    expect(getRadiusKm()).toBe(0);
    setRadiusKm(21);
    expect(getRadiusKm()).toBe(20);
    expect(listener).toHaveBeenCalledTimes(3);

    // resetRadiusKm clamps, rounds, ignores NaN, and skips no-op notifications
    resetRadiusKm(12.4);
    expect(getRadiusKm()).toBe(12);
    expect(listener).toHaveBeenCalledTimes(4);
    resetRadiusKm(12);
    expect(listener).toHaveBeenCalledTimes(4);
    resetRadiusKm(Number.NaN);
    expect(getRadiusKm()).toBe(12);
    expect(listener).toHaveBeenCalledTimes(4);

    resetRadiusKm();
    expect(getRadiusKm()).toBe(5);
    unsub();
  });

  it("renders PeekDrawer when open and closes on button click", () => {
    const onClose = vi.fn();
    const closed = PeekDrawer({ open: false, title: "Hidden", onClose });
    expect(closed).toBeNull();

    const tree = PeekDrawer({
      open: true,
      title: "Threshold >= 1.00 in (quarter)",
      subtitle: "25.4 mm · 10 km radius",
      onClose,
      children: h("p", null, "Contingency breakdown"),
    });
    expect(textOf(tree)).toContain("Threshold >= 1.00 in (quarter)");
    expect(textOf(tree)).toContain("Contingency breakdown");
    const closeBtn = findNodes(tree, (v) => v.type === "button").find((b) => textOf(b) === "Close")!;
    expect(closeBtn).toBeDefined();
    (closeBtn.props["onClick"] as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});



