// Guided 4-step proof narrative strip on the storm workspace.
import { href, type StormTab } from "../router";
import { Link } from "./link";

type Step = {
  tab: StormTab;
  step: string;
  title: string;
  metric: string;
};

const STEPS: readonly Step[] = [
  { tab: "map", step: "1", title: "Radar Swath", metric: "12Z-12Z MESH" },
  { tab: "parcels", step: "2", title: "HCAD Parcels", metric: "ZIP exposure" },
  { tab: "score", step: "3", title: "Skill Score", metric: "CSI & HSS" },
  { tab: "data", step: "4", title: "Audit Receipt", metric: "Provenance files" },
];

type Props = {
  date: string;
  activeTab: StormTab;
  step?: number;
};

/** Render the 4-step verification workflow navigation strip for a storm date. */
export function ProofStrip({ date, activeTab, step }: Props) {
  return (
    <nav class="proof-strip" aria-label="Verification proof workflow">
      {STEPS.map((item) => {
        const active = item.tab === activeTab;
        const target = href({
          area: "storms",
          date,
          tab: item.tab,
          step: item.tab === "map" ? step : undefined,
        });
        return (
          <Link
            key={item.tab}
            class="proof-step"
            href={target}
            aria-current={active ? "page" : undefined}
          >
            <span class="proof-step-num mono">{item.step}</span>
            <span class="proof-step-title">{item.title}</span>
            <span class="proof-step-metric mono">{item.metric}</span>
          </Link>
        );
      })}
    </nav>
  );
}

