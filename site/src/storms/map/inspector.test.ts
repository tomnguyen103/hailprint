import type { ComponentChild, VNode } from "preact";
import { beforeEach, describe, expect, it } from "vitest";
import type { Receipt, ReportsFile, WarningsFile } from "../../data/types";
import { getPinState, resetPinStore } from "../../state/pin";
import { InspectorView, WarningsSection } from "./inspector";

type Node = VNode<Record<string, unknown>>;

function findAll(node: ComponentChild, match: (vnode: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ComponentChild, match, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const vnode = node as Node;
  if (match(vnode)) out.push(vnode);
  if ((vnode.type as unknown) === WarningsSection) {
    return findAll((vnode.type as (p: Record<string, unknown>) => ComponentChild)(vnode.props), match, out);
  }
  return findAll(vnode.props["children"] as ComponentChild, match, out);
}

function textOf(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map((child) => textOf(child as ComponentChild)).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  const vnode = node as Node;
  if ((vnode.type as unknown) === WarningsSection) {
    return textOf((vnode.type as (p: Record<string, unknown>) => ComponentChild)(vnode.props));
  }
  return textOf(vnode.props["children"] as ComponentChild);
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

  it("renders 5 km report count, nearby warnings within 5 km, and live status check section when inMetro is true (CR-05.2)", () => {
    const reports: ReportsFile = {
      type: "FeatureCollection",
      receipt,
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-95.3698, 29.7604] },
          properties: {
            id: 1,
            time: "2335",
            location: "Downtown",
            county: "Harris",
            state: "TX",
            size_in: 1.5,
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-95.38, 29.7604] },
          properties: {
            id: 2,
            time: "2340",
            location: "Midtown",
            county: "Harris",
            state: "TX",
            size_in: 1.25,
          },
        },
      ],
    };
    const warnings: WarningsFile = {
      type: "FeatureCollection",
      receipt,
      features: [
        {
          type: "Feature",
          properties: {
            phenomena: "SV",
            significance: "W",
            event_label: "Severe Thunderstorm Warning",
            eventid: 19,
            polygon_begin: "2024-05-28T23:30:00Z",
            polygon_end: "2024-05-29T00:15:00Z",
            product_id: "HGX-SV-19",
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [-95.36, 29.75],
                  [-95.3, 29.75],
                  [-95.3, 29.8],
                  [-95.36, 29.8],
                  [-95.36, 29.75],
                ],
              ],
            ],
          },
        },
      ],
    };

    let liveChecked = 0;
    const tree = InspectorView({
      pick: {
        lngLat: [-95.3698, 29.7604],
        coveringMm: null,
        nearest: {
          feature: reports.features[0]!,
          km: 0,
        },
      },
      receipt,
      reports,
      warnings,
      power: null,
      internet: null,
      step: 46,
      fips: "48201",
      onCounty: () => {},
      onClose: () => {},
      liveStatus: "ready",
      liveData: {
        checkedAtUtc: "2024-05-29T00:00:00Z",
        point: [-95.3698, 29.7604],
        fips: "48201",
        alerts: { status: "ready", alerts: [] },
        power: { status: "ready", fips: "48201", customersOut: 140, utilities: ["CenterPoint"], note: "CenterPoint customers only" },
        internet: { status: "error", message: "ioda: HTTP 503" },
      },
      onLiveCheck: () => {
        liveChecked += 1;
      },
    });

    const text = textOf(tree);
    expect(text).toContain("within 5 km");
    expect(text).toContain("Within 5 km");
    expect(text).toContain("Live status check");
    expect(text).toContain("0 active alerts at pinned point");
    expect(text).toContain("ioda: HTTP 503");

    const retryButtons = findAll(tree, (v) => v.type === "button" && textOf(v).includes("Retry"));
    expect(retryButtons).toHaveLength(1);
    (retryButtons[0]!.props["onClick"] as () => void)();
    expect(liveChecked).toBe(1);
  });
});
