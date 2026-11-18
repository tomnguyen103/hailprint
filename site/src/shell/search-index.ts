// Pure search item index, filtering/grouping, and recent-search storage for GlobalSearch.
import { METRO_COUNTIES } from "../data/constants";
import type { Storm } from "../data/types";
import {
  METHOD_LABELS,
  METHOD_PAGES,
  PIPELINE_LABELS,
  PIPELINE_VIEWS,
  SCORECARD_VIEWS,
  href,
  type ScorecardView,
} from "../router";

export const RECENT_KEY = "hailprint-recent-searches";
export const MAX_RECENT = 5;

export interface GlobalSearchItem {
  id: string;
  group: "Live" | "Storm" | "Scorecard" | "Tool" | "County" | "Method" | "Pipeline";
  title: string;
  subtitle: string;
  route: string;
  keywords: string;
  countyFips?: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  items: GlobalSearchItem[];
}

const GROUP_LABELS: Record<GlobalSearchItem["group"], string> = {
  Live: "Live",
  Storm: "Storms",
  Scorecard: "Scorecard",
  Tool: "Tools",
  County: "Counties",
  Method: "Method",
  Pipeline: "Pipeline",
};

const SCORECARD_LABELS: Record<ScorecardView, string> = {
  table: "Table",
  grid: "Grid",
  curve: "Curve",
};

const STORM_CASE_TAGS: Record<string, { title: string; summary: string }> = {
  "2024-05-28": { title: "2024-05-28 Derecho", summary: "Northwest Harris & Cypress corridor" },
  "2024-12-24": { title: "2024-12-24 Christmas", summary: "Single-storm verification case study" },
  "2023-06-23": { title: "2023-06-23 Hail", summary: "Montgomery County & The Woodlands" },
  "2024-03-15": { title: "2024-03-15 Spring", summary: "Metro hail swath and radar comparison" },
};

const TRY_SEARCH_ITEMS: readonly { id: string; title: string; subtitle: string; route: string; keywords: string }[] = [
  {
    id: "tool-point",
    title: "Point check",
    subtitle: "Try it",
    route: href({ area: "try", tool: "point" }),
    keywords: "try point check coordinates pin location metro",
  },
  {
    id: "tool-compare",
    title: "Compare",
    subtitle: "Try it",
    route: href({ area: "try", tool: "compare" }),
    keywords: "try compare swipe side by side",
  },
  {
    id: "tool-tune",
    title: "Tune",
    subtitle: "Try it",
    route: href({ area: "try", tool: "tune" }),
    keywords: "try tune scoring radius threshold",
  },
  {
    id: "tool-run",
    title: "Run",
    subtitle: "Try it",
    route: href({ area: "try", tool: "run" }),
    keywords: "try run batch cli commands csv export",
  },
];

/** Select the default showcase storm date using the same impact priority as `/storms`. */
export function landingStormDate(storms: readonly Storm[]): string | null {
  const picked =
    storms.find(
      (s) =>
        Boolean(s.files) &&
        s.files.power !== null &&
        s.files.internet !== null &&
        (s.report_count ?? 0) >= 5,
    ) ??
    storms.find((s) => Boolean(s.files) && s.files.power !== null && s.files.internet !== null) ??
    storms.find((s) => Boolean(s.files) && s.files.power !== null) ??
    storms.find(
      (s) =>
        Boolean(s.files) &&
        (s.files.power !== null || s.files.internet !== null || s.files.warnings !== null),
    ) ??
    storms[0];
  return picked?.storm_date ?? null;
}

/** Read deduplicated recent search item IDs from storage, capped at `MAX_RECENT`. */
export function readRecentIds(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item.length > 0 && !seen.has(item)) {
        seen.add(item);
        out.push(item);
        if (out.length >= MAX_RECENT) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Prepend `id` to recent search IDs (deduplicated, capped at `MAX_RECENT`) and persist best-effort. */
export function pushRecentId(prev: readonly string[], id: string): string[] {
  const next = [id, ...prev.filter((entry) => entry !== id)].slice(0, MAX_RECENT);
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore blocked storage in restricted browser contexts.
  }
  return next;
}

function groupItems(list: readonly GlobalSearchItem[]): SearchGroup[] {
  const byGroup = new Map<GlobalSearchItem["group"], GlobalSearchItem[]>();
  for (const item of list) {
    let bucket = byGroup.get(item.group);
    if (!bucket) {
      bucket = [];
      byGroup.set(item.group, bucket);
    }
    bucket.push(item);
  }
  const out: SearchGroup[] = [];
  for (const [group, items] of byGroup) {
    out.push({ key: group.toLowerCase(), label: GROUP_LABELS[group], items });
  }
  return out;
}

