import type { LaterArea } from "../router";
import { AREA_LABELS } from "../router";
import { EmptyState, PageHeader } from "../shell/states";

// shortcut: the four later areas render an empty state, upgrade in PR F and PR G
const SENTENCES: Record<LaterArea, string> = {
  scorecard: "The scorecard pools the contingency table across every storm date.",
  try: "Try it rescores one storm date at a radius you choose.",
  method: "Method explains the swath, the scoring domain, and the skill scores.",
  pipeline: "Pipeline shows each run from the archive index to the published files.",
};

export function LaterArea({ area }: { area: LaterArea }) {
  return (
    <>
      <PageHeader title={AREA_LABELS[area]}>
        <p>{SENTENCES[area]}</p>
      </PageHeader>
      <EmptyState sentence="This area is not published yet." link={{ href: "/storms", label: "Storms" }} />
    </>
  );
}