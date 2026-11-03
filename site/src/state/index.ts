import { useCallback, useEffect, useRef, useState } from "preact/hooks";
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
  merge?: (prev: T, next: T) => T,
): Load<T> & { showLoading: boolean; retry: () => void; now: Date } {
  const initial = useLoad<T>(key, start);
  const [fresh, setFresh] = useState<{ key: string; data: T } | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const runRefresh = useRef(latest<T>());
  const initialRef = useRef<{ key: string; data: T | undefined }>({ key, data: initial.data });
  initialRef.current = { key, data: initial.data };
  const currentRef = useRef({ key, start, runTimeOf, merge });
  currentRef.current = { key, start, runTimeOf, merge };

  useEffect(() => {
    const data = initial.data;
    if (!data) return;
    setNow(new Date());
    setFresh((prev) => {
      if (prev === null || prev.key !== key) return null;
      return currentRef.current.runTimeOf(data) >= currentRef.current.runTimeOf(prev.data) ? null : prev;
    });
  }, [initial.data, key]);

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
      const { key: curKey, start: curStart, runTimeOf: curRunTimeOf, merge: curMerge } = currentRef.current;
      runRefresh
        .current(curStart)
        .then((next) => {
          if (!live) return;
          setNow(new Date());
          if (next !== STALE) {
            setFresh((prev) => {
              const prevData = prev !== null && prev.key === curKey ? prev.data : null;
              const initData =
                initialRef.current.key === curKey ? (initialRef.current.data ?? null) : null;
              const base = prevData ?? initData;
              if (base !== null && curRunTimeOf(next) < curRunTimeOf(base)) return prev;
              return {
                key: curKey,
                data: base !== null && curMerge ? curMerge(base, next) : next,
              };
            });
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
  }, [key, refreshMs]);

  const retry = useCallback(() => {
    setFresh(null);
    initial.retry();
  }, [initial]);

  const freshData = fresh !== null && fresh.key === key ? fresh.data : null;
  if (initial.status === "ready") {
    const chosen =
      freshData !== null && runTimeOf(freshData) >= runTimeOf(initial.data)
        ? freshData
        : initial.data;
    return { ...initial, data: chosen, retry, now };
  }
  if (freshData !== null) {
    return { status: "ready", data: freshData, showLoading: false, retry, now };
  }
  return { ...initial, retry, now };
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
