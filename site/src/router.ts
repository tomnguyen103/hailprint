// History-API router. Pure: no Preact import, window touched only inside navigate/replace.
// Routes carry zero query strings; href() is the one place that builds a path.

import { isStep, parseStep } from "./time/step";

export const AREAS = ["storms", "scorecard", "try", "method", "pipeline"] as const;
export type Area = (typeof AREAS)[number];

export const TABS = ["map", "parcels", "score", "data"] as const;
export type Tab = (typeof TABS)[number];

export const SCORECARD_VIEWS = ["table", "grid", "curve"] as const;
export type ScorecardView = (typeof SCORECARD_VIEWS)[number];

export const TRY_TOOLS = ["tune", "point", "compare", "run"] as const;
export type TryTool = (typeof TRY_TOOLS)[number];

export const METHOD_PAGES = ["data", "storm-date", "size-classes", "scoring", "limits", "impacts"] as const;
export type MethodPage = (typeof METHOD_PAGES)[number];

export const PIPELINE_VIEWS = ["runs", "archive", "sources"] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];

export const AREA_LABELS: Record<Area, string> = { storms: "Storms", scorecard: "Scorecard", try: "Try it", method: "Method", pipeline: "Pipeline" };
export const TAB_LABELS: Record<Tab, string> = { map: "Map", parcels: "Parcels", score: "Score", data: "Data" };
export const METHOD_LABELS: Record<MethodPage, string> = {
  data: "Data", "storm-date": "Storm date", "size-classes": "Size classes", scoring: "Scoring", limits: "Limits", impacts: "Impacts",
};
export const PIPELINE_LABELS: Record<PipelineView, string> = { runs: "Runs", archive: "Archive", sources: "Sources" };

export type Route =
  | { kind: "redirect-latest" }
  // step is the map step of /map/<step>; null means the default step (see time/step.ts).
  | { kind: "storms"; date: string; tab: Tab; step: number | null }
  | { kind: "scorecard"; view: ScorecardView }
  | { kind: "try"; tool: TryTool }
  | { kind: "method"; page: MethodPage }
  | { kind: "pipeline"; view: PipelineView }
  | { kind: "not-found" };

export type Target =
  | { area: "storms"; date: string; tab?: Tab; step?: number }
  | { area: "scorecard"; view?: ScorecardView }
  | { area: "try"; tool?: TryTool }
  | { area: "method"; page?: MethodPage }
  | { area: "pipeline"; view?: PipelineView };

/** A storm date as the path and the index carry it. The guards share it. */
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isArea(value: string): value is Area { return (AREAS as readonly string[]).includes(value); }
function isTab(value: string): value is Tab { return (TABS as readonly string[]).includes(value); }

/** The second path part of an area with sub-pages: the first option when absent, null when unknown. */
function subOf<T extends string>(options: readonly T[], parts: string[]): T | null {
  const [, sub] = parts;
  if (parts.length === 1) return options[0]!;
  if (parts.length === 2 && sub !== undefined && (options as readonly string[]).includes(sub)) return sub as T;
  return null;
}

export function match(path: string): Route {
  const parts = path.split("/").filter((p) => p !== "");
  const [head, date, tab, ...rest] = parts;
  if (head === undefined) return { kind: "redirect-latest" };
  if (!isArea(head)) return { kind: "not-found" };
  if (head === "scorecard") {
    const view = subOf(SCORECARD_VIEWS, parts);
    return view === null ? { kind: "not-found" } : { kind: "scorecard", view };
  }
  if (head === "try") {
    const tool = subOf(TRY_TOOLS, parts);
    return tool === null ? { kind: "not-found" } : { kind: "try", tool };
  }
  if (head === "method") {
    const page = subOf(METHOD_PAGES, parts);
    return page === null ? { kind: "not-found" } : { kind: "method", page };
  }
  if (head === "pipeline") {
    const view = subOf(PIPELINE_VIEWS, parts);
    return view === null ? { kind: "not-found" } : { kind: "pipeline", view };
  }
  if (date === undefined) return { kind: "redirect-latest" };
  const [stepPart, ...more] = rest;
  if (!DATE.test(date) || more.length > 0) return { kind: "not-found" };
  if (stepPart !== undefined && tab !== "map") return { kind: "not-found" };
  return {
    kind: "storms",
    date,
    tab: tab !== undefined && isTab(tab) ? tab : "map",
    step: stepPart === undefined ? null : parseStep(stepPart),
  };
}

export function href(target: Target): string {
  if (target.area === "storms") {
    const tab = target.tab ?? "map";
    const step = tab === "map" && target.step !== undefined && isStep(target.step) ? `/${target.step}` : "";
    return `/storms/${target.date}/${tab}${step}`;
  }
  if (target.area === "scorecard") return target.view === undefined ? "/scorecard" : `/scorecard/${target.view}`;
  if (target.area === "try") return target.tool === undefined ? "/try" : `/try/${target.tool}`;
  if (target.area === "method") return target.page === undefined ? "/method" : `/method/${target.page}`;
  return target.view === undefined ? "/pipeline" : `/pipeline/${target.view}`;
}

/** Push a path and tell every route listener. */
export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Replace the current path (redirects), so Back skips it. */
export function replace(path: string): void {
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
