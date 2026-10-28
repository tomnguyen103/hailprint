// Type imports only: this module loads nothing at run time, so a node test imports it without MapLibre.
import type { ErrorEvent as MapErrorEvent, Map as MapLibreMap } from "maplibre-gl";

export const LOAD_TIMEOUT_MS = 15_000;

/** Resolve on `load`. A tile error leaves a gap. Any other error, or no load in time, releases the map and rejects. While the tab is hidden the timeout waits. */
export function whenLoaded(map: Pick<MapLibreMap, "on" | "off" | "remove">): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const settle = () => {
      clearTimeout(timer);
      map.off("load", onLoad);
      map.off("error", onError);
    };
    const fail = (error: unknown) => {
      // Reject first: a throw from remove() must not leave the load pending.
      settle();
      reject(error);
      map.remove();
    };
    const onLoad = () => {
      settle();
      resolve();
    };
    // Only a tile error carries `tile`. MapLibre fires one per failed tile, except a 404, so it never fails the load.
    const onError = (event: MapErrorEvent) => {
      // shortcut: tile errors are told apart by MapLibre's private `tile` field (maplibre-gl 6.16.0, pinned exact), recheck on any maplibre-gl bump.
      if (!("tile" in event)) fail(event.error ?? new Error("map failed to load"));
    };
    const onTimeout = () => {
      // A hidden tab pauses requestAnimationFrame, and MapLibre fires `load` from it, so the load only paused.
      if (globalThis.document?.hidden) {
        timer = setTimeout(onTimeout, LOAD_TIMEOUT_MS);
        return;
      }
      fail(new Error(`map did not load in ${LOAD_TIMEOUT_MS} ms`));
    };
    let timer = setTimeout(onTimeout, LOAD_TIMEOUT_MS);
    map.on("load", onLoad);
    map.on("error", onError);
  });
}
