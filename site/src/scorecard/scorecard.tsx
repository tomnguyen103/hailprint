import { SCORECARD_VIEWS, href, type ScorecardView } from "../router";
import { PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";

export const VIEW_LABELS: Record<ScorecardView, string> = {
  table: "Table",
  grid: "Grid",
  curve: "Curve",
};

export function Scorecard({ view }: { view: ScorecardView }) {
  return (
    <>
      <PageHeader title="Scorecard">
        <p>The scorecard pools the contingency table across every storm date.</p>
      </PageHeader>
      <SubTabs
        label="Scorecard views"
        tabs={SCORECARD_VIEWS.map((v) => ({ id: v, label: VIEW_LABELS[v], href: href({ area: "scorecard", view: v }) }))}
        selected={view}
      />
      <section class="pane" role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        <h2 class="visually-hidden">{VIEW_LABELS[view]}</h2>
      </section>
    </>
  );
}