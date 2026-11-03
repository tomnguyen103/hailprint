import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ComponentChild, VNode } from "preact";
import { describe, expect, it } from "vitest";
import { guardLive, guardReports, guardSwath, guardWarnings } from "../data/guard";
import { FORBIDDEN_WORD } from "../method/prose";
import type { LiveData } from "../state/live";
import { LiveViewContent, statusSentence } from "./live-view";

type Node = VNode<Record<string, unknown>>;

function findAll(node: ComponentChild, match: (vnode: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ComponentChild, match, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const vnode = node as Node;
  if (match(vnode)) out.push(vnode);
  if (typeof vnode.type === "function" && vnode.type.name !== "LiveMap") {
    const rendered = (vnode.type as (props: Record<string, unknown>) => ComponentChild)(vnode.props);
    return findAll(rendered, match, out);
  }
  return findAll(vnode.props["children"] as ComponentChild, match, out);
}

function textOf(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map((child) => textOf(child as ComponentChild)).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  const vnode = node as Node;
  if (typeof vnode.type === "function" && vnode.type.name !== "LiveMap") {
    return textOf((vnode.type as (props: Record<string, unknown>) => ComponentChild)(vnode.props));
  }
  return textOf(vnode.props["children"] as ComponentChild);
}

function loadFixture(kind: "hail" | "quiet"): LiveData {
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${kind}/${name}`, import.meta.url)), "utf8"));
  return {
    now: guardLive(read("now.json")),
    swath: guardSwath(read("swath.geojson")),
    reports: guardReports(read("reports.geojson")),
    warnings: guardWarnings(read("warnings.geojson")),
    notes: [],
  };
}

describe("LiveViewContent", () => {
  it("renders title, fresh chip, hail status sentence, five stats, map props, and five source rows (US-03.1)", () => {
    const data = loadFixture("hail");
    const tree = LiveViewContent({
      data,
      newest: "2024-05-28",
      now: new Date("2024-05-29T12:20:00Z"),
    });
    const text = textOf(tree);

    expect(findAll(tree, (v) => v.type === "h1").map(textOf)).toEqual(["Live \u00b7 Harris County"]);
    const chip = findAll(tree, (v) => v.props["data-freshness"] !== undefined)[0]!;
    expect(chip.props["data-freshness"]).toBe("fresh");
    expect(textOf(chip)).toContain("fresh");
    expect(textOf(chip)).toContain("6 min ago");

    expect(statusSentence(data.now)).toBe(
      "Radar-estimated hail at or above 2.00 in (hen egg) fell over Harris County in the last 24 h.",
    );
    expect(text).toContain(
      "Radar-estimated hail at or above 2.00 in (hen egg) fell over Harris County in the last 24 h.",
    );

    expect(text).toContain("2.08 in");
    expect(text).toContain("10");
    expect(text).toContain("0 / 5");
    expect(text).toContain("735");
    expect(text).toContain("CenterPoint customers only");
    expect(text).toContain("Harris");
    expect(text).toContain("714 (0.0%)");
    expect(text).toContain("Brazoria");
    expect(text).toContain("13 (0.0%)");

    const mapNode = findAll(tree, (v) => typeof v.type === "function" && v.type.name === "LiveMap")[0]!;
    expect(mapNode.props).toEqual({
      swath: data.swath,
      reports: data.reports,
      warnings: data.warnings,
    });

    const sourceRows = findAll(tree, (v) => v.type === "tr");
    expect(sourceRows).toHaveLength(6); // 1 header + 5 sources
    expect(text).toContain("MESH_Max_1440min_00.50");
    expect(text).toContain("MESH_Max_60min_00.50");
    expect(text).toContain("preliminary hail reports");
    expect(text).toContain("odin-real-time-outages-county");
  });

  it("renders the quiet sentence, newest storm link, and em-dash unavailable stats when quiet and optional fields are null (US-03.2, US-04.3)", () => {
    const base = loadFixture("quiet");
    const data: LiveData = {
      ...base,
      now: { ...base.now, last_hour: null, power: null },
    };
    const tree = LiveViewContent({
      data,
      newest: "2026-08-28",
      now: new Date("2026-11-03T14:15:00Z"),
    });
    const text = textOf(tree);

    expect(statusSentence(data.now)).toBe(
      "No radar-estimated hail at or above 0.75 in over Harris County in the last 24 h.",
    );
    expect(text).toContain("No radar-estimated hail at or above 0.75 in over Harris County in the last 24 h.");

    const stormLinks = findAll(tree, (v) => v.type === "a" && v.props["href"] === "/storms/2026-08-28/map");
    expect(stormLinks).toHaveLength(1);
    expect(textOf(stormLinks[0])).toContain("2026-08-28");

    const stats = findAll(tree, (v) => v.props["class"] === "live-stat");
    expect(stats).toHaveLength(5);
    expect(textOf(stats[1])).toContain("\u2014");
    expect(textOf(stats[1])).toContain("unavailable");
    expect(textOf(stats[4])).toContain("\u2014");
    expect(textOf(stats[4])).toContain("unavailable");

    const withoutNewest = LiveViewContent({
      data,
      newest: null,
      now: new Date("2026-11-03T14:15:00Z"),
    });
    expect(findAll(withoutNewest, (v) => typeof v.props["href"] === "string")).toHaveLength(0);
  });

  it("shows layer notes and source failure messages without hiding the page (US-03.3)", () => {
    const base = loadFixture("quiet");
    const data: LiveData = {
      ...base,
      warnings: null,
      notes: ["warnings.geojson: receipt is not an object"],
      now: {
        ...base.now,
        sources: base.now.sources.map((s, i) => (i === 4 ? { ...s, ok: false, message: "HTTP 503" } : s)),
      },
    };
    const tree = LiveViewContent({
      data,
      newest: "2026-08-28",
      now: new Date("2026-11-03T14:15:00Z"),
    });
    const text = textOf(tree);

    expect(text).toContain("warnings.geojson: receipt is not an object");
    expect(text).toContain("HTTP 503");
  });

  it("marks the freshness chip aging at 20-59 min and stale at 60 min or more while keeping data visible (US-03.5)", () => {
    const data = loadFixture("quiet");
    const agingTree = LiveViewContent({
      data,
      newest: "2026-08-28",
      now: new Date("2026-11-03T14:44:57Z"),
    });
    const agingChip = findAll(agingTree, (v) => v.props["data-freshness"] !== undefined)[0]!;
    expect(agingChip.props["data-freshness"]).toBe("aging");
    expect(textOf(agingChip)).toContain("aging");
    expect(textOf(agingChip)).toContain("35 min ago");

    const staleTree = LiveViewContent({
      data,
      newest: "2026-08-28",
      now: new Date("2026-11-03T15:39:57Z"),
    });
    const staleChip = findAll(staleTree, (v) => v.props["data-freshness"] !== undefined)[0]!;
    expect(staleChip.props["data-freshness"]).toBe("stale");
    expect(textOf(staleChip)).toContain("stale");
    expect(textOf(staleChip)).toContain("90 min ago");
    expect(textOf(staleTree)).toContain("1,572");
  });

  it("never uses the forbidden word or causal outage phrases", () => {
    const banned = [
      FORBIDDEN_WORD,
      ...[["internet", "down"], ["caused", "by", "hail"], ["because", "of", "hail"]].map((w) => w.join(" ")),
    ];
    for (const kind of ["hail", "quiet"] as const) {
      const text = textOf(
        LiveViewContent({
          data: loadFixture(kind),
          newest: "2024-05-28",
          now: new Date("2026-11-03T14:15:00Z"),
        }),
      ).toLowerCase();
      for (const phrase of banned) {
        expect(text).not.toContain(phrase);
      }
    }
  });
});
