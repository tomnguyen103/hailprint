import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { HARRIS_FIPS } from "../data/constants";
import type { InternetFile, PowerFile, ReportsFile, WarningsFile } from "../data/types";
import { harrisPeak, internetSeries, powerSeries, reportTicks, warningBars } from "../impact/series";
import { href, replace } from "../router";
import "../styles/time.css";
import { LAST_STEP, STEPS_PER_HOUR, readout } from "./step";

const PLAY_MS = 400;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export type PlayStride = 1 | 4;

export interface EventJumpChip {
  id: "warning" | "report" | "power" | "internet";
  label: string;
  step: number;
}

/** Build ordered event jump chips for a storm date from loaded warnings, reports, power, and internet files. */
export function eventJumpChips(input: {
  date: string;
  warnings?: WarningsFile | null;
  reports?: ReportsFile | null;
  power?: PowerFile | null;
  internet?: InternetFile | null;
  fips?: string;
}): EventJumpChip[] {
  const chips: EventJumpChip[] = [];
  const bars = warningBars(input.warnings ?? null, input.date);
  if (bars.length > 0) {
    const earliest = Math.min(...bars.map((b) => Math.floor(b.from)));
    chips.push({
      id: "warning",
      label: "First warning",
      step: Math.min(LAST_STEP, Math.max(0, earliest)),
    });
  }
  const ticks = reportTicks(input.reports ?? null);
  if (ticks.length > 0) {
    chips.push({ id: "report", label: "First report", step: ticks[0]!.step });
  }
  const fips = input.fips ?? HARRIS_FIPS;
  const pStep = input.fips
    ? (powerSeries(input.power ?? null, fips)?.peakStep ?? null)
    : harrisPeak(input.power ?? null);
  if (pStep !== null) {
    chips.push({ id: "power", label: "Peak power out", step: pStep });
  }
  const iStep = internetSeries(input.internet ?? null, fips)?.lowStep ?? null;
  if (iStep !== null) {
    chips.push({ id: "internet", label: "Internet trough", step: iStep });
  }
  return chips;
}

/** A slider value as a whole step inside the window; null for NaN. */
export function clampStep(value: number): number | null {
  if (Number.isNaN(value)) return null;
  return Math.min(LAST_STEP, Math.max(0, Math.round(value)));
}

const bound = (value: number): number => Math.min(LAST_STEP, Math.max(0, value));

/** The step a key moves to, or null for a key the slider ignores. */
export function keyStep(key: string, step: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return bound(step + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return bound(step - 1);
    case "PageUp":
      return bound(step + STEPS_PER_HOUR);
    case "PageDown":
      return bound(step - STEPS_PER_HOUR);
    case "Home":
      return 0;
    case "End":
      return LAST_STEP;
    default:
      return null;
  }
}

/** A slider move rewrites the current history entry, so Back leaves the map. */
export function replaceStep(date: string, step: number): void {
  replace(href({ area: "storms", date, tab: "map", step }));
}

export interface PlayerPorts {
  step(): number;
  move(step: number): void;
  playing(on: boolean): void;
  reduced(): boolean;
  stride?: () => PlayStride;
}

/** Play advances by stride (default one hour) every 400 ms and stops at the last step. Reduced motion has no timer. */
export function createPlayer(ports: PlayerPorts): { toggle(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    ports.playing(false);
  }

  function stepSize(): number {
    return ports.stride ? ports.stride() : STEPS_PER_HOUR;
  }

  function toggle(): void {
    if (timer !== null) return stop();
    const at = ports.step();
    const delta = stepSize();
    if (ports.reduced()) return ports.move(at >= LAST_STEP ? 0 : bound(at + delta));
    if (at >= LAST_STEP) ports.move(0);
    ports.playing(true);
    timer = setInterval(() => {
      const next = bound(ports.step() + stepSize());
      ports.move(next);
      if (next === LAST_STEP) stop();
    }, PLAY_MS);
  }

  return { toggle, stop };
}

interface ViewProps {
  date: string;
  step: number;
  playLabel: string;
  stride?: PlayStride;
  onStride?: (stride: PlayStride) => void;
  jumps?: readonly EventJumpChip[];
  onStep: (step: number) => void;
  onStop: () => void;
  onPlay: () => void;
}

/** The stateless markup: a play button, the range, the two-zone readout, stride toggle, and event jump chips. */
export function SliderView({
  date,
  step,
  playLabel,
  stride = 4,
  onStride,
  jumps,
  onStep,
  onStop,
  onPlay,
}: ViewProps) {
  const time = readout(date, step);
  return (
    <div class="time-slider">
      <button type="button" class="button time-play" onClick={onPlay}>
        {playLabel}
      </button>
      <input
        class="time-range"
        type="range"
        min={0}
        max={LAST_STEP}
        step={1}
        value={step}
        aria-label="Map time"
        aria-valuetext={time.text}
        onInput={(event) => {
          const next = clampStep(event.currentTarget.valueAsNumber);
          if (next === null) return;
          onStop();
          onStep(next);
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const next = keyStep(event.key, step);
          if (next === null) return;
          event.preventDefault();
          onStop();
          onStep(next);
        }}
      />
      <div class="time-footer">
        <p class="time-readout mono">
          <span>{time.utc}</span>
          <span>{time.local}</span>
        </p>
        {onStride ? (
          <div class="time-stride" role="group" aria-label="Playback stride">
            <button
              type="button"
              class="button button-small"
              aria-pressed={stride === 1}
              onClick={() => onStride(1)}
            >
              15m
            </button>
            <button
              type="button"
              class="button button-small"
              aria-pressed={stride === 4}
              onClick={() => onStride(4)}
            >
              1h
            </button>
          </div>
        ) : null}
        {jumps && jumps.length > 0 ? (
          <div class="time-jumps" role="group" aria-label="Jump to storm event">
            {jumps.map((chip) => (
              <button
                key={chip.id}
                type="button"
                class="button button-small time-jump-chip"
                aria-pressed={step === chip.step}
                onClick={() => {
                  onStop();
                  onStep(chip.step);
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface Props {
  date: string;
  step: number;
  jumps?: readonly EventJumpChip[];
  onStep: (step: number) => void;
}

export function TimeSlider({ date, step, jumps, onStep }: Props) {
  const [playing, setPlaying] = useState(false);
  const [stride, setStride] = useState<PlayStride>(4);
  // The player reads the newest step, stride, and handler from refs: its timer outlives each render.
  const live = useRef(step);
  const strideRef = useRef<PlayStride>(stride);
  const handler = useRef(onStep);
  live.current = step;
  strideRef.current = stride;
  handler.current = onStep;
  const player = useMemo(
    () =>
      createPlayer({
        step: () => live.current,
        move: (next) => {
          live.current = next;
          handler.current(next);
        },
        playing: setPlaying,
        reduced: () => window.matchMedia(REDUCED_MOTION).matches,
        stride: () => strideRef.current,
      }),
    [],
  );
  useEffect(() => player.stop, [player]);

  const reduced = window.matchMedia(REDUCED_MOTION).matches;
  const playLabel = reduced ? (stride === 1 ? "Next 15m" : "Next hour") : playing ? "Pause" : "Play";
  return (
    <SliderView
      date={date}
      step={step}
      playLabel={playLabel}
      stride={stride}
      onStride={setStride}
      jumps={jumps}
      onStep={onStep}
      onStop={player.stop}
      onPlay={player.toggle}
    />
  );
}
