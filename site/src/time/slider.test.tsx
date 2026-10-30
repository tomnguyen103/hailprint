import type { ComponentChild, VNode } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SliderView, clampStep, createPlayer, keyStep, replaceStep } from "./slider";
import { readout } from "./step";

type Node = VNode<Record<string, unknown>>;
type KeyEvent = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault(): void };
type InputEvent = { currentTarget: { valueAsNumber: number } };

function find(node: ComponentChild, match: (vnode: Node) => boolean): Node | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child as ComponentChild, match);
      if (hit) return hit;
    }
    return null;
  }
  if (node === null || typeof node !== "object") return null;
  const vnode = node as Node;
  if (match(vnode)) return vnode;
  return find(vnode.props["children"] as ComponentChild, match);
}

function textOf(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map((child) => textOf(child as ComponentChild)).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return textOf((node as Node).props["children"] as ComponentChild);
}

/** The view with recording callbacks. `steps` holds every step the view reports; `stops` counts drags. */
function view(date: string, step: number) {
  const out = { steps: [] as number[], stops: 0, plays: 0 };
  const tree = SliderView({
    date,
    step,
    playLabel: "Play",
    onStep: (next) => out.steps.push(next),
    onStop: () => void out.stops++,
    onPlay: () => void out.plays++,
  });
  const range = find(tree, (v) => v.type === "input");
  if (!range) throw new Error("no input in the view");
  const press = (key: string, extra: Partial<KeyEvent> = {}) =>
    (range.props["onKeyDown"] as (e: KeyEvent) => void)({ key, preventDefault() {}, ...extra });
  const input = (valueAsNumber: number) => (range.props["onInput"] as (e: InputEvent) => void)({ currentTarget: { valueAsNumber } });
  return { out, tree, range, press, input };
}

describe("the range input", () => {
  it("spans the 192 steps and carries the readout as aria-valuetext", () => {
    const { range } = view("2024-05-28", 48);
    expect(range.props).toMatchObject({ type: "range", min: 0, max: 191, step: 1, value: 48 });
    expect(range.props["aria-valuetext"]).toBe("00:00 UTC Wed 29 May · 19:00 CDT Tue 28 May");
  });

  it("shows the same UTC and Houston times, each with its own date, as text", () => {
    const { tree } = view("2024-05-28", 49);
    const { utc, local } = readout("2024-05-28", 49);
    expect(textOf(tree)).toContain(utc);
    expect(textOf(tree)).toContain(local);
    expect(utc).toBe("00:15 UTC Wed 29 May");
    expect(local).toBe("19:15 CDT Tue 28 May");
  });

  it("names CST in winter", () => {
    expect(textOf(view("2024-01-15", 0).tree)).toContain("06:00 CST Mon 15 Jan");
  });

  it.each([
    ["ArrowRight", 49],
    ["ArrowUp", 49],
    ["ArrowLeft", 47],
    ["ArrowDown", 47],
    ["PageUp", 52],
    ["PageDown", 44],
    ["Home", 0],
    ["End", 191],
  ])("%s at step 48 reports step %i", (key, expected) => {
    const { out, press } = view("2024-05-28", 48);
    press(key);
    expect(out.steps).toEqual([expected]);
  });

  it("clamps a key move at both ends of the window", () => {
    expect(keyStep("ArrowRight", 191)).toBe(191);
    expect(keyStep("PageUp", 189)).toBe(191);
    expect(keyStep("ArrowLeft", 0)).toBe(0);
    expect(keyStep("PageDown", 2)).toBe(0);
  });

  it.each(["a", "Enter", "Tab", "constructor"])("ignores the key %j", (key) => {
    const { out, press } = view("2024-05-28", 48);
    press(key);
    expect(out.steps).toEqual([]);
  });

  it("leaves Alt+Arrow to the browser", () => {
    const { out, press } = view("2024-05-28", 48);
    press("ArrowLeft", { altKey: true });
    expect(out.steps).toEqual([]);
  });

  it("clamps 192 and -3 and ignores NaN from the input event", () => {
    const { out, input } = view("2024-05-28", 48);
    input(192);
    input(-3);
    input(Number.NaN);
    expect(out.steps).toEqual([191, 0]);
    expect(clampStep(192)).toBe(191);
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(Number.NaN)).toBeNull();
  });

  it("stops play on a drag and on a key press", () => {
    const { out, input, press } = view("2024-05-28", 48);
    input(60);
    press("ArrowRight");
    expect(out.stops).toBe(2);
  });

  it("hands the play button its handler and label", () => {
    const { out, tree } = view("2024-05-28", 48);
    const button = find(tree, (v) => v.type === "button");
    expect(textOf(button)).toBe("Play");
    (button?.props["onClick"] as () => void)();
    expect(out.plays).toBe(1);
  });
});

