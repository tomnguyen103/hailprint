import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import {
  METHOD_LABELS,
  METHOD_PAGES,
  PIPELINE_LABELS,
  PIPELINE_VIEWS,
  go,
  href,
} from "../router";
import { useIndex } from "../state/index";
import { CASE_STUDIES, landingStorm } from "../storms/select";
import { SearchIcon } from "./icons";

export interface GlobalSearchItem {
  id: string;
  group: "Storm" | "County" | "Tool" | "Method" | "Pipeline" | "Live";
  title: string;
  subtitle: string;
  route: string;
  keywords: string;
}

const METRO_COUNTIES: readonly [string, string][] = [
  ["48201", "Harris"],
  ["48157", "Fort Bend"],
  ["48339", "Montgomery"],
  ["48039", "Brazoria"],
  ["48167", "Galveston"],
  ["48473", "Waller"],
  ["48291", "Liberty"],
  ["48071", "Chambers"],
];

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
    title: "Batch",
    subtitle: "Try it · Run",
    route: href({ area: "try", tool: "run" }),
    keywords: "try batch run cli commands csv export",
  },
];

/** Center top-bar Ctrl+K search trigger and modal command palette. */
export function GlobalSearch() {
  const index = useIndex();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const listboxId = useId();

  const items = useMemo<GlobalSearchItem[]>(() => {
    const storms = index.status === "ready" ? index.data.storms : [];
    const landing = landingStorm(storms);
    const caseByDate = new Map(CASE_STUDIES.map((cs) => [cs.storm_date, cs]));

    const liveItem: GlobalSearchItem = {
      id: "live",
      group: "Live",
      title: "Live",
      subtitle: "Harris County 24 h",
      route: href({ area: "live" }),
      keywords: "live harris county radar now active",
    };

    const stormItems: GlobalSearchItem[] = storms.map((s) => {
      const cs = caseByDate.get(s.storm_date);
      const meshPart = typeof s.max_mesh_mm === "number" ? ` · ${s.max_mesh_mm.toFixed(0)} mm` : "";
      const casePart = cs ? ` · ${cs.title}` : "";
      return {
        id: `storm-${s.storm_date}`,
        group: "Storm",
        title: s.storm_date,
        subtitle: `${s.report_count ?? 0} reports${meshPart}${casePart}`,
        route: href({ area: "storms", date: s.storm_date, tab: "map" }),
        keywords: `${s.storm_date} ${s.report_source ?? ""} ${cs?.title ?? ""} ${cs?.summary ?? ""} storm`,
      };
    });

    const countyRoute = landing ? href({ area: "storms", date: landing.storm_date, tab: "data" }) : "/storms";
    const countyItems: GlobalSearchItem[] = METRO_COUNTIES.map(([fips, name]) => ({
      id: `county-${fips}`,
      group: "County",
      title: `${name} County`,
      subtitle: `FIPS ${fips}`,
      route: countyRoute,
      keywords: `${name} county fips ${fips} metro`,
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

    return [liveItem, ...stormItems, ...toolItems, ...countyItems, ...methodItems, ...pipelineItems];
  }, [index]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, open]);

  useEffect(() => {
    const onGlobalKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onGlobalKey);
    return () => document.removeEventListener("keydown", onGlobalKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus?.();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus?.();
  };

  const selectItem = (item: GlobalSearchItem) => {
    setOpen(false);
    setQuery("");
    go(item.route);
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIdx((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((prev) => (prev - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = results[activeIdx] ?? results[0];
      if (picked) selectItem(picked);
    }
  };

  const activeItem = results[activeIdx];
  const activeOptionId = activeItem ? `${listboxId}-${activeItem.id}` : undefined;

  return (
    <div class="global-search">
      <button
        ref={triggerRef}
        type="button"
        class="search-trigger"
        role="combobox"
        aria-label="Search"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen(true)}
      >
        <span class="search-trigger-left">
          <SearchIcon size={16} />
          <span class="search-placeholder">Search...</span>
        </span>
        <kbd class="search-kbd">Ctrl+K</kbd>
      </button>
      {open ? (
        <div class="search-backdrop" onMouseDown={close}>
          <div
            id={dialogId}
            class="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search Hailprint"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div class="search-input-row">
              <SearchIcon size={18} />
              <input
                ref={inputRef}
                type="search"
                class="search-input"
                role="combobox"
                aria-label="Search Hailprint"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                placeholder="Search storms, counties, tools, method..."
                value={query}
                onInput={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={onInputKeyDown}
              />
              <button type="button" class="button button-small" onClick={close}>
                Close
              </button>
            </div>
            <div id={listboxId} class="search-results" role="listbox" aria-label="Search results">
              {results.length === 0 ? (
                <div class="search-empty">No matches</div>
              ) : (
                results.map((item, idx) => {
                  const selected = idx === activeIdx;
                  return (
                    <a
                      key={item.id}
                      id={`${listboxId}-${item.id}`}
                      href={item.route}
                      role="option"
                      class="search-option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={(event) => {
                        event.preventDefault();
                        selectItem(item);
                      }}
                    >
                      <span class="search-option-group">{item.group}</span>
                      <span class="search-option-title">{item.title}</span>
                      <span class="search-option-sub mono">{item.subtitle}</span>
                    </a>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
