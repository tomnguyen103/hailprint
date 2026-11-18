import type { SourceRow } from "../data/types";
import { href } from "../router";
import { Link } from "../shell/link";
import { EmptyState } from "../shell/states";

/** One section per source row: the product as the heading, the source under it, the storm dates as links. */
export function Sources({ sources }: { sources: SourceRow[] }) {
  if (sources.length === 0) return <EmptyState sentence="No published sources." />;
  return (
    <>
      {sources.map((row) => (
        <section key={`${row.source} ${row.product}`}>
          <h2 data-user-content="">{row.product}</h2>
          <div class="pane-note mono">{row.source}</div>
          <ul class="date-list">
            {row.storm_dates.map((date) => (
              <li key={date}>
                <Link class="mono" href={href({ area: "storms", date, tab: "map" })}>
                  {date}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
