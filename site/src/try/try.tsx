import { useId, useMemo } from "preact/hooks";
import "../styles/try.css";
import { guardPairs } from "../data/guard";
import type { Pairs, Storm, StormsIndex } from "../data/types";
import { pooledRows } from "../pool";
import { TRY_TOOLS, href, type TryTool } from "../router";
import { PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";
import { useAllFiles } from "../state/pairs-all";
import { Compare } from "./compare";
import { PointCheck } from "./point";
import { Run } from "./run";
import { Tune } from "./tune";

export const TOOL_LABELS: Record<TryTool, string> = {
  tune: "Tune",
  point: "Point",
  compare: "Compare",
  run: "Run",
};

export const ALL_SCOPE = "all";

/** Storm dates newest first. */
export function newestFirst(storms: readonly Storm[]): Storm[] {
  return [...storms].sort((a, b) => b.storm_date.localeCompare(a.storm_date));
}

/** A labelled native select: "All storm dates" (when `withAll`) then every storm date newest first. */
export function ScopeSelect({
  storms,
  value,
  onChange,
  label,
  withAll = false,
}: {
  storms: readonly Storm[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  withAll?: boolean;
}) {
  const id = useId();
  return (
    <div class="scope-select">
      <label for={id}>{label}</label>
      <select id={id} class="mono" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {withAll ? <option value={ALL_SCOPE}>All storm dates</option> : null}
        {newestFirst(storms).map((s) => (
          <option key={s.storm_date} value={s.storm_date}>
            {s.storm_date}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The pooled rows of the scope ("all" or one storm date) at the radius, with the receipt for the chip. */
export function useScopeRows(index: StormsIndex, scope: string, radius: number) {
  const storms = scope === ALL_SCOPE ? index.storms : index.storms.filter((s) => s.storm_date === scope);
  const load = useAllFiles<Pairs>(
    storms.map((s) => s.files.pairs),
    guardPairs,
  );
  const data = load.status === "ready" ? load.data : null;
  const table = useMemo(() => (data === null ? null : pooledRows(data, radius)), [data, radius]);
  const first = data?.[0];
  return {
    load,
    table,
    receipt: first?.receipt ?? null,
    radiusMax: first?.radius_km_max ?? null,
    file: scope === ALL_SCOPE ? `pairs.json, pooled over ${storms.length} storm dates` : "pairs.json",
  };
}

export function TryIt({ index, tool }: { index: StormsIndex; tool: TryTool }) {
  return (
    <>
      <PageHeader title="Try it">
        <p>Try it rescores the swath at a radius and a threshold you choose.</p>
      </PageHeader>
      <SubTabs
        label="Try it tools"
        tabs={TRY_TOOLS.map((t) => ({ id: t, label: TOOL_LABELS[t], href: href({ area: "try", tool: t }) }))}
        selected={tool}
      />
      <section class="pane" role="tabpanel" id={`panel-${tool}`} aria-labelledby={`tab-${tool}`}>
        <h2 class="visually-hidden">{TOOL_LABELS[tool]}</h2>
        {tool === "tune" ? <Tune index={index} /> : null}
        {tool === "point" ? <PointCheck index={index} /> : null}
        {tool === "compare" ? <Compare index={index} /> : null}
        {tool === "run" ? <Run index={index} /> : null}
      </section>
    </>
  );
}