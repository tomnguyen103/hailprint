import { render } from "preact";
import { setFetch } from "../data/fetch";
import { navigate } from "../router";

// The harness keeps one scenario in sessionStorage and reloads the page, so the fake
// fetch is in place before the first render. No production module imports this file.
const SCENARIOS = [
  "none",
  "index-loading",
  "index-empty",
  "index-error",
  "swath-error",
  "reports-error",
  "pairs-error",
  "one-pairs-error",
  "one-swath-error",
  "zip-error",
] as const;
type Scenario = (typeof SCENARIOS)[number];

const KEY = "harness";
const INDEX_FILE = "storms.json";

const LABELS: Record<Scenario, string> = {
  none: "Live data",
  "index-loading": "Index loading",
  "index-empty": "Index empty",
  "index-error": "Index error",
  "swath-error": "Swath error",
  "reports-error": "Reports error",
  "pairs-error": "Pairs error",
  "one-pairs-error": "One pairs error",
  "one-swath-error": "One swath error",
  "zip-error": "ZIP error",
};

/** The file that answers HTTP 500 under each error scenario. */
const FAILING: Partial<Record<Scenario, string>> = {
  "index-error": INDEX_FILE,
  "swath-error": "swath.geojson",
  "reports-error": "reports.geojson",
  "pairs-error": "pairs.json",
  "zip-error": "zip-counts.json",
};

/** Scenarios that fail the first request for the named file (the newest storm date) and no other. */
const FAILING_FIRST: Partial<Record<Scenario, string>> = {
  "one-pairs-error": "pairs.json",
  "one-swath-error": "swath.geojson",
};

function current(): Scenario {
  const value = sessionStorage.getItem(KEY);
  return (SCENARIOS as readonly string[]).includes(value ?? "") ? (value as Scenario) : "none";
}

function fake(scenario: Scenario): typeof fetch {
  const failing = FAILING[scenario];
  const failingFirst = FAILING_FIRST[scenario];
  let firstUrl: string | null = null;
  return async (input, init) => {
    const url = String(input);
    const file = url.slice(url.lastIndexOf("/") + 1);
    if (scenario === "index-loading" && file === INDEX_FILE) return new Promise<never>(() => undefined);
    if (file === failing) return new Response(null, { status: 500 });
    if (file === failingFirst) {
      firstUrl ??= url;
      if (url === firstUrl) return new Response(null, { status: 500 });
    }
    const response = await fetch(input, init);
    if (scenario === "index-empty" && file === INDEX_FILE) {
      const body = (await response.json()) as Record<string, unknown>;
      return new Response(JSON.stringify({ ...body, storms: [] }));
    }
    return response;
  };
}

function pick(next: Scenario): void {
  sessionStorage.setItem(KEY, next);
  location.reload();
}

function Harness() {
  const scenario = current();
  return (
    <div class="harness" role="group" aria-label="Dev harness">
      <span class="section-label">Harness</span>
      {SCENARIOS.map((s) => (
        <button key={s} type="button" class="button button-small" aria-pressed={scenario === s} onClick={() => pick(s)}>
          {LABELS[s]}
        </button>
      ))}
      <button type="button" class="button button-small" onClick={() => navigate("/storms/2019-01-01/map")}>
        Missing date
      </button>
    </div>
  );
}

/** Install the fake fetch for the stored scenario and mount the bar after #app. main.tsx calls it in dev only. */
export function install(): void {
  const scenario = current();
  if (scenario !== "none") setFetch(fake(scenario));
  const host = document.createElement("div");
  document.body.append(host);
  render(<Harness />, host);
}
