// Type imports only: this module loads nothing at run time, so a node test imports it without MapLibre.
import type { ErrorEvent as MapErrorEvent, Map as MapLibreMap } from "maplibre-gl";

export const LOAD_TIMEOUT_MS = 15_000;

/** Resolve on `load`. A tile error logs one warning and leaves a gap. Any other error, or no load in time, releases the map and rejects. The timeout counts only time while the tab is visible. */
export function whenLoaded(map: Pick<MapLibreMap, "on" | "off" | "remove">): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const doc = globalThis.document;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      map.off("load", onLoad);
      map.off("error", onError);
      doc?.removeEventListener("visibilitychange", onVisibility);
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
      if ("tile" in event) {
        // MapLibre prints nothing while an `error` listener exists, so this line restores the default visibility.
        console.warn("map tile failed", event.error);
      } else {
        fail(event.error ?? new Error("map failed to load"));
      }
    };
    const onTimeout = () => fail(new Error(`map did not load in ${LOAD_TIMEOUT_MS} ms`));
    // A hidden tab pauses requestAnimationFrame, and MapLibre fires `load` from it, so the load only pauses. Each visible spell gets a full timeout.
    const onVisibility = () => {
      clearTimeout(timer);
      timer = doc.hidden ? undefined : setTimeout(onTimeout, LOAD_TIMEOUT_MS);
    };
    if (!doc?.hidden) timer = setTimeout(onTimeout, LOAD_TIMEOUT_MS);
    doc?.addEventListener("visibilitychange", onVisibility);
    map.on("load", onLoad);
    map.on("error", onError);
  });
}
