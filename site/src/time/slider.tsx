import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { href, replace } from "../router";
import "../styles/time.css";
import { LAST_STEP, readout } from "./step";

const HOUR = 4;
const PLAY_MS = 400;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

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
      return bound(step + HOUR);
    case "PageDown":
      return bound(step - HOUR);
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
}

/** Play advances one hour every 400 ms and stops at the last step. Reduced motion has no timer. */
export function createPlayer(ports: PlayerPorts): { toggle(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    ports.playing(false);
  }

  function toggle(): void {
    if (timer !== null) return stop();
    const at = ports.step();
    if (ports.reduced()) return ports.move(at >= LAST_STEP ? 0 : bound(at + HOUR));
    if (at >= LAST_STEP) ports.move(0);
    ports.playing(true);
    timer = setInterval(() => {
      const next = bound(ports.step() + HOUR);
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
  onStep: (step: number) => void;
  onStop: () => void;
  onPlay: () => void;
}

/** The stateless markup: a play button, the range, and the two-zone readout. */
export function SliderView({ date, step, playLabel, onStep, onStop, onPlay }: ViewProps) {
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
      <p class="time-readout mono">
        <span>{time.utc}</span>
        <span>{time.local}</span>
      </p>
    </div>
  );
}

interface Props {
  date: string;
  step: number;
  onStep: (step: number) => void;
}

export function TimeSlider({ date, step, onStep }: Props) {
  const [playing, setPlaying] = useState(false);
  // The player reads the newest step and handler from refs: its timer outlives each render.
  const live = useRef(step);
  const handler = useRef(onStep);
  live.current = step;
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
      }),
    [],
  );
  useEffect(() => player.stop, [player]);

  const playLabel = window.matchMedia(REDUCED_MOTION).matches ? "Next hour" : playing ? "Pause" : "Play";
  return <SliderView date={date} step={step} playLabel={playLabel} onStep={onStep} onStop={player.stop} onPlay={player.toggle} />;
}
