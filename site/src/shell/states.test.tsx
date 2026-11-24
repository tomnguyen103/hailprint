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
  const frag = LoadingState({ file: "pairs.json" }) as VNode<Props>;
  const [status, root] = frag.props.children as VNode<Props>[];
  const all = walk(root!);

  it("marks the region busy", () => {
    expect(root!.props["aria-busy"]).toBe("true");
  });

  it("holds hidden skeleton blocks", () => {
    const blocks = all.filter((n) => String(n.props["class"]).includes("skeleton-block"));
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.props["aria-hidden"] === "true")).toBe(true);
  });

  it("names the file in a visually hidden status outside the busy region", () => {
    expect(status!.props["role"]).toBe("status");
    expect(String(status!.props["class"])).toContain("visually-hidden");
    expect(text(status!.props.children)).toBe("Load pairs.json…");
    expect(walk(root!)).not.toContain(status);
  });
});

describe("LoadingState shape (US-04.2)", () => {
  const busy = (props: { file: string; shape?: "table" | "stats" | "map" | "text" }) =>
    ((LoadingState(props) as VNode<Props>).props.children as VNode<Props>[])[1]!;

  it("defaults to the table shape", () => {
    expect(busy({ file: "a.json" }).props["class"]).toContain("skeleton-table");
  });

  it.each(["table", "stats", "map", "text"] as const)("marks the %s shape with its class", (shape) => {
    const root = busy({ file: "a.json", shape });
    expect(root.props["class"]).toContain(`skeleton-${shape}`);
    expect(root.props["aria-busy"]).toBe("true");
  });
});
