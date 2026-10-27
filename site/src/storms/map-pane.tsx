import type { ReportsFile, Storm } from "../data/types";
import type { Load } from "../state/load";

// Ticket 05 replaces this frame with the MapLibre pane.
export function MapPane(_: { storm: Storm; reports: Load<ReportsFile> }) {
  return <div class="map-frame" role="region" aria-label="Map of the hail swath" />;
}