import { SCENARIOS, type Scenario, setScenario, useScenario } from "./scenario";
import { navigate } from "../router";

const LABELS: Record<Scenario, string> = {
  none: "Live data",
  "index-loading": "Index loading",
  "index-empty": "Index empty",
  "index-error": "Index error",
  "swath-error": "Swath error",
};

/** Dev-only bar under the footer. app.tsx mounts it under import.meta.env.DEV only. */
export function Harness() {
  const scenario = useScenario();
  return (
    <div class="harness" role="group" aria-label="Dev harness">
      <span class="section-label">Harness</span>
      {SCENARIOS.map((s) => (
        <button
          key={s}
          type="button"
          class="button button-small"
          aria-pressed={scenario === s}
          onClick={() => setScenario(s)}
        >
          {LABELS[s]}
        </button>
      ))}
      <button type="button" class="button button-small" onClick={() => navigate("/storms/2019-01-01/map")}>
        Missing date
      </button>
    </div>
  );
}