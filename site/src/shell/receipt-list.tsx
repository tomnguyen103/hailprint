import type { ComponentChildren } from "preact";
import { Fragment } from "preact";
import type { Receipt } from "../data/types";

/** The receipt of one published file as a definition list. `extra` adds rows after Package. */
export function ReceiptList({ receipt, file, extra }: { receipt: Receipt; file: string; extra?: ComponentChildren }) {
  return (
    <dl class="receipt-list">
      <dt>File</dt>
      <dd class="mono">{file}</dd>
      <dt>Storm date</dt>
      <dd class="mono">{receipt.storm_date}</dd>
      {receipt.sources.map((s, i) => (
        <Fragment key={i}>
          <dt>Source</dt>
          <dd>
            <span class="mono">{s.source}</span>, {s.product}, <span class="mono">{s.file}</span>
          </dd>
        </Fragment>
      ))}
      <dt>Confidence</dt>
      <dd>{receipt.confidence}</dd>
      <dt>Run time</dt>
      <dd class="mono">{receipt.run_time}</dd>
      <dt>Package</dt>
      <dd class="mono">{receipt.package_version}</dd>
      {extra}
    </dl>
  );
}
