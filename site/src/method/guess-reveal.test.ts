import type { VNode } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { StormsIndex } from "../data/types";
import * as pairsAll from "../state/pairs-all";

let revealedState = false;

vi.mock("preact/hooks", async () => {
  const actual = await vi.importActual<typeof import("preact/hooks")>("preact/hooks");
  return {
    ...actual,
    useId: () => "guess-id",
    useMemo: (fn: () => unknown) => fn(),
    useState: (init: unknown) => {
      if (typeof init === "boolean") {
        return [
          revealedState,
          (next: boolean | ((prev: boolean) => boolean)) => {
            revealedState = typeof next === "function" ? next(revealedState) : next;
          },
        ];
      }
      return [init, () => {}];
    },
  };
});

import { difference, GuessReveal } from "./guess-reveal";

function findNodes(node: unknown, pred: (v: VNode<Record<string, unknown>>) => boolean): VNode<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findNodes(n, pred));
  const v = node as VNode<Record<string, unknown>>;
  const self = pred(v) ? [v] : [];
  return [...self, ...findNodes(v.props?.["children"], pred)];
}

afterEach(() => {
  revealedState = false;
  vi.restoreAllMocks();
});

it("signs the difference between the guess and the actual, en dash when the actual is null", () => {
  expect(difference(0.5, 0.38)).toBe("+0.12");
  expect(difference(0.33, 0.38)).toBe("-0.05");
  expect(difference(0.38, 0.38)).toBe("+0.00");
  expect(difference(0.5, null)).toBe("–");
});

it("defers usePairsAll until Reveal is clicked", () => {
  const spy = vi.spyOn(pairsAll, "usePairsAll").mockReturnValue({
    status: "loading",
    data: undefined,
    error: undefined,
    showLoading: false,
    retry: () => {},
  });
  const index: StormsIndex = {
    confidence: "radar-estimated hail size",
    run_time: "2026-10-30T21:15:20Z",
    package_version: "0.1.0",
    radius_km_default: 5,
    storms: [],
  };

  const initial = GuessReveal({ index });
  expect(spy).not.toHaveBeenCalled();

  const btn = findNodes(initial, (v) => v.type === "button" && v.props?.["aria-expanded"] !== undefined)[0]!;
  (btn.props["onClick"] as () => void)();
  expect(revealedState).toBe(true);

  const afterReveal = GuessReveal({ index });
  const resultNode = findNodes(afterReveal, (v) => typeof v.type === "function" && v.type.name === "GuessResult")[0]!;
  expect(resultNode).toBeDefined();
  (resultNode.type as (props: Record<string, unknown>) => unknown)(resultNode.props);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith(index);
});
