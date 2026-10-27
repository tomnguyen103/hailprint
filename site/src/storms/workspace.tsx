import { useEffect, useState } from "preact/hooks";
import "../styles/storms.css";
import { fetchJson } from "../data/fetch";
import { guardReports } from "../data/guard";
import type { Receipt, Storm, StormsIndex } from "../data/types";
import { TAB_LABELS, type Tab } from "../router";
import { useLoad } from "../state/load";
import { DataPane } from "./data-pane";
import { MapPane } from "./map-pane";
import { ParcelsPane } from "./parcels-pane";
import { ScopeSidebar } from "./scope-sidebar";
import { ScorePane } from "./score-pane";
import { Stamp } from "./stamp";
import { SubTabs } from "./sub-tabs";

interface Props {
  index: StormsIndex;
  storm: Storm;
  tab: Tab;
}

export function Workspace({ index, storm, tab }: Props) {
  const [datesOpen, setDatesOpen] = useState(false);
  const reports = useLoad(storm.files.reports, () => fetchJson(storm.files.reports, guardReports));
  const indexReceipt: Receipt = {
    storm_date: storm.storm_date,
    sources: [],
    confidence: index.confidence,
    run_time: index.run_time,
    package_version: index.package_version,
  };

  useEffect(() => {
    if (!datesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDatesOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [datesOpen]);

  let pane;
  if (tab === "map") pane = <MapPane storm={storm} reports={reports} />;
  else if (tab === "parcels") pane = <ParcelsPane storm={storm} />;
  else if (tab === "score") pane = <ScorePane storm={storm} radiusKm={index.radius_km_default} />;
  else pane = <DataPane storm={storm} />;

  return (
    <div class="workspace">
      <div class="scope-rail">
        <button type="button" class="button button-small" aria-haspopup="dialog" onClick={() => setDatesOpen(true)}>
          Dates
        </button>
      </div>
      <ScopeSidebar storms={index.storms} current={storm} open={datesOpen} onClose={() => setDatesOpen(false)} />
      <div class="workspace-main">
        <h1 class="visually-hidden">Storms, {storm.storm_date}</h1>
        <Stamp storm={storm} reports={reports} indexReceipt={indexReceipt} onOpenDates={() => setDatesOpen(true)} />
        <SubTabs date={storm.storm_date} tab={tab} />
        <section class="pane" role="tabpanel" id={`pane-${tab}`} aria-labelledby={`tab-${tab}`}>
          <h2 class="visually-hidden">{TAB_LABELS[tab]}</h2>
          {pane}
        </section>
      </div>
    </div>
  );
}