describe("the player", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function rig(start: number, reduced = false) {
    const state = { step: start, playing: false, moves: [] as number[] };
    const player = createPlayer({
      step: () => state.step,
      move: (next) => {
        state.step = next;
        state.moves.push(next);
      },
      playing: (on) => {
        state.playing = on;
      },
      reduced: () => reduced,
    });
    return { state, player };
  }

  it("never starts on its own and advances one hour every 400 ms", () => {
    const { state, player } = rig(40);
    vi.advanceTimersByTime(2000);
    expect(state.moves).toEqual([]);
    player.toggle();
    expect(state.playing).toBe(true);
    vi.advanceTimersByTime(399);
    expect(state.moves).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(state.moves).toEqual([44]);
    vi.advanceTimersByTime(800);
    expect(state.moves).toEqual([44, 48, 52]);
  });

  it("stops on a second press", () => {
    const { state, player } = rig(40);
    player.toggle();
    player.toggle();
    expect(state.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(state.moves).toEqual([]);
  });

  it("keeps one timer through repeated presses", () => {
    const { player } = rig(40);
    player.toggle();
    player.toggle();
    player.toggle();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops on a drag", () => {
    const { state, player } = rig(40);
    player.toggle();
    player.stop();
    expect(state.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at step 191", () => {
    const { state, player } = rig(185);
    player.toggle();
    vi.advanceTimersByTime(400 * 5);
    expect(state.moves).toEqual([189, 191]);
    expect(state.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts at step 0 when pressed on the last step", () => {
    const { state, player } = rig(191);
    player.toggle();
    expect(state.moves).toEqual([0]);
    vi.advanceTimersByTime(400);
    expect(state.moves).toEqual([0, 4]);
  });

  it("advances one hour on each press, with no timer, under reduced motion", () => {
    const { state, player } = rig(48, true);
    player.toggle();
    player.toggle();
    expect(state.moves).toEqual([52, 56]);
    expect(state.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("wraps to step 0 from the last step under reduced motion", () => {
    const { state, player } = rig(191, true);
    player.toggle();
    expect(state.moves).toEqual([0]);
  });

  it("clears its timer on stop, as the pane does on unmount", () => {
    const { state, player } = rig(40);
    player.toggle();
    player.stop();
    vi.advanceTimersByTime(4000);
    expect(state.moves).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("advances by 1 step (15m) when stride returns 1", () => {
    const state = { step: 40, playing: false, moves: [] as number[] };
    const player = createPlayer({
      step: () => state.step,
      move: (next) => {
        state.step = next;
        state.moves.push(next);
      },
      playing: (on) => {
        state.playing = on;
      },
      reduced: () => false,
      stride: () => 1,
    });
    player.toggle();
    vi.advanceTimersByTime(400);
    expect(state.moves).toEqual([41]);
    player.stop();
  });
});

describe("eventJumpChips", () => {
  it("derives First warning, First report, Peak power out, and Internet trough jump chips", async () => {
    const { eventJumpChips } = await import("./slider");
    const chips = eventJumpChips({
      date: "2024-05-28",
      warnings: {
        type: "FeatureCollection",
        receipt: {} as never,
        features: [
          {
            type: "Feature",
            properties: {
              phenomena: "SV",
              eventid: 1,
              polygon_begin: "2024-05-28T23:30:00Z",
              polygon_end: "2024-05-29T00:15:00Z",
              hailtag: 1.5,
              windtag: 60,
            },
            geometry: { type: "MultiPolygon", coordinates: [] },
          },
        ],
      },
      reports: {
        type: "FeatureCollection",
        receipt: {} as never,
        features: [
          {
            type: "Feature",
            properties: { id: 0, time: "2345", location: "HOUSTON", county: "HARRIS", state: "TX", size_in: 1.0 },
            geometry: { type: "Point", coordinates: [-95.36, 29.76] },
          },
        ],
      },
      power: {
        receipt: {} as never,
        window: { start_utc: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
        source: "eaglei",
        utilities: null,
        counties: [{ fips: "48201", name: "Harris", customers: 1000, out: [0, 50, 200] }],
      },
      internet: {
        receipt: {} as never,
        window: { start_utc: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
        signal: "ping-slash24",
        baseline_days: 7,
        counties: [{ fips: "48201", name: "Harris", baseline: 100, ratio: [1.0, 0.95, 0.72] }],
      },
      fips: "48201",
    });
    expect(chips).toEqual([
      { id: "warning", label: "First warning", step: 46 },
      { id: "report", label: "First report", step: 47 },
      { id: "power", label: "Peak power out", step: 2 },
      { id: "internet", label: "Internet trough", step: 2 },
    ]);
  });
});

describe("replaceStep", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the history length through 50 moves and ends on the last step", () => {
    const win = {
      location: { pathname: "/storms/2024-05-28/map/48" },
      history: {
        length: 3,
        pushState() {
          win.history.length++;
        },
        replaceState(_state: unknown, _title: string, url: string) {
          win.location.pathname = url;
        },
      },
      dispatchEvent: () => true,
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("PopStateEvent", class extends Event {});
    for (let step = 0; step < 50; step++) replaceStep("2024-05-28", step);
    expect(win.history.length).toBe(3);
    expect(win.location.pathname).toBe("/storms/2024-05-28/map/49");
  });
});
