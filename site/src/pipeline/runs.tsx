import { useRef, useState } from "preact/hooks";
import type { PipelineRun } from "../data/types";
import { href } from "../router";
import { Link } from "../shell/link";
import { EmptyState } from "../shell/states";

/** The run log as a table of row buttons, newest first, and the inspector of the pressed run. */
export function Runs({ runs }: { runs: PipelineRun[] }) {
  const [selected, setSelected] = useState(0);
  const table = useRef<HTMLTableElement>(null);
  if (runs.length === 0) return <EmptyState sentence="No run is published yet." />;
  const at = Math.min(selected, runs.length - 1);
  const run = runs[at]!;

  /** ArrowDown and ArrowUp move focus between the row buttons; Enter and click press one. */
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(table.current?.querySelectorAll<HTMLButtonElement>(".row-pick") ?? []);
    const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (focused === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? Math.min(focused + 1, buttons.length - 1) : Math.max(focused - 1, 0);
    buttons[next]?.focus();
  };

  return (
    <div class="pane-grid">
      <section>
        <h2>Run log</h2>
        <div class="table-scroll">
          <table ref={table} class="table" aria-label="Run log" onKeyDown={onKey}>
            <thead>
              <tr>
                <th scope="col">Run time</th>
                <th scope="col" class="num">Version</th>
                <th scope="col" class="num">Storm dates</th>
                <th scope="col" class="num">Files</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={r.run_time}>
                  <td>
                    <button type="button" class="row-pick mono" aria-pressed={i === at} onClick={() => setSelected(i)}>
                      {r.run_time}
                    </button>
                  </td>
                  <td class="num">{r.package_version}</td>
                  <td class="num">{r.storm_dates.length}</td>
                  <td class="num">{r.file_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-live="polite">
        <h2>
          Run <span class="mono">{run.run_time}</span>
        </h2>
        <p class="pane-note">
          <span class="mono">{run.file_count}</span> files, version <span class="mono">{run.package_version}</span>
        </p>
        <ul class="date-list">
          {run.storm_dates.map((date) => (
            <li key={date}>
              <Link class="mono" href={href({ area: "storms", date, tab: "map" })}>
                {date}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
