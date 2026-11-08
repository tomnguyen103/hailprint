import { h, type VNode } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRadiusKm, resetRadiusKm, setRadiusKm } from "../state/radius";
import { PeekDrawer } from "./peek-drawer";
import { ProofStrip } from "./proof-strip";

function findButtons(node: unknown): VNode<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(findButtons);
  const v = node as VNode<Record<string, unknown>>;
  const self = v.type === "button" ? [v] : [];
  return [...self, ...findButtons(v.props?.["children"])];
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

  it("persists and resets shared verification radius across views", () => {
    expect(getRadiusKm()).toBe(10);
    setRadiusKm(20);
    expect(getRadiusKm()).toBe(20);
    resetRadiusKm();
    expect(getRadiusKm()).toBe(10);
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
    const closeBtn = findButtons(tree).find((b) => textOf(b) === "Close")!;
    expect(closeBtn).toBeDefined();
    (closeBtn.props["onClick"] as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders 4 steps in ProofStrip with active state on current tab", () => {
    const tree = ProofStrip({ date: "2024-05-28", activeTab: "score" });
    const buttons = findButtons(tree);
    expect(buttons).toHaveLength(4);
    const active = buttons.find((b) => b.props["aria-pressed"] === true)!;
    expect(textOf(active)).toContain("Skill Score");
  });
});
