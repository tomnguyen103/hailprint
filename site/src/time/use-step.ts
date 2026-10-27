import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { match } from "../router";
import { useRoute } from "../state/route";
import { replaceStep } from "./slider";
import { resolveStep } from "./step";

/** Safari throws after 100 replaceState calls per 30 s, so a drag writes the path at most 4 times a second. */
export const WRITE_MS = 250;

export interface Writer {
  schedule(next: number): void;
  cancel(): void;
}

/** Hold the newest step for `delayMs`, then write it once. A write that throws never reaches the caller. */
export function createWriter({ write, delayMs }: { write: (step: number) => void; delayMs: number }): Writer {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(next: number): void {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      try {
        write(next);
      } catch {
        // The browser refused the write. The local step still shows; the path catches up on the next move.
      }
    }, delayMs);
  }

  return { schedule, cancel };
}

export interface WritePorts {
  pathname(): string;
  replace(date: string, step: number): void;
}

const PORTS: WritePorts = { pathname: () => window.location.pathname, replace: replaceStep };

/**
 * Write the step into the path while the map tab of `date` shows. Return false and write nothing otherwise.
 * A late write must not rewrite the URL of another tab once the user leaves the map.
 */
export function writeStep(date: string, step: number, ports: WritePorts): boolean {
  const route = match(ports.pathname());
  if (route.kind !== "storms" || route.date !== date || route.tab !== "map") return false;
  ports.replace(date, step);
  return true;
}

export interface Held {
  date: string;
  step: number;
}

/** The step to show. A held move counts only on the storm date it was made on, so a storm switch never shows it. */
export function shownStep(held: Held | null, date: string, routeStep: number): number {
  return held !== null && held.date === date ? held.step : routeStep;
}

export interface StepState {
  /** The step the user moved to and the path does not hold yet. */
  pending: number | null;
  /** The step the hook wrote to the path, until the route change that carries it arrives. */
  written: number | null;
}

/**
 * The state after the path step changes to `routeStep`.
 * The route change that carries the hook's own write keeps a newer pending move and its timer.
 * Any other change (Back, Forward, a link) wins over a pending move, so `cancel` is true.
 */
export function reconcile(state: StepState, routeStep: number): StepState & { cancel: boolean } {
  if (state.written === routeStep) return { pending: state.pending === routeStep ? null : state.pending, written: null, cancel: false };
  return { pending: null, written: null, cancel: true };
}

/**
 * The map step of the storm date. The path holds it, but a move shows at once and the path write trails by `WRITE_MS`.
 * Back and Forward change the path step, and that change wins over a move that has not been written.
 */
export function useStep(date: string): { step: number; setStep: (next: number) => void } {
  const { route } = useRoute();
  const routeStep = resolveStep(route.kind === "storms" ? route.step : null);
  const [held, setHeld] = useState<Held | null>(null);
  // The effect reads refs: a move can land between a render and its effect, and state would be stale there.
  const pendingRef = useRef<number | null>(null);
  const written = useRef<number | null>(null);
  const hold = useCallback(
    (next: number | null) => {
      pendingRef.current = next;
      setHeld(next === null ? null : { date, step: next });
    },
    [date],
  );
  const writer = useMemo(
    () =>
      createWriter({
        delayMs: WRITE_MS,
        write: (next) => {
          written.current = next;
          if (!writeStep(date, next, PORTS)) {
            written.current = null;
            hold(null);
          }
        },
      }),
    [date, hold],
  );

  useEffect(() => {
    const result = reconcile({ pending: pendingRef.current, written: written.current }, routeStep);
    hold(result.pending);
    written.current = result.written;
    if (result.cancel) writer.cancel();
  }, [routeStep, writer, hold]);
  useEffect(() => writer.cancel, [writer]);

  const setStep = useCallback(
    (next: number) => {
      hold(next);
      writer.schedule(next);
    },
    [writer, hold],
  );
  return { step: shownStep(held, date, routeStep), setStep };
}
