import { useEffect, useRef, useState } from "preact/hooks";
import { STALE, fetchJson, latest } from "../data/fetch";
import { guardIndex } from "../data/guard";
import type { StormsIndex } from "../data/types";
import { type Load, useLoad } from "./load";

const INDEX_FILE = "storms.json";
export const REFRESH_MS = 3_600_000;

/**
 * Load one resource with `useLoad` and refresh it in the background on `refreshMs`
 * while the tab is visible and whenever the tab returns to visible.
 * A failed background refresh keeps the last good data untouched and advances `now`.
 */
export function usePolledLoad<T>(
  key: string,
  start: () => Promise<T>,
  refreshMs: number,
  runTimeOf: (data: T) => string,
): Load<T> & { showLoading: boolean; retry: () => void; now: Date } {
  const initial = useLoad<T>(key, start);
  const [fresh, setFresh] = useState<T | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const runRefresh = useRef(latest<T>());

  useEffect(() => {
    const data = initial.data;
    if (!data) return;
    setNow(new Date());
    setFresh((prev) => {
      if (prev === null) return null;
      return runTimeOf(data) >= runTimeOf(prev) ? null : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.data]);

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof window === "undefined" ||
      typeof document.addEventListener !== "function" ||
      typeof window.setInterval !== "function"
    ) {
      return;
    }
    let live = true;
    const isVisible = () => (document.visibilityState ?? "visible") === "visible";
    const refresh = () => {
      if (!live || !isVisible()) return;
      runRefresh
        .current(start)
        .then((next) => {
          if (!live) return;
          setNow(new Date());
          if (next !== STALE) {
            setFresh((prev) => (prev === null || runTimeOf(next) >= runTimeOf(prev) ? next : prev));
          }
        })
        .catch(() => {
          // Keep existing ready data when a background refresh fails, and advance the clock.
          if (live) setNow(new Date());
        });
    };
    let timer = window.setInterval(refresh, refreshMs);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (isVisible()) {
        refresh();
        timer = window.setInterval(refresh, refreshMs);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs]);

  if (initial.status === "ready") {
    const chosen =
      fresh !== null && runTimeOf(fresh) >= runTimeOf(initial.data) ? fresh : initial.data;
    return { ...initial, data: chosen, now };
  }
  if (fresh !== null) {
    return { status: "ready", data: fresh, showLoading: false, retry: initial.retry, now };
  }
  return { ...initial, now };
}

/**
 * The storm index, loaded on mount and refreshed in the background when the tab
 * becomes visible or every hour while visible. A failed background refresh keeps
 * the existing ready index untouched.
 */
export function useIndex(): Load<StormsIndex> & { showLoading: boolean; retry: () => void; now: Date } {
  return usePolledLoad<StormsIndex>(
    INDEX_FILE,
    () => fetchJson(INDEX_FILE, guardIndex),
    REFRESH_MS,
    (d) => d.run_time,
  );
}
