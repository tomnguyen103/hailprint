import type { VNode } from "preact";
import { describe, expect, it } from "vitest";
import { Breadcrumb } from "./breadcrumb";

interface Item {
  text: string;
  href: string | undefined;
  current: boolean;
  mono: boolean;
}

function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text((node as VNode<{ children?: unknown }>).props?.children);
}

function items(path: string): Item[] | null {
  const nav = Breadcrumb({ routePath: path }) as VNode<{ children?: unknown; "aria-label"?: string }> | null;
  if (nav === null) return null;
  expect(nav.type).toBe("nav");
  expect(nav.props["aria-label"]).toBe("Breadcrumb");
  const ol = nav.props.children as VNode<{ children?: unknown }>;
  expect(ol.type).toBe("ol");
  const lis = ([] as VNode<{ children?: unknown }>[]).concat(ol.props.children as never);
  return lis.map((li) => {
    const inner = li.props.children as VNode<{ href?: string; class?: string; "aria-current"?: string }>;
    return {
      text: text(inner),
      href: inner.props.href,
      current: inner.props["aria-current"] === "page",
      mono: (inner.props.class ?? "").includes("mono"),
    };
  });
}

describe("Breadcrumb (US-02.1, US-02.2)", () => {
  it("shows area, storm date, and page on a storm route", () => {
    const got = items("/storms/2024-05-28/score")!;
    expect(got.map((i) => i.text)).toEqual(["Storms", "2024-05-28", "Score"]);
    expect(got[0]).toMatchObject({ href: "/storms", current: false });
    expect(got[1]).toMatchObject({ href: "/storms/2024-05-28/map", current: false, mono: true });
    expect(got[2]).toMatchObject({ href: undefined, current: true });
  });

  it("wraps each link text in a crumb-label span", () => {
    const nav = Breadcrumb({ routePath: "/storms/2024-05-28/score" }) as VNode<{ children?: unknown }>;
    const ol = nav.props.children as VNode<{ children?: unknown }>;
    const lis = ([] as VNode<{ children?: unknown }>[]).concat(ol.props.children as never);
    const link = lis[0]!.props.children as VNode<{ children?: unknown }>;
    const label = link.props.children as VNode<{ class?: string }>;
    expect(label.type).toBe("span");
    expect(label.props.class).toBe("crumb-label");
  });

  it("shows one current item on /live", () => {
    const got = items("/live")!;
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ text: "Live", href: undefined, current: true });
  });

  it("shows area and view on a scorecard route", () => {
    expect(items("/scorecard/curve")!.map((i) => i.text)).toEqual(["Scorecard", "Curve"]);
  });

  it("shows area and tool on a try route", () => {
    expect(items("/try/point")!.map((i) => i.text)).toEqual(["Try it", "Point"]);
  });

  it("shows area and page on a method route", () => {
    const got = items("/method/storm-date")!;
    expect(got.map((i) => i.text)).toEqual(["Method", "Storm date"]);
    expect(got[0]!.href).toBe("/method");
  });

  it("shows area and view on a pipeline route", () => {
    expect(items("/pipeline/archive")!.map((i) => i.text)).toEqual(["Pipeline", "Archive"]);
  });

  it("renders nothing for an unknown or redirect route", () => {
    expect(items("/nope")).toBeNull();
    expect(items("/")).toBeNull();
    expect(items("/storms")).toBeNull();
  });
});
