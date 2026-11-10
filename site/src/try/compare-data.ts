// Pure comparison math and preset definitions decoupled from the Preact UI.
import type { Storm } from "../data/types";

export type ComparePair = [string, string];

export interface ComparePreset {
  id: string;
  label: string;
  dateA: string;
  dateB: string;
}

export const COMPARE_PRESETS: readonly ComparePreset[] = [
  {
    id: "derecho-vs-hen-egg",
    label: "2024-05-28 vs 2023-06-23 (Derecho vs 2.00 in Hen Egg)",
    dateA: "2024-05-28",
    dateB: "2023-06-23",
  },
  {
    id: "spring-2024",
    label: "2024-05-28 vs 2024-03-15 (Spring 2024 Swaths)",
    dateA: "2024-05-28",
    dateB: "2024-03-15",
  },
  {
    id: "skill-vs-dense",
    label: "2024-12-24 vs 2024-03-21 (0.50 Peak HSS vs 10-Report Swath)",
    dateA: "2024-12-24",
    dateB: "2024-03-21",
  },
];

/** Return storm dates sorted newest first. */
export function newestFirst(storms: readonly Storm[]): Storm[] {
  return [...storms].sort((a, b) => b.storm_date.localeCompare(a.storm_date));
}

/** Default comparison pair: 2024-05-28 vs 2023-06-23 when both exist, else newest two dates. */
export function defaultComparePair(storms: readonly Storm[]): ComparePair {
  const byDate = new Set(storms.map((s) => s.storm_date));
  if (byDate.has("2024-05-28") && byDate.has("2023-06-23")) {
    return ["2024-05-28", "2023-06-23"];
  }
  const dates = newestFirst(storms).map((s) => s.storm_date);
  return [dates[0] ?? "", dates[1] ?? dates[0] ?? ""];
}

export interface CompareDelta {
  parcelsA: number | null;
  parcelsB: number | null;
  deltaParcels: number | null;
  swathKm2A: number | null;
  swathKm2B: number | null;
  deltaSwathKm2: number | null;
  maxMeshMmA: number | null;
  maxMeshMmB: number | null;
  deltaMaxMeshMm: number | null;
  reportsA: number | null;
  reportsB: number | null;
  deltaReports: number | null;
  hssA: number | null;
  hssB: number | null;
  deltaHss: number | null;
}

function peakHss(storm: Storm | undefined): number | null {
  if (!storm) return null;
  const values = storm.table.map((r) => r.hss).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

/** Compute A-vs-B comparison values and signed (A - B) deltas (0.75 in swath/parcels and peak HSS across classes). */
export function compareDelta(stormA: Storm | undefined, stormB: Storm | undefined): CompareDelta {
  const parcelsA = stormA?.parcel_total ?? null;
  const parcelsB = stormB?.parcel_total ?? null;
  const rowA = stormA?.table[0] ?? null;
  const rowB = stormB?.table[0] ?? null;
  const swathKm2A = rowA?.swath_km2 ?? null;
  const swathKm2B = rowB?.swath_km2 ?? null;
  const maxMeshMmA = stormA?.max_mesh_mm ?? null;
  const maxMeshMmB = stormB?.max_mesh_mm ?? null;
  const reportsA = stormA?.report_count ?? null;
  const reportsB = stormB?.report_count ?? null;
  const hssA = peakHss(stormA);
  const hssB = peakHss(stormB);
  return {
    parcelsA,
    parcelsB,
    deltaParcels: parcelsA !== null && parcelsB !== null ? parcelsA - parcelsB : null,
    swathKm2A,
    swathKm2B,
    deltaSwathKm2: swathKm2A !== null && swathKm2B !== null ? swathKm2A - swathKm2B : null,
    maxMeshMmA,
    maxMeshMmB,
    deltaMaxMeshMm: maxMeshMmA !== null && maxMeshMmB !== null ? maxMeshMmA - maxMeshMmB : null,
    reportsA,
    reportsB,
    deltaReports: reportsA !== null && reportsB !== null ? reportsA - reportsB : null,
    hssA,
    hssB,
    deltaHss: hssA !== null && hssB !== null ? hssA - hssB : null,
  };
}
