import { useState } from "preact/hooks";
import "../styles/storms.css";
import { HARRIS_FIPS } from "../data/constants";
import { fetchJson } from "../data/fetch";
import { guardInternet, guardPower, guardReports } from "../data/guard";
import type { InternetFile, PowerFile, Receipt, Storm, StormsIndex } from "../data/types";
import { harrisPeak } from "../impact/power";
import { TABS, TAB_LABELS, href, type Tab } from "../router";
import { SubTabs } from "../shell/sub-tabs";
import { useLoad } from "../state/load";
import { useStep } from "../time/use-step";
import { DataPane } from "./data-pane";
import { MapPane } from "./map-pane";
import { ParcelsPane } from "./parcels-pane";
import { ScopeSidebar } from "./scope-sidebar";
import { ScorePane } from "./score-pane";
import { Stamp } from "./stamp";

interface Props {
  index: StormsIndex;
  storm: Storm;
  tab: Tab;
}

export function Workspace({ index, storm, tab }: Props) {
  const [datesOpen, setDatesOpen] = useState(false);
  // The county of the power strip lives here, apart from the step and the play state: a pick moves neither.
  const [fips, setFips] = useState<string>(HARRIS_FIPS);
  const powerFile = storm.files.power;
  const power = useLoad<PowerFile | null>(powerFile ?? "power:none", () =>
    powerFile === null ? Promise.resolve(null) : fetchJson(powerFile, guardPower),
  );
  const internetFile = storm.files.internet;
  const internet = useLoad<InternetFile | null>(internetFile ?? "internet:none", () =>
    internetFile === null ? Promise.resolve(null) : fetchJson(internetFile, guardInternet),
  );
  // The map opens at the Harris power peak when the file is valid; a failed file leaves step 48.
  const { step, setStep } = useStep(storm.storm_date, harrisPeak(power.status === "ready" ? power.data : null));
  const reports = useLoad(storm.files.reports, () => fetchJson(storm.files.reports, guardReports));
  const indexReceipt: Receipt = {
    storm_date: storm.storm_date,
    sources: [],
    confidence: index.confidence,
    run_time: index.run_time,
    package_version: index.package_version,
  };

  let pane;
  if (tab === "map") {
    pane = (
      <MapPane storm={storm} reports={reports} power={power} internet={internet} step={step} onStep={setStep} fips={fips} onCounty={setFips} />
    );
  }
  else if (tab === "parcels") pane = <ParcelsPane storm={storm} />;
  else if (tab === "score") pane = <ScorePane storm={storm} radiusKm={index.radius_km_default} />;
  else pane = <DataPane storm={storm} power={power} internet={internet} fips={fips} />;

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
        <Stamp
          storm={storm}
          reports={reports}
          step={tab === "map" ? step : null}
          indexReceipt={indexReceipt}
          onOpenDates={() => setDatesOpen(true)}
        />
        <SubTabs
          label="Storm panes"
          tabs={TABS.map((t) => ({ id: t, label: TAB_LABELS[t], href: href({ area: "storms", date: storm.storm_date, tab: t }) }))}
          selected={tab}
        />
        <section class="pane" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          <h2 class="visually-hidden">{TAB_LABELS[tab]}</h2>
          {pane}
        </section>
      </div>
    </div>
  );
}