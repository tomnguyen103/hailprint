// Guided 4-step proof narrative strip on the storm workspace.
import { go, href, type StormTab } from "../router";

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
  { tab: "data", step: "4", title: "Audit Receipt", metric: "SHA-256 files" },
];

type Props = {
  date: string;
  activeTab: StormTab;
};

export function ProofStrip({ date, activeTab }: Props) {
  return (
    <div class="proof-strip" role="group" aria-label="Verification proof workflow">
      {STEPS.map((item) => {
        const active = item.tab === activeTab;
        const target = href({ area: "storms", date, tab: item.tab });
        return (
          <button
            key={item.tab}
            type="button"
            class="proof-step"
            aria-pressed={active}
            onClick={() => go(target)}
          >
            <span class="proof-step-num mono">{item.step}</span>
            <span class="proof-step-title">{item.title}</span>
            <span class="proof-step-metric mono">{item.metric}</span>
          </button>
        );
      })}
    </div>
  );
}
