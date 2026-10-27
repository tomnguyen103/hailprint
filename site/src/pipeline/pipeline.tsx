import { PIPELINE_LABELS, type PipelineView } from "../router";
import { EmptyState, PageHeader } from "../shell/states";

// shortcut: placeholder until ticket 07 renders pipeline.json, upgrade in ticket 07
export function Pipeline({ view }: { view: PipelineView }) {
  return (
    <>
      <PageHeader title={PIPELINE_LABELS[view]} />
      <EmptyState sentence="This view is in progress." />
    </>
  );
}
