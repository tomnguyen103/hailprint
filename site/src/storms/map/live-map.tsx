import type { FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fetchCounties, harrisFeature } from "../../county";
import { DataError, type ReportsFile, type SwathFile, type WarningsFile } from "../../data/types";
import { RULER } from "../../ruler";
import { ErrorState } from "../../shell/states";
import { useLoad } from "../../state/load";
import { useTheme } from "../../state/theme";
import "../../styles/map.css";
import type { MapHandle } from "./create-map";
import { boundsOf } from "./geo";
import { RulerLegend } from "./ruler-legend";

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
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState<{ basemap: boolean } | null>(null);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    let created: MapHandle | null = null;
    setMapError(null);
    import("./create-map")
      .then(async ({ createMap }) => {
        const next = await createMap(node, theme);
        if (!live) {
          next.destroy();
          return;
        }
        created = next;
        handle.current = next;
        setReady({ basemap: next.basemap });
      })
      .catch((error: unknown) => {
        if (live) setMapError(new DataError("map", String(error)));
      });
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            handle.current?.map.resize();
          })
        : null;
    observer?.observe(node);
    return () => {
      live = false;
      observer?.disconnect();
      created?.destroy();
      handle.current = null;
      setReady(null);
    };
  }, [attempt]);

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

  const swathRunTime = swath?.receipt.run_time ?? null;
  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.fit(swath ? boundsOf(swath) : null);
    // Re-fit only when the map becomes ready or the swath valid time changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, swathRunTime]);

  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);

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
    <div class="map-stage live-map-stage">
      <div
        ref={container}
        class="map-frame"
        role="region"
        aria-label="Live radar-estimated hail swath over Harris County"
        tabIndex={0}
      />
      {mapError ? (
        <div class="map-overlay">
          <ErrorState error={mapError} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      ) : null}
      <div class="map-legends">
        <RulerLegend hidden={hidden} onToggle={toggleClass} />
      </div>
      {ready && !ready.basemap ? <p class="map-note">{NO_BASEMAP}</p> : null}
    </div>
  );
}
