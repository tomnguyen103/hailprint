import { useState } from "preact/hooks";
import "../styles/storms.css";
import "../styles/pipeline.css";
import type { PipelineFile } from "../data/types";
import { PIPELINE_LABELS, PIPELINE_VIEWS, href, type PipelineView } from "../router";
import { ScopeDrawer } from "../shell/scope-drawer";
import { ErrorState, LoadingState } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";
import { usePipeline } from "../state/pipeline";
import { ageOf } from "./age";
import { Archive } from "./archive";
import { Runs } from "./runs";
import { Sources } from "./sources";

const FILE = "pipeline.json";

// shortcut: the Pipeline services dot reads presence in the published file, upgrade to a freshness rule when a cron runs
export function services(file: PipelineFile) {
  const has = (key: "source" | "product", word: string) => file.sources.some((s) => s[key].toLowerCase().includes(word));
  return [
    { name: "MESH archive", ok: file.archive !== null },
    { name: "SPC reports", ok: has("product", "hail") },
    { name: "HCAD parcels", ok: has("source", "hcad") },
  ];
}

/** The Pipeline area: services in the scope sidebar, one view of the pipeline file in the main column. */
export function Pipeline({ view }: { view: PipelineView }) {
  const file = usePipeline();
  const [servicesOpen, setServicesOpen] = useState(false);
  const close = () => setServicesOpen(false);

  if (file.status === "error") return <ErrorState error={file.error} onRetry={file.retry} />;
  if (file.status === "loading") return file.showLoading ? <LoadingState file={FILE} /> : null;
  const data = file.data;
  const age = ageOf(data.run_time, new Date());

  let body;
  if (view === "runs") body = <Runs runs={data.runs} />;
  else if (view === "archive") body = <Archive archive={data.archive} />;
  else body = <Sources sources={data.sources} />;

  return (
    <div class="workspace pipeline">
      <div class="scope-rail">
        <button
          type="button"
          class="button button-small"
          aria-haspopup="dialog"
          aria-expanded={servicesOpen}
          aria-controls="pipeline-scope"
          onClick={() => setServicesOpen(true)}
        >
          Services
        </button>
      </div>
      <ScopeDrawer id="pipeline-scope" label="Services" title="Services" open={servicesOpen} onClose={close}>
        <ul class="service-list">
          {services(data).map((s) => (
            <li key={s.name} class="service">
              <span class="dot" data-state={s.ok ? "ok" : "missing"} role="img" aria-label={s.ok ? "present" : "missing"} />
              <span>{s.name}</span>
              <span class="service-age mono">{age}</span>
            </li>
          ))}
        </ul>
      </ScopeDrawer>
      <div class="workspace-main">
        <h1 class="visually-hidden">Pipeline</h1>
        <SubTabs
          label="Pipeline views"
          tabs={PIPELINE_VIEWS.map((v) => ({ id: v, label: PIPELINE_LABELS[v], href: href({ area: "pipeline", view: v }) }))}
          selected={view}
        />
        <section class="pane" role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
          <h2 class="visually-hidden">{PIPELINE_LABELS[view]}</h2>
          {body}
        </section>
      </div>
    </div>
  );
}
