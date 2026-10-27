import { guardSwath } from "../data/guard";
import type { StormsIndex, SwathFile } from "../data/types";
import { useAllFiles } from "./pairs-all";

/** Every swath.geojson of the index, in `index.storms` order, through the shared file cache. */
export function useSwathsAll(index: StormsIndex) {
  return useAllFiles<SwathFile>(
    index.storms.map((s) => s.files.swath),
    guardSwath,
  );
}