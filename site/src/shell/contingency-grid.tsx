import type { TableRow } from "../data/types";
import { formatCount, formatInches } from "../storms/select";

/** A 2 by 2 grid for one class; each cell's square scales with its count. */
export function ContingencyGrid({ row }: { row: TableRow }) {
  const cells = [
    { label: "Hits", count: row.hits },
    { label: "False alarms", count: row.false_alarms },
    { label: "Misses", count: row.misses },
    { label: "Correct negatives", count: row.correct_negatives },
  ];
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <section>
      <h2>
        Contingency grid, &ge; {formatInches(row.threshold_in)}
      </h2>
      <div class="cgrid" role="group" aria-label={`Contingency grid at ${formatInches(row.threshold_in)}`}>
        {cells.map((cell) => (
          <div key={cell.label} class="cgrid-cell">
            <span class="cgrid-fill" style={{ "--k": Math.sqrt(cell.count / max) }} />
            <span class="stat mono">{formatCount(cell.count)}</span>
            <span class="cgrid-label">{cell.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}