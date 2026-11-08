// Guided 4-step proof narrative and telemetry strip on the storm workspace.
import type { Receipt } from "../data/types";
import { href, type StormTab } from "../router";
import { getRadiusKm } from "../state/radius";
import { Link } from "./link";
import { ReceiptChip } from "./receipt-chip";

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
  radiusKm?: number;
  receipt?: Receipt;
  file?: string;
};

/** Render the 4-step verification workflow and live telemetry strip for a storm date. */
export function ProofStrip({
  date,
  activeTab,
  step,
  radiusKm = getRadiusKm(),
  receipt,
  file = "reports.geojson",
}: Props) {
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
            <span class="proof-step-metric mono">
              {item.tab === "score" ? `${item.metric} · R=${radiusKm} km` : item.metric}
            </span>
          </Link>
        );
      })}
      {receipt ? (
        <span class="proof-strip-receipt">
          <ReceiptChip receipt={receipt} file={file} />
        </span>
      ) : null}
    </nav>
  );
}


