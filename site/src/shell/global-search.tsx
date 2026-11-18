import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import type { Storm } from "../data/types";
import { go } from "../router";
import { setSelectedCounty } from "../state/county";
import { SearchIcon } from "./icons";
import { useModalFocusTrap } from "./modal-focus";
import {
  RECENT_KEY,
  buildSearchItems,
  filterAndGroupSearchItems,
  pushRecentId,
  readRecentIds,
  type GlobalSearchItem,
} from "./search-index";

export { RECENT_KEY, type GlobalSearchItem };

const EMPTY_STORMS: readonly Storm[] = [];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const ce = el.getAttribute?.("contenteditable");
  return ce === "" || ce === "true" || ce === "plaintext-only";
}

/** Center top-bar Ctrl+K and / search trigger and modal command palette. */
export function GlobalSearch({ storms = EMPTY_STORMS }: { storms?: readonly Storm[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(readRecentIds);
  const openRef = useRef(open);
  openRef.current = open;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const listboxId = useId();

  useModalFocusTrap(open, dialogRef);

  const items = useMemo<GlobalSearchItem[]>(() => buildSearchItems(storms), [storms]);

  const { groups, results } = useMemo(
    () => filterAndGroupSearchItems(items, query, recentIds),
    [items, query, recentIds],
  );

  const indexById = useMemo(() => new Map(results.map((item, idx) => [item.id, idx])), [results]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, open]);

  useEffect(() => {
    const onGlobalKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (openRef.current) {
          setOpen(false);
          setQuery("");
          triggerRef.current?.focus?.();
        } else {
          setOpen(true);
        }
      } else if (
        !openRef.current &&
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onGlobalKey);
    return () => document.removeEventListener("keydown", onGlobalKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus?.();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
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
    setRecentIds((prev) => pushRecentId(prev, item.id));
    if (item.countyFips) setSelectedCounty(item.countyFips);
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
            ref={dialogRef}
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
              {groups.length === 0 ? (
                <div class="search-empty">No matches</div>
              ) : (
                groups.map((group) => {
                  const groupHeadingId = `${listboxId}-group-${group.key}`;
                  return (
                    <div key={group.key} class="search-group" role="group" aria-labelledby={groupHeadingId}>
                      <div id={groupHeadingId} class="search-group-heading" role="presentation">
                        {group.label}
                      </div>
                      {group.items.map((item) => {
                        const idx = indexById.get(item.id) ?? 0;
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
                      })}
                    </div>
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
