import { guardInternet, guardPower, guardReports, guardWarnings } from "../data/guard";
import type { InternetFile, PowerFile, ReportsFile, StormsIndex, WarningsFile } from "../data/types";
import { useSparseFiles } from "./pairs-all";

/** Every reports.geojson of the index, in `index.storms` order, lazily loaded when `enabled` is true. */
export function useReportsAll(index: StormsIndex, enabled = true) {
  return useSparseFiles<ReportsFile>(
    index.storms.map((s) => s.files.reports),
    guardReports,
    index.run_time,
    enabled,
  );
}

/** Every warnings.geojson of the index (or null where absent), lazily loaded when `enabled` is true. */
export function useWarningsAll(index: StormsIndex, enabled = true) {
  return useSparseFiles<WarningsFile>(
    index.storms.map((s) => s.files.warnings),
    guardWarnings,
    index.run_time,
    enabled,
  );
}

/** Every power.json of the index (or null where absent), lazily loaded when `enabled` is true. */
export function usePowerAll(index: StormsIndex, enabled = true) {
  return useSparseFiles<PowerFile>(
    index.storms.map((s) => s.files.power),
    guardPower,
    index.run_time,
    enabled,
  );
}

/** Every internet.json of the index (or null where absent), lazily loaded when `enabled` is true. */
export function useInternetAll(index: StormsIndex, enabled = true) {
  return useSparseFiles<InternetFile>(
    index.storms.map((s) => s.files.internet),
    guardInternet,
    index.run_time,
    enabled,
  );
}
