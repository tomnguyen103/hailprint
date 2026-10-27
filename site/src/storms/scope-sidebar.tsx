import type { Storm } from "../data/types";
import { href } from "../router";
import { Link } from "../shell/link";
import { groupByYear } from "./select";

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
    <>
      {open ? <button type="button" class="scope-backdrop" aria-label="Close storm dates" onClick={onClose} /> : null}
      <nav class="scope" aria-label="Storm dates" data-open={open}>
        <div class="scope-head">
          <span class="section-label">Storm dates</span>
          <button type="button" class="button button-small scope-close" onClick={onClose}>
            Close
          </button>
        </div>
        {/* shortcut: year groups do not persist their open state, upgrade when the list passes a few years */}
        {groups.map((group) => (
          <details key={group.year} open={group.year === newestYear || group.year === current.storm_date.slice(0, 4)}>
            <summary>{group.year}</summary>
            <ul class="scope-list">
              {group.storms.map((storm) => {
                const active = storm.storm_date === current.storm_date;
                return (
                  <li key={storm.storm_date}>
                    <Link
                      href={href({ area: "storms", date: storm.storm_date })}
                      aria-current={active ? "page" : undefined}
                      onClick={onClose}
                    >
                      <span class="mono">{storm.storm_date}</span>
                      <span class="badge">
                        {storm.report_count}
                        <span class="visually-hidden"> reports</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </nav>
    </>
  );
}