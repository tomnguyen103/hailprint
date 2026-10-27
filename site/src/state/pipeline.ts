import { fetchJson } from "../data/fetch";
import { guardPipeline } from "../data/guard";
import type { PipelineFile } from "../data/types";
import { useLoad } from "./load";

const PIPELINE_FILE = "pipeline.json";

/** The pipeline file (run log, archive coverage, sources), loaded once. */
export function usePipeline() {
  return useLoad<PipelineFile>(PIPELINE_FILE, () => fetchJson(PIPELINE_FILE, guardPipeline));
}
