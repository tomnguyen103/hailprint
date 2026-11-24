import type { VNode } from "preact";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./states";

type Props = Record<string, unknown> & { children?: unknown };

function walk(node: unknown, out: VNode<Props>[] = []): VNode<Props>[] {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === "object" && "props" in node) {
    const v = node as VNode<Props>;
    out.push(v);
    walk(v.props.children, out);
  }
  return out;
}

const text = (node: unknown): string =>
  Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : "";

describe("LoadingState (US-04.1, US-04.2)", () => {
  const root = LoadingState({ file: "pairs.json" }) as VNode<Props>;
  const all = walk(root);

  it("marks the region busy", () => {
    expect(root.props["aria-busy"]).toBe("true");
  });

  it("holds hidden skeleton blocks", () => {
    const blocks = all.filter((n) => String(n.props["class"]).includes("skeleton-block"));
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.props["aria-hidden"] === "true")).toBe(true);
  });

  it("names the file in visually hidden live text", () => {
    const live = all.find((n) => n.props["aria-live"] === "polite");
    expect(String(live?.props["class"])).toContain("visually-hidden");
    expect(text(live?.props.children)).toBe("Load pairs.json…");
  });
});

describe("LoadingState shape (US-04.2)", () => {
  it("defaults to the table shape", () => {
    expect((LoadingState({ file: "a.json" }) as VNode<Props>).props["class"]).toContain("skeleton-table");
  });

  it.each(["table", "stats", "map", "text"] as const)("marks the %s shape with its class", (shape) => {
    const root = LoadingState({ file: "a.json", shape }) as VNode<Props>;
    expect(root.props["class"]).toContain(`skeleton-${shape}`);
    expect(root.props["aria-busy"]).toBe("true");
  });
});
