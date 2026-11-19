import { fetchJson } from "../data/fetch";
import { guardLive, guardReports, guardSwath, guardWarnings } from "../data/guard";
import type { LiveFile, ReportsFile, SwathFile, WarningsFile } from "../data/types";
import { usePolledLoad } from "./index";
import type { Load } from "./load";

const LIVE_FILE = "live/now.json";
export const LIVE_REFRESH_MS = 120_000;

export interface LayerNotes {
  swath: string | null;
  reports: string | null;
  warnings: string | null;
}

const notesOf = (l: LayerNotes): string[] =>
  [l.swath, l.reports, l.warnings].filter((n): n is string => n !== null);

export interface LiveData {
  now: LiveFile;
  swath: SwathFile | null;
  reports: ReportsFile | null;
  warnings: WarningsFile | null;
  /** The notes of the failed layers, derived from `layerNotes`. */
  notes: string[];
  layerNotes: LayerNotes;
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
  const layerNotes = { swath: swath.note, reports: reports.note, warnings: warnings.note };
  return {
    now,
    swath: swath.data,
    reports: reports.data,
    warnings: warnings.data,
    notes: notesOf(layerNotes),
    layerNotes,
  };
}

/** A refresh of the same run keeps each layer that failed; a newer run replaces the data. */
export function mergeLive(prev: LiveData, next: LiveData): LiveData {
  if (next.now.run_time !== prev.now.run_time) return next;
  const swath = next.swath ?? prev.swath;
  const reports = next.reports ?? prev.reports;
  const warnings = next.warnings ?? prev.warnings;
  const layerNotes = {
    swath: swath === null ? next.layerNotes.swath : null,
    reports: reports === null ? next.layerNotes.reports : null,
    warnings: warnings === null ? next.layerNotes.warnings : null,
  };
  return { now: next.now, swath, reports, warnings, notes: notesOf(layerNotes), layerNotes };
}

/**
 * The live view data (`live/now.json` and the three layer files it names), loaded on mount
 * and refreshed every 2 minutes while the tab is visible or when the tab returns to visible.
 * A refresh of a newer run replaces the data: a failed layer is null with its note.
 * A refresh of the same run keeps the last good layer.
 * A failed `now.json` fetch keeps the current data and advances `now`.
 */
export function useLive(): Load<LiveData> & { showLoading: boolean; retry: () => void; now: Date } {
  return usePolledLoad<LiveData>(LIVE_FILE, loadLive, LIVE_REFRESH_MS, (d) => d.now.run_time, mergeLive);
}
