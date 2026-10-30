// Ephemeral in-memory location pin store shared across `/try/point` and `/storms/<date>/map`.
// Never writes coordinates to localStorage, cookies, or URL query parameters.
import { useEffect, useState } from "preact/hooks";
import { METRO_BBOX, contains } from "../county";

export type PinSource = "gps" | "manual" | "map" | "preset";

export type GeoFailureReason = "unsupported" | "denied" | "unavailable" | "timeout" | "outside-metro";

export type GeoStatusName = "idle" | "locating" | "ready" | "error";

export interface MetroPreset {
  id: string;
  label: string;
  zip: string;
  lngLat: [number, number];
}

export const METRO_PRESETS: readonly MetroPreset[] = [
  { id: "downtown", label: "Downtown (77002)", zip: "77002", lngLat: [-95.3698, 29.7604] },
  { id: "memorial", label: "Memorial (77024)", zip: "77024", lngLat: [-95.518, 29.785] },
  { id: "cypress", label: "Cypress (77433)", zip: "77433", lngLat: [-95.698, 29.969] },
  { id: "kingwood", label: "Kingwood (77339)", zip: "77339", lngLat: [-95.186, 30.056] },
  { id: "katy", label: "Katy (77494)", zip: "77494", lngLat: [-95.824, 29.742] },
  { id: "woodlands", label: "The Woodlands (77380)", zip: "77380", lngLat: [-95.461, 30.165] },
] as const;

export const DEFAULT_PIN_RADIUS_KM = 5;
export const MIN_PIN_RADIUS_KM = 1;
export const MAX_PIN_RADIUS_KM = 20;

export interface Pin {
  lngLat: [number, number];
  source: PinSource;
  label?: string;
  accuracyM?: number | null;
}

export interface PinState {
  pin: Pin | null;
  radiusKm: number;
  geoStatus: GeoStatusName;
  reason: GeoFailureReason | null;
  message: string | null;
}

const INITIAL_STATE: PinState = {
  pin: null,
  radiusKm: DEFAULT_PIN_RADIUS_KM,
  geoStatus: "idle",
  reason: null,
  message: null,
};

let state: PinState = INITIAL_STATE;

let activeLocatePromise: Promise<PinState> | null = null;
let locateEpoch = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

function setGeoFailure(reason: GeoFailureReason, message: string): PinState {
  state = {
    ...state,
    geoStatus: "error",
    reason,
    message,
  };
  notify();
  return state;
}

export function getPinState(): PinState {
  return state;
}

export function setPin(
  input: [number, number] | Pin,
  sourceOrOptions?: PinSource | { source?: PinSource; label?: string; accuracyM?: number | null },
): boolean {
  const isTuple = Array.isArray(input);
  const lngLat: [number, number] = isTuple ? [input[0], input[1]] : [input.lngLat[0], input.lngLat[1]];
  const opts =
    typeof sourceOrOptions === "string"
      ? { source: sourceOrOptions }
      : sourceOrOptions ?? (isTuple ? {} : { source: input.source, label: input.label, accuracyM: input.accuracyM });
  const source: PinSource = opts.source ?? (isTuple ? "manual" : input.source);
  if (source !== "gps") {
    locateEpoch += 1;
    activeLocatePromise = null;
  }
  if (!Number.isFinite(lngLat[0]) || !Number.isFinite(lngLat[1]) || !contains(METRO_BBOX, lngLat)) {
    if (source !== "gps" && state.geoStatus !== "idle") {
      state = { ...state, geoStatus: "idle" };
      notify();
    }
    return false;
  }
  const label = opts.label ?? (!isTuple ? input.label : undefined);
  const accuracyM = opts.accuracyM ?? (!isTuple ? input.accuracyM : undefined);

  const nextPin: Pin = {
    lngLat,
    source,
    ...(label !== undefined ? { label } : {}),
    ...(accuracyM !== undefined ? { accuracyM } : {}),
  };
  state = {
    ...state,
    pin: nextPin,
    geoStatus: source === "gps" ? "ready" : "idle",
    reason: null,
    message: null,
  };
  notify();
  return true;
}

export function clearPin(): void {
  locateEpoch += 1;
  activeLocatePromise = null;
  state = { ...INITIAL_STATE, radiusKm: state.radiusKm };
  notify();
}

export function setPinRadiusKm(radiusKm: number): void {
  if (!Number.isFinite(radiusKm)) return;
  const clamped = Math.max(MIN_PIN_RADIUS_KM, Math.min(MAX_PIN_RADIUS_KM, Math.round(radiusKm)));
  if (clamped === state.radiusKm) return;
  state = { ...state, radiusKm: clamped };
  notify();
}

export function setPresetPin(id: string): boolean {
  const preset = METRO_PRESETS.find((p) => p.id === id || p.zip === id || p.label === id);
  if (!preset) return false;
  return setPin(preset.lngLat, { source: "preset", label: preset.label });
}

export function locateUser(): Promise<PinState> {
  if (state.geoStatus === "locating" && activeLocatePromise !== null) {
    return activeLocatePromise;
  }
  const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (!geo || typeof geo.getCurrentPosition !== "function") {
    return Promise.resolve(
      setGeoFailure("unsupported", "Browser geolocation is not available in this environment."),
    );
  }

  const epoch = ++locateEpoch;
  state = {
    ...state,
    geoStatus: "locating",
    reason: null,
    message: null,
  };
  notify();

  const promise = new Promise<PinState>((resolve) => {
    geo.getCurrentPosition(
      (pos) => {
        if (epoch !== locateEpoch) {
          resolve(state);
          return;
        }
        activeLocatePromise = null;
        const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const accuracyM = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
        if (!contains(METRO_BBOX, lngLat)) {
          resolve(
            setGeoFailure(
              "outside-metro",
              "Your GPS location is outside the 8-county Houston Metro area. Pick a Metro preset or enter coordinates.",
            ),
          );
          return;
        }
        setPin(lngLat, { source: "gps", label: "Current GPS location", accuracyM });
        resolve(state);
      },
      (err) => {
        if (epoch !== locateEpoch) {
          resolve(state);
          return;
        }
        activeLocatePromise = null;
        if (err.code === 1) {
          resolve(
            setGeoFailure("denied", "Location permission was denied. Enter coordinates or pick a Metro preset."),
          );
        } else if (err.code === 3) {
          resolve(setGeoFailure("timeout", "Location request timed out. Try again or pick a Metro preset."));
        } else {
          resolve(
            setGeoFailure("unavailable", "Current location is unavailable. Enter coordinates or pick a Metro preset."),
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });

  activeLocatePromise = promise;
  return promise;
}

export function resetPinStore(): void {
  locateEpoch += 1;
  activeLocatePromise = null;
  state = INITIAL_STATE;
  notify();
}

export function usePin() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    ...state,
    setPin,
    clearPin,
    setPinRadiusKm,
    setPresetPin,
    locateUser,
  };
}
