import { TRY_TOOLS, href, type TryTool } from "../router";
import { PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";

export const TOOL_LABELS: Record<TryTool, string> = {
  tune: "Tune",
  point: "Point",
  compare: "Compare",
  run: "Run",
};

export function TryIt({ tool }: { tool: TryTool }) {
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
      </section>
    </>
  );
}