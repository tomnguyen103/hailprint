import type { ArchiveSummary } from "../data/types";
import { EmptyState } from "../shell/states";
import { coverageRows, type CoverageRow } from "./coverage";

function cells(row: CoverageRow) {
  return (
    <>
      <th scope="row">{row.label}</th>
      <td class="num">{row.days}</td>
      <td class="num">{row.daysWith12z}</td>
      <td class="share">
        <span class="share-bar" style={`--k: ${row.share}`} aria-hidden="true" />
        <span class="mono">{Math.round(row.share * 100)} %</span>
      </td>
    </>
  );
}

/** Archive coverage per year with the share of days that hold a 12Z file; a total row closes the table. */
export function Archive({ archive }: { archive: ArchiveSummary | null }) {
  if (archive === null) {
    return (
      <>
        <EmptyState sentence="The archive index is not built yet." />
        <pre class="code-block">uv run hailprint index</pre>
      </>
    );
  }
  const rows = coverageRows(archive);
  const total = rows[rows.length - 1]!;
  return (
    <section>
      <h2>
        Archive coverage, <span class="mono">{archive.first_storm_date}</span> to <span class="mono">{archive.last_storm_date}</span>
      </h2>
      <div class="table-scroll">
        <table class="table" aria-label="Archive coverage">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col" class="num">Archive days</th>
              <th scope="col" class="num">Days with a 12Z file</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, -1).map((row) => (
              <tr key={row.label}>{cells(row)}</tr>
            ))}
          </tbody>
          <tfoot>
            <tr>{cells(total)}</tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
