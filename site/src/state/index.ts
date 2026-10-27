import { fetchJson } from "../data/fetch";
import { guardIndex } from "../data/guard";
import { DataError, type StormsIndex } from "../data/types";
import { useScenario } from "../dev/scenario";
import { useLoad } from "./load";

const INDEX_FILE = "storms.json";

/** The storm index, loaded once; the dev harness can force loading, empty, or error. */
export function useIndex() {
  const scenario = useScenario();
  return useLoad<StormsIndex>(`${INDEX_FILE}:${scenario}`, async () => {
    if (scenario === "index-loading") return new Promise<never>(() => undefined);
    if (scenario === "index-error") throw new DataError(INDEX_FILE, "HTTP 404 (harness)");
    const index = await fetchJson(INDEX_FILE, guardIndex);
    return scenario === "index-empty" ? { ...index, storms: [] } : index;
  });
}