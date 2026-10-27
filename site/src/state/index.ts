import { fetchJson } from "../data/fetch";
import { guardIndex } from "../data/guard";
import type { StormsIndex } from "../data/types";
import { useLoad } from "./load";

const INDEX_FILE = "storms.json";

/** The storm index, loaded once. */
export function useIndex() {
  return useLoad<StormsIndex>(INDEX_FILE, () => fetchJson(INDEX_FILE, guardIndex));
}
