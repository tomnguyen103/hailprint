import { Fragment } from "preact";
import { fetchJson } from "../data/fetch";
import { guardPairs, guardReports } from "../data/guard";
import type { StormsIndex } from "../data/types";
import { InternetLegend, PowerLegend } from "../impact/power-fill";
import { pooledRows } from "../pool";
import { RULER, diameterPx } from "../ruler";
import { ContingencyGrid } from "../shell/contingency-grid";
import { ReceiptChip } from "../shell/receipt-chip";
import { EmptyState, ErrorState, LoadingState } from "../shell/states";
import { CELLS, cells } from "../stamp";
import { useLoad, type Load } from "../state/load";
import { useAllFiles, usePairsAll } from "../state/pairs-all";
import type { Block, FigureId } from "./content";
import { GuessReveal } from "./guess-reveal";
import "../styles/map.css";

const NO_INDEX = "No storm date is published yet.";
const INDEX_FILE = "storms.json";
/** The storm date the stamp figure draws; the newest storm date stands in when it is absent. */
const EXAMPLE_DATE = "2024-05-28";

type Index = Load<StormsIndex> & { showLoading: boolean; retry: () => void };

interface Props {
  blocks: Block[];
  index: Index;
}

/** Every block of a Method page in order; a figure draws from the published files. */
export function Blocks({ blocks, index }: Props) {
  return (
    <>
      {blocks.map((block, i) => (
        <Fragment key={i}>{render(block, index)}</Fragment>
      ))}
    </>
  );
}

function render(block: Block, index: Index) {
  switch (block.kind) {
    case "heading":
      return <h2>{block.text}</h2>;
    case "prose":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "code":
      return <pre class="code-block">{block.text}</pre>;
    case "caveat":
      return <p class="caveat">{block.text}</p>;
    case "figure":
      return <div class="figure">{figure(block.id, index)}</div>;
  }
}

/** The ruler and the fill bins need no data; every other figure waits for the index and never blocks the prose. */
function figure(id: FigureId, index: Index) {
  if (id === "ruler") return <Ruler />;
  if (id === "bins") return <Bins />;
  if (index.status === "error") return <ErrorState error={index.error} onRetry={index.retry} />;
  if (index.status === "loading") return index.showLoading ? <LoadingState file={INDEX_FILE} /> : null;
  if (index.data.storms.length === 0) return <EmptyState sentence={NO_INDEX} />;
  if (id === "receipt") return <Receipt index={index.data} />;
  if (id === "stamp") return <StampFigure index={index.data} />;
  if (id === "guess") return <GuessReveal index={index.data} />;
  return <GridFigure index={index.data} />;
}

function Receipt({ index }: { index: StormsIndex }) {
  const storm = index.storms[0]!;
  // the pairs cache: the Scoring figures read the same file, so one fetch serves both
  const pairs = useAllFiles([storm.files.pairs], guardPairs);
  if (pairs.status === "error") return <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  if (pairs.status === "loading") return pairs.showLoading ? <LoadingState file="pairs.json" /> : null;
  return (
    <p>
      Receipt of the newest storm date, <span class="mono">{storm.storm_date}</span>:{" "}
      <ReceiptChip receipt={pairs.data[0]!.receipt} file="pairs.json" />
    </p>
  );
}

function StampFigure({ index }: { index: StormsIndex }) {
  const storm = index.storms.find((s) => s.storm_date === EXAMPLE_DATE) ?? index.storms[0]!;
  const reports = useLoad(storm.files.reports, () => fetchJson(storm.files.reports, guardReports));
  if (reports.status === "error") return <ErrorState error={reports.error} onRetry={reports.retry} />;
  if (reports.status === "loading") return reports.showLoading ? <LoadingState file="reports.geojson" /> : null;
  const filled = cells(reports.data.features.map((f) => f.properties.time));
  const count = filled.filter(Boolean).length;
  return (
    <div class="stamp-figure">
      <span class="mono">{storm.storm_date}</span>
      <div class="stamp-bar" role="img" aria-label={`Storm window 12Z to 12Z, reports in ${count} of ${CELLS} hours`}>
        {filled.map((on, i) => (
          <span key={i} class="stamp-cell" data-on={on} />
        ))}
      </div>
      <div class="stamp-hours" aria-hidden="true">
        <span>12Z D</span>
        <span>00Z</span>
        <span>12Z D+1</span>
      </div>
    </div>
  );
}

/** The two fill legends as the map draws them: the colour of each bin beside its label. */
function Bins() {
  return (
    <div class="bins-figure">
      {PowerLegend({ fill: "power", source: "eaglei" })}
      {InternetLegend({ fill: "internet" })}
    </div>
  );
}

function Ruler() {
  return (
    <ul class="ruler-list" aria-label="Size classes">
      {RULER.map((mark, i) => (
        <li key={mark.threshold_mm} class="ruler-row">
          <span
            class="ruler-mark"
            style={{ width: diameterPx(mark.threshold_in), height: diameterPx(mark.threshold_in), background: `var(--hail-${i + 1})` }}
          />
          <span>
            <span class="mono">{mark.threshold_in.toFixed(2)} in</span> {mark.object}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GridFigure({ index }: { index: StormsIndex }) {
  const pairs = usePairsAll(index);
  if (pairs.status === "error") return <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  if (pairs.status === "loading") return pairs.showLoading ? <LoadingState file="pairs.json" /> : null;
  const pooled = pooledRows(pairs.data, index.radius_km_default);
  if ("error" in pooled) return <ErrorState error={pooled.error} onRetry={pairs.retry} />;
  const row = pooled.rows[0];
  return row ? <ContingencyGrid row={row} /> : <EmptyState sentence="No size class is scored yet." />;
}
