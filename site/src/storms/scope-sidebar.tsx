import { useEffect, useRef, useState } from "preact/hooks";
import type { Storm } from "../data/types";
import { href } from "../router";
import { Link } from "../shell/link";
import { ScopeDrawer } from "../shell/scope-drawer";
import { groupByYear, impactChips } from "./select";

interface Props {
  storms: Storm[];
  current: Storm;
  open: boolean;
  onClose: () => void;
}

/**
 * The page tree of storm dates. Docked at 1280 px and up; an overlay opened from the
 * scope bar between 768 and 1279 px; a sheet opened from the stamp below 768 px.
 */
export function ScopeSidebar({ storms, current, open, onClose }: Props) {
  const nav = useRef<HTMLElement>(null);
  const groups = groupByYear(storms);
  const newestYear = groups[0]?.year ?? "";
  const currentYear = current.storm_date.slice(0, 4);

  const [openYears, setOpenYears] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (newestYear) initial.add(newestYear);
    if (currentYear) initial.add(currentYear);
    return initial;
  });

  useEffect(() => {
    setOpenYears((prev) => {
      if (prev.has(newestYear) && prev.has(currentYear)) return prev;
      const next = new Set(prev);
      if (newestYear) next.add(newestYear);
      if (currentYear) next.add(currentYear);
      return next;
    });
  }, [newestYear, currentYear]);

  const onNavKey = (event: KeyboardEvent) => {
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    const all = Array.from(nav.current?.querySelectorAll<HTMLElement>("summary, a[href]") ?? []).filter(
      (el) => el.closest?.("details:not([open])") === null || el.tagName === "SUMMARY",
    );
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    event.preventDefault();
    if (key === "Home") {
      all[0]?.focus();
    } else if (key === "End") {
      all[all.length - 1]?.focus();
    } else {
      const step = key === "ArrowDown" ? 1 : all.length - 1;
      all[(at + step) % all.length]?.focus();
    }
  };

  return (
    <ScopeDrawer
      id="storms-scope"
      label="Storm dates"
      title="Storm dates"
      open={open}
      onClose={onClose}
      navRef={nav}
      onKeyDown={onNavKey}
    >
      {groups.map((group) => {
        const isOpen = openYears.has(group.year);
        return (
          <details
            key={group.year}
            open={isOpen}
            onToggle={(event) => {
              const target = event.currentTarget as HTMLDetailsElement | null;
              if (!target) return;
              const nextOpen = Boolean(target.open);
              setOpenYears((prev) => {
                if (prev.has(group.year) === nextOpen) return prev;
                const next = new Set(prev);
                if (nextOpen) next.add(group.year);
                else next.delete(group.year);
                return next;
              });
            }}
          >
            <summary>{group.year}</summary>
            <ul class="scope-list">
              {group.storms.map((storm) => {
                const active = storm.storm_date === current.storm_date;
                const chips = storm.files ? impactChips(storm.files) : [];
                return (
                  <li key={storm.storm_date}>
                    <Link
                      href={href({ area: "storms", date: storm.storm_date })}
                      aria-current={active ? "page" : undefined}
                      onClick={onClose}
                    >
                      <span class="scope-row-top">
                        <span class="mono">{storm.storm_date}</span>
                        <span class="badge">
                          {storm.report_count ?? 0}
                          <span class="visually-hidden"> reports</span>
                        </span>
                      </span>
                      {chips.length > 0 ? (
                        <span class="scope-badges">
                          {chips.map((layer) => (
                            <span key={layer} class="scope-chip">
                              {layer}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </ScopeDrawer>
  );
}
