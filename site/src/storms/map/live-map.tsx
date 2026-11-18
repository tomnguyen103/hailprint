import type { FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fetchCounties, harrisFeature } from "../../county";
import { type ReportsFile, type SwathFile, type WarningsFile } from "../../data/types";
import { RULER } from "../../ruler";
import { ErrorState } from "../../shell/states";
import { useLoad } from "../../state/load";
import { useTheme } from "../../state/theme";
import "../../styles/map.css";
import { boundsOf } from "./geo";
import { RulerLegend } from "./ruler-legend";
import { useMap } from "./use-map";

const NO_BASEMAP = "No basemap file.";

interface Props {
  swath: SwathFile | null;
  reports: ReportsFile | null;
  warnings: WarningsFile | null;
}

/** The Live view map: rolling 24 h swath ramp, SPC reports, HGX warnings, metro county outlines, and the size ruler legend. */
export function LiveMap({ swath, reports, warnings }: Props) {
  const metro = useLoad("counties", fetchCounties);
  const { resolved: theme } = useTheme();
  const { container, handle, ready, basemap, error: mapError, retry: retryMap } = useMap(theme);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  const outlines: FeatureCollection<MultiPolygon> | null = metro.status === "ready" ? metro.data : null;
  const countyData = useMemo(() => (outlines !== null ? harrisFeature(outlines) : null), [outlines]);

  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setData(swath, reports, countyData);
  }, [ready, swath, reports, countyData]);

  useEffect(() => {
    if (ready) handle.current?.setCounties(outlines);
  }, [ready, outlines]);

  useEffect(() => {
    if (ready) handle.current?.setWarnings(warnings);
  }, [ready, warnings]);

  const swathRef = useRef(swath);
  swathRef.current = swath;
  const swathRunTime = swath?.receipt.run_time ?? null;
  useEffect(() => {
    if (!ready || !handle.current) return;
    const current = swathRef.current;
    handle.current.fit(current ? boundsOf(current) : null);
  }, [ready, swathRunTime]);

  useEffect(() => {
    if (!ready || !handle.current) return;
    for (const m of RULER) handle.current.setClassVisible(m.threshold_mm, !hidden.has(m.threshold_mm));
  }, [ready, hidden]);

  const toggleClass = (thresholdMm: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(thresholdMm)) next.delete(thresholdMm);
      else next.add(thresholdMm);
      return next;
    });
  };

  return (
    <div class="map-stage">
      <div
        ref={container}
        class="map-frame"
        role="region"
        aria-label="Live radar-estimated hail swath over Harris County"
        tabIndex={-1}
      />
      {mapError ? (
        <div class="map-overlay">
          <ErrorState error={mapError} onRetry={retryMap} />
        </div>
      ) : null}
      <div class="map-legends">
        <RulerLegend hidden={hidden} onToggle={toggleClass} />
      </div>
      {ready && !basemap ? <p class="map-note">{NO_BASEMAP}</p> : null}
    </div>
  );
}
