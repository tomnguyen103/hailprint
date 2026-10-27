import type { Storm, StormsIndex } from "../data/types";
import type { Tab } from "../router";
import { PageHeader } from "../shell/states";

// Ticket 04 replaces this placeholder with the Storms workspace.
export function StormsArea({ storm, tab }: { index: StormsIndex; storm: Storm; tab: Tab }) {
  return (
    <PageHeader title="Storms">
      <p>
        <span class="mono">{storm.storm_date}</span>, {tab}.
      </p>
    </PageHeader>
  );
}