/** Build the searchable catalog of Live, Storm, Scorecard, Tool, County, Method, and Pipeline items. */
export function buildSearchItems(storms: readonly Storm[]): GlobalSearchItem[] {
  const landingDate = landingStormDate(storms);

  const liveItem: GlobalSearchItem = {
    id: "live",
    group: "Live",
    title: "Live",
    subtitle: "Harris County 24 h",
    route: href({ area: "live" }),
    keywords: "live harris county radar now active",
  };

  const stormItems: GlobalSearchItem[] = storms.map((s) => {
    const tag = STORM_CASE_TAGS[s.storm_date];
    const meshPart = typeof s.max_mesh_mm === "number" ? ` · ${s.max_mesh_mm.toFixed(0)} mm` : "";
    const casePart = tag ? ` · ${tag.title}` : "";
    return {
      id: `storm-${s.storm_date}`,
      group: "Storm",
      title: s.storm_date,
      subtitle: `${s.report_count ?? 0} reports${meshPart}${casePart}`,
      route: href({ area: "storms", date: s.storm_date, tab: "map" }),
      keywords: `${s.storm_date} ${s.report_source ?? ""} ${tag?.title ?? ""} ${tag?.summary ?? ""} storm`,
    };
  });

  const scorecardItems: GlobalSearchItem[] = SCORECARD_VIEWS.map((view) => ({
    id: `scorecard-${view}`,
    group: "Scorecard",
    title: SCORECARD_LABELS[view],
    subtitle: "Scorecard",
    route: href({ area: "scorecard", view }),
    keywords: "scorecard pooled table grid curve hss pod far csi threshold",
  }));

  const countyRoute = landingDate ? href({ area: "storms", date: landingDate, tab: "data" }) : "/storms";
  const countyItems: GlobalSearchItem[] = METRO_COUNTIES.map(([fips, name]) => ({
    id: `county-${fips}`,
    group: "County",
    title: `${name} County`,
    subtitle: `FIPS ${fips}`,
    route: countyRoute,
    keywords: `${name} county fips ${fips} metro`,
    countyFips: fips,
  }));

  const toolItems: GlobalSearchItem[] = TRY_SEARCH_ITEMS.map((t) => ({
    id: t.id,
    group: "Tool",
    title: t.title,
    subtitle: t.subtitle,
    route: t.route,
    keywords: t.keywords,
  }));

  const methodItems: GlobalSearchItem[] = METHOD_PAGES.map((page) => ({
    id: `method-${page}`,
    group: "Method",
    title: METHOD_LABELS[page],
    subtitle: "Method",
    route: href({ area: "method", page }),
    keywords: `method ${METHOD_LABELS[page]} ${page}`,
  }));

  const pipelineItems: GlobalSearchItem[] = PIPELINE_VIEWS.map((view) => ({
    id: `pipeline-${view}`,
    group: "Pipeline",
    title: PIPELINE_LABELS[view],
    subtitle: "Pipeline",
    route: href({ area: "pipeline", view }),
    keywords: `pipeline ${PIPELINE_LABELS[view]} ${view}`,
  }));

  return [liveItem, ...stormItems, ...scorecardItems, ...toolItems, ...countyItems, ...methodItems, ...pipelineItems];
}

/** Filter and group search items, prepending a `Recent` group when `query` is empty. */
export function filterAndGroupSearchItems(
  items: readonly GlobalSearchItem[],
  query: string,
  recentIds: readonly string[],
): { groups: SearchGroup[]; results: GlobalSearchItem[] } {
  const q = query.trim().toLowerCase();
  if (!q) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const recentItems: GlobalSearchItem[] = [];
    const seen = new Set<string>();
    for (const id of recentIds) {
      const match = byId.get(id);
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        recentItems.push(match);
      }
    }
    const rest = items.filter((item) => !seen.has(item.id)).slice(0, 12);
    const nextGroups: SearchGroup[] = [];
    if (recentItems.length > 0) {
      nextGroups.push({ key: "recent", label: "Recent", items: recentItems });
    }
    nextGroups.push(...groupItems(rest));
    return { groups: nextGroups, results: nextGroups.flatMap((g) => g.items) };
  }
  const matched = items
    .filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q),
    )
    .slice(0, 20);
  const nextGroups = groupItems(matched);
  return { groups: nextGroups, results: nextGroups.flatMap((g) => g.items) };
}
