// History-API router. Pure: no Preact import, window touched only inside navigate/replace.
// Routes carry zero query strings; href() is the one place that builds a path.

export const AREAS = ["storms", "scorecard", "try", "method", "pipeline"] as const;
export type Area = (typeof AREAS)[number];
export type LaterArea = Exclude<Area, "storms">;

export const TABS = ["map", "parcels", "score", "data"] as const;
export type Tab = (typeof TABS)[number];

export const AREA_LABELS: Record<Area, string> = {
  storms: "Storms",
  scorecard: "Scorecard",
  try: "Try it",
  method: "Method",
  pipeline: "Pipeline",
};

export const TAB_LABELS: Record<Tab, string> = {
  map: "Map",
  parcels: "Parcels",
  score: "Score",
  data: "Data",
};

export type Route =
  | { kind: "redirect-latest" }
  | { kind: "storms"; date: string; tab: Tab }
  | { kind: "area"; area: LaterArea }
  | { kind: "not-found" };

export type Target = { area: "storms"; date: string; tab?: Tab } | { area: LaterArea };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

export function match(path: string): Route {
  const parts = path.split("/").filter((p) => p !== "");
  const [head, date, tab, ...rest] = parts;
  if (head === undefined) return { kind: "redirect-latest" };
  if (!isArea(head)) return { kind: "not-found" };
  if (head !== "storms") {
    return parts.length === 1 ? { kind: "area", area: head } : { kind: "not-found" };
  }
  if (date === undefined) return { kind: "redirect-latest" };
  if (!DATE.test(date) || rest.length > 0) return { kind: "not-found" };
  return { kind: "storms", date, tab: tab !== undefined && isTab(tab) ? tab : "map" };
}

export function href(target: Target): string {
  if (target.area === "storms") return `/storms/${target.date}/${target.tab ?? "map"}`;
  return `/${target.area}`;
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