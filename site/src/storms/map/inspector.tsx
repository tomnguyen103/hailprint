import type { Feature, Point } from "geojson";
import { useEffect, useRef } from "preact/hooks";
import type { Receipt, ReportProps } from "../../data/types";
import { objectName } from "../../ruler";
import { ReceiptChip } from "../../shell/receipt-chip";
import { BELOW_FIRST_CLASS } from "../../format";

export interface Pick {
  lngLat: [number, number];
  coveringMm: number | null;
  nearest: { feature: Feature<Point, ReportProps>; km: number } | null;
}

interface Props {
  pick: Pick;
  receipt: Receipt;
  onClose: () => void;
}

/** The point inspector. Escape and Close call `onClose`; the caller returns focus. */
export function Inspector({ pick, receipt, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [lon, lat] = pick.lngLat;
  const covering =
    pick.coveringMm === null ? BELOW_FIRST_CLASS : `${objectName(pick.coveringMm)}, ${(pick.coveringMm / 25.4).toFixed(2)} in`;
  return (
    <div ref={panel} class="inspector" role="dialog" aria-labelledby="inspector-title" tabIndex={-1}>
      <div class="inspector-head">
        <h2 id="inspector-title">Point</h2>
        <button type="button" class="button button-small" onClick={onClose}>
          Close
        </button>
      </div>
      <dl class="receipt-list">
        <dt>Position</dt>
        <dd class="mono">
          {lat.toFixed(4)}, {lon.toFixed(4)}
        </dd>
        <dt>Radar-estimated size</dt>
        <dd>{covering}</dd>
        <dt>Nearest report</dt>
        <dd>
          {pick.nearest === null ? (
            "none"
          ) : (
            <>
              {pick.nearest.feature.properties.location}, <span class="mono">{pick.nearest.feature.properties.size_in.toFixed(2)} in</span>,{" "}
              <span class="mono">{pick.nearest.km.toFixed(1)} km</span>
            </>
          )}
        </dd>
        <dt>Receipt</dt>
        <dd>
          <ReceiptChip receipt={receipt} file="swath.geojson" />
        </dd>
      </dl>
    </div>
  );
}