import type { SourceRow } from "../data/types";
import { href } from "../router";
import { Link } from "../shell/link";
import { EmptyState } from "../shell/states";

/** One section per source row: the product as the heading, the source under it, the storm dates as links. */
export function Sources({ sources }: { sources: SourceRow[] }) {
  if (sources.length === 0) return <EmptyState sentence="No source is published yet." />;
  return (
    <>
      {sources.map((row) => (
        <section key={`${row.source} ${row.product}`}>
          <h2>{row.product}</h2>
          <p class="pane-note mono">{row.source}</p>
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
