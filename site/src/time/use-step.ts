import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
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

/**
 * The map step of the storm date. The path holds it, but a move shows at once and the path write trails by `WRITE_MS`.
 * Back and Forward change the path step, and that change wins over a move that has not been written.
 */
export function useStep(date: string): { step: number; setStep: (next: number) => void } {
  const { route } = useRoute();
  const routeStep = resolveStep(route.kind === "storms" ? route.step : null);
  const [pending, setPending] = useState<number | null>(null);
  const writer = useMemo(
    () =>
      createWriter({
        delayMs: WRITE_MS,
        write: (next) => {
          // A late write must not rewrite the URL of another tab once the user leaves the map.
          if (window.location.pathname.startsWith(`/storms/${date}/map`)) replaceStep(date, next);
          else setPending(null);
        },
      }),
    [date],
  );

  useEffect(() => {
    setPending(null);
    writer.cancel();
  }, [routeStep, writer]);
  useEffect(() => writer.cancel, [writer]);

  const setStep = useCallback(
    (next: number) => {
      setPending(next);
      writer.schedule(next);
    },
    [writer],
  );
  return { step: pending ?? routeStep, setStep };
}
