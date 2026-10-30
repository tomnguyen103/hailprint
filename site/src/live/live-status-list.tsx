import { formatCount } from "../format";
import type { LiveStatusResult } from "./live-check";

export function LiveStatusList({
  data,
  onRetry,
  className = "receipt-list",
}: {
  data: LiveStatusResult;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <dl class={className}>
      <dt>NWS active alerts</dt>
      <dd>
        {data.alerts.status === "error" ? (
          <>
            {data.alerts.message}{" "}
            <button type="button" class="button button-small" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : data.alerts.alerts.length === 0 ? (
          "0 active alerts at pinned point"
        ) : (
          data.alerts.alerts.map((a) => `${a.event} (${a.severity})`).join(" \u00b7 ")
        )}
      </dd>
      <dt>ORNL ODIN utility outages</dt>
      <dd>
        {data.power.status === "error" ? (
          <>
            {data.power.message}{" "}
            <button type="button" class="button button-small" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : (
          <>
            <span class="mono">{formatCount(data.power.customersOut)}</span> customers out (
            {data.power.note})
          </>
        )}
      </dd>
      <dt>IODA internet reachability</dt>
      <dd>
        {data.internet.status === "error" ? (
          <>
            {data.internet.message}{" "}
            <button type="button" class="button button-small" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : data.internet.latestValue === null ? (
          "no recent county signal points (last 2h)"
        ) : (
          <>
            <span class="mono">{formatCount(Math.round(data.internet.latestValue))}</span> active
            /24 blocks (<span class="mono">{data.internet.pointCount}</span> points in last 2h)
          </>
        )}
      </dd>
    </dl>
  );
}
