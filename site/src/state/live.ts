import { useEffect, useRef, useState } from "preact/hooks";
import { STALE, fetchJson, latest } from "../data/fetch";
import { guardLive, guardReports, guardSwath, guardWarnings } from "../data/guard";
import type { LiveFile, ReportsFile, SwathFile, WarningsFile } from "../data/types";
import { type Load, useLoad } from "./load";

const LIVE_FILE = "live/now.json";
export const LIVE_REFRESH_MS = 120_000;

export interface LiveData {
  now: LiveFile;
  swath: SwathFile | null;
  reports: ReportsFile | null;
  warnings: WarningsFile | null;
  notes: string[];
}

async function loadLayer<T>(
  path: string,
  guard: (value: unknown) => T,
): Promise<{ data: T | null; note: string | null }> {
  try {
    return { data: await fetchJson(path, guard), note: null };
  } catch (error) {
    return { data: null, note: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadLive(): Promise<LiveData> {
  const now = await fetchJson(LIVE_FILE, guardLive);
  const [swath, reports, warnings] = await Promise.all([
    loadLayer(`live/${now.files.swath}`, guardSwath),
    loadLayer(`live/${now.files.reports}`, guardReports),
    loadLayer(`live/${now.files.warnings}`, guardWarnings),
  ]);
  const notes = [swath.note, reports.note, warnings.note].filter((n): n is string => n !== null);
  return { now, swath: swath.data, reports: reports.data, warnings: warnings.data, notes };
}

/**
 * The live view data (`live/now.json` and the three layer files it names), loaded on mount
 * and refreshed every 2 minutes while the tab is visible or when the tab returns to visible.
 * A failed background refresh keeps the last good data untouched.
 */
export function useLive(): Load<LiveData> & { showLoading: boolean; retry: () => void } {
  const initial = useLoad<LiveData>(LIVE_FILE, loadLive);
  const [fresh, setFresh] = useState<LiveData | null>(null);
  const runRefresh = useRef(latest<LiveData>());

  useEffect(() => {
    if (!initial.data) return;
    setFresh((prev) => {
      if (prev === null) return null;
      return initial.data.now.run_time >= prev.now.run_time ? null : prev;
    });
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
        .current(loadLive)
        .then((next) => {
          if (live && next !== STALE) {
            setFresh((prev) => (prev === null || next.now.run_time >= prev.now.run_time ? next : prev));
          }
        })
        .catch(() => {
          // Keep existing ready data when a background refresh fails.
        });
    };
    let timer = window.setInterval(refresh, LIVE_REFRESH_MS);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (isVisible()) {
        refresh();
        timer = window.setInterval(refresh, LIVE_REFRESH_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (initial.status === "ready") {
    const chosen =
      fresh !== null && fresh.now.run_time >= initial.data.now.run_time ? fresh : initial.data;
    return { ...initial, data: chosen };
  }
  if (fresh !== null) {
    return { status: "ready", data: fresh, showLoading: false, retry: initial.retry };
  }
  return initial;
}
