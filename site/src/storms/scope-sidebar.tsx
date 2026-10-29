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
 * rail between 768 and 1279 px; a sheet opened from the stamp below 768 px.
 */
export function ScopeSidebar({ storms, current, open, onClose }: Props) {
  const groups = groupByYear(storms);
  const newestYear = groups[0]?.year;
  return (
    <ScopeDrawer id="storms-scope" label="Storm dates" title="Storm dates" open={open} onClose={onClose}>
        {/* shortcut: year groups do not persist their open state, upgrade when the list passes a few years */}
        {groups.map((group) => (
          <details key={group.year} open={group.year === newestYear || group.year === current.storm_date.slice(0, 4)}>
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
                      <span class="mono">{storm.storm_date}</span>
                      <span class="scope-badges">
                        {chips.map((layer) => (
                          <span key={layer} class="scope-chip">
                            {layer}
                          </span>
                        ))}
                        <span class="badge">
                          {storm.report_count}
                          <span class="visually-hidden"> reports</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
    </ScopeDrawer>
  );
}