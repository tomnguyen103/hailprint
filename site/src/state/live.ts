import { fetchJson } from "../data/fetch";
import { guardLive, guardReports, guardSwath, guardWarnings } from "../data/guard";
import type { LiveFile, ReportsFile, SwathFile, WarningsFile } from "../data/types";
import { usePolledLoad } from "./index";
import type { Load } from "./load";

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

function mergeLive(prev: LiveData, next: LiveData): LiveData {
  return {
    now: next.now,
    swath: next.swath ?? prev.swath,
    reports: next.reports ?? prev.reports,
    warnings: next.warnings ?? prev.warnings,
    notes: next.notes,
  };
}

/**
 * The live view data (`live/now.json` and the three layer files it names), loaded on mount
 * and refreshed every 2 minutes while the tab is visible or when the tab returns to visible.
 * A failed background refresh keeps the last good data untouched and advances `now`.
 */
export function useLive(): Load<LiveData> & { showLoading: boolean; retry: () => void; now: Date } {
  return usePolledLoad<LiveData>(LIVE_FILE, loadLive, LIVE_REFRESH_MS, (d) => d.now.run_time, mergeLive);
}
