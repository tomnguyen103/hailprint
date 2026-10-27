import type { LaterArea } from "../router";
import { AREA_LABELS } from "../router";
import { EmptyState, PageHeader } from "../shell/states";

// shortcut: the two later areas render an empty state, upgrade in PR G
const SENTENCES: Record<LaterArea, string> = {
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