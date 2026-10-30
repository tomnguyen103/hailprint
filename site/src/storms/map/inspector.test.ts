import type { ComponentChild, VNode } from "preact";
import { beforeEach, describe, expect, it } from "vitest";
import type { Receipt } from "../../data/types";
import { getPinState, resetPinStore } from "../../state/pin";
import { InspectorView } from "./inspector";

type Node = VNode<Record<string, unknown>>;

function findAll(node: ComponentChild, match: (vnode: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ComponentChild, match, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const vnode = node as Node;
  if (match(vnode)) out.push(vnode);
  return findAll(vnode.props["children"] as ComponentChild, match, out);
}

function textOf(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map((child) => textOf(child as ComponentChild)).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return textOf((node as Node).props["children"] as ComponentChild);
}

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "NOAA MRMS", product: "MESH_Max_1440min", file: "2024-05-28.grib2" }],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-05-29T12:00:00Z",
  package_version: "0.1.0",
};

describe("InspectorView out-of-metro guard", () => {
  beforeEach(() => {
    resetPinStore();
  });

  it("disables Pin point and shows Outside 8-county metro for coordinates outside METRO_BBOX", () => {
    const tree = InspectorView({
      pick: {
        lngLat: [-97.7431, 30.2672],
        coveringMm: null,
        nearest: null,
      },
      receipt,
      power: null,
      internet: null,
      step: 0,
      fips: "48201",
      onCounty: () => {},
      onClose: () => {},
    });

    const text = textOf(tree);
    expect(text).toContain("Outside 8-county metro");
    expect(text).not.toContain("Open in Point check");

    const buttons = findAll(tree, (v) => v.type === "button");
    const pinButton = buttons.find((b) => textOf(b).includes("Pin point"));
    expect(pinButton).toBeDefined();
    expect(pinButton!.props["disabled"]).toBe(true);

    (pinButton!.props["onClick"] as () => void)();
    expect(getPinState().pin).toBeNull();
  });
});
