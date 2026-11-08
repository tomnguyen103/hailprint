import { h, type VNode } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRadiusKm, resetRadiusKm, setRadiusKm, subscribeRadius } from "../state/radius";
import { PeekDrawer } from "./peek-drawer";
import { ProofStrip } from "./proof-strip";

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

describe("PeekDrawer, ProofStrip, and shared radius store", () => {
  beforeEach(() => {
    resetRadiusKm();
  });

  it("persists, clamps, rounds, and notifies subscribers on shared verification radius updates", () => {
    const listener = vi.fn();
    const unsub = subscribeRadius(listener);
    expect(getRadiusKm()).toBe(5);

    setRadiusKm(14.6);
    expect(getRadiusKm()).toBe(15);
    expect(listener).toHaveBeenCalledTimes(1);

    // Unchanged rounded value takes early return without notifying listeners
    setRadiusKm(15.2);
    expect(listener).toHaveBeenCalledTimes(1);

    // Clamps to [0, 25]
    setRadiusKm(-4);
    expect(getRadiusKm()).toBe(0);
    setRadiusKm(99);
    expect(getRadiusKm()).toBe(25);
    expect(listener).toHaveBeenCalledTimes(3);

    // resetRadiusKm clamps, rounds, and skips no-op notifications
    resetRadiusKm(12.4);
    expect(getRadiusKm()).toBe(12);
    expect(listener).toHaveBeenCalledTimes(4);
    resetRadiusKm(12);
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

  it("renders 4 route links in ProofStrip, preserves map step, and marks active tab with aria-current", () => {
    const tree = ProofStrip({ date: "2024-05-28", activeTab: "score", step: 46 });
    const links = findNodes(tree, (v) => v.props?.["class"] === "proof-step");
    expect(links).toHaveLength(4);
    expect(links[0]!.props["href"]).toBe("/storms/2024-05-28/map?step=46");
    const active = links.find((l) => l.props["aria-current"] === "page")!;
    expect(textOf(active)).toContain("Skill Score");
    expect(textOf(links[3])).toContain("Provenance files");
  });
});

