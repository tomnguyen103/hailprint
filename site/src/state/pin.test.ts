import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  METRO_PRESETS,
  clearPin,
  getPinState,
  locateUser,
  resetPinStore,
  setPin,
  setPinRadiusKm,
  setPresetPin,
} from "./pin";

beforeEach(() => {
  resetPinStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pin store presets and manual coordinates (US-01.4)", () => {
  it("sets benchmark preset pins from METRO_PRESETS and updates radiusKm", () => {
    expect(METRO_PRESETS).toHaveLength(6);
    expect(setPresetPin("memorial")).toBe(true);
    const state = getPinState();
    expect(state.pin?.lngLat).toEqual([-95.5297, 29.7752]);
    expect(state.pin?.source).toBe("preset");
    expect(state.pin?.label).toBe("Memorial (77024)");

    setPinRadiusKm(12);
    expect(getPinState().radiusKm).toBe(12);

    clearPin();
    expect(getPinState().pin).toBeNull();
  });
});

describe("locateUser geolocation lifecycle and error handling (US-01.4, US-01.5)", () => {
  it("transitions idle -> locating -> ready on valid Metro GPS and ignores duplicate calls while locating", async () => {
    let successCb: ((pos: GeolocationPosition) => void) | null = null;
    const getCurrentPosition = vi.fn((onSuccess: (pos: GeolocationPosition) => void) => {
      successCb = onSuccess;
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    expect(getPinState().geoStatus).toBe("idle");
    const p1 = locateUser();
    expect(getPinState().geoStatus).toBe("locating");

    // Rapid second invocation while locating must not call getCurrentPosition again
    const p2 = locateUser();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    successCb!({
      coords: { latitude: 29.7604, longitude: -95.3698, accuracy: 18 } as GeolocationCoordinates,
      timestamp: Date.now(),
      toJSON: () => ({}),
    });
    await Promise.all([p1, p2]);

    const finalState = getPinState();
    expect(finalState.geoStatus).toBe("ready");
    expect(finalState.pin).toEqual({
      lngLat: [-95.3698, 29.7604],
      source: "gps",
      label: "Current GPS location",
      accuracyM: 18,
    });
  });

  it("rejects coordinates outside METRO_BBOX with reason outside-metro without clearing an existing manual pin", async () => {
    setPin([-95.3698, 29.7604], "manual");
    const getCurrentPosition = vi.fn((onSuccess: (pos: GeolocationPosition) => void) => {
      onSuccess({
        coords: { latitude: 32.7767, longitude: -96.797, accuracy: 25 } as GeolocationCoordinates,
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await locateUser();
    const state = getPinState();
    expect(state.geoStatus).toBe("error");
    expect(state.reason).toBe("outside-metro");
    expect(state.pin?.lngLat).toEqual([-95.3698, 29.7604]);
  });

  it("maps Geolocation error codes 1, 2, 3 to denied, unavailable, timeout and missing API to unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await locateUser();
    expect(getPinState().geoStatus).toBe("error");
    expect(getPinState().reason).toBe("unsupported");

    const cases: Array<[number, "denied" | "unavailable" | "timeout"]> = [
      [1, "denied"],
      [2, "unavailable"],
      [3, "timeout"],
    ];
    for (const [code, expectedReason] of cases) {
      resetPinStore();
      setPin([-95.5297, 29.7752], "manual");
      vi.stubGlobal("navigator", {
        geolocation: {
          getCurrentPosition: (_ok: unknown, onErr: (err: GeolocationPositionError) => void) => {
            onErr({ code, message: "failed", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          },
        },
      });
      await locateUser();
      const state = getPinState();
      expect(state.geoStatus).toBe("error");
      expect(state.reason).toBe(expectedReason);
      expect(state.pin?.lngLat).toEqual([-95.5297, 29.7752]);
    }
  });

  it("cancels in-flight locateUser when setPin or clearPin is called, resetting geoStatus to idle and ignoring late GPS callbacks", async () => {
    let successCb: ((pos: GeolocationPosition) => void) | null = null;
    let errorCb: ((err: GeolocationPositionError) => void) | null = null;
    const getCurrentPosition = vi.fn(
      (onSuccess: (pos: GeolocationPosition) => void, onError: (err: GeolocationPositionError) => void) => {
        successCb = onSuccess;
        errorCb = onError;
      },
    );
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const p1 = locateUser();
    expect(getPinState().geoStatus).toBe("locating");

    setPin(METRO_PRESETS[0]!.lngLat, "preset");
    expect(getPinState().geoStatus).toBe("idle");
    expect(getPinState().pin?.lngLat).toEqual(METRO_PRESETS[0]!.lngLat);
    expect(getPinState().pin?.source).toBe("preset");

    // Late GPS callback must not overwrite the preset pin
    successCb!({
      coords: { latitude: 29.9691, longitude: -95.6972, accuracy: 12 } as GeolocationCoordinates,
      timestamp: Date.now(),
      toJSON: () => ({}),
    });
    await p1;
    expect(getPinState().geoStatus).toBe("idle");
    expect(getPinState().pin?.lngLat).toEqual(METRO_PRESETS[0]!.lngLat);
    expect(getPinState().pin?.source).toBe("preset");

    // Also test clearPin while locateUser is pending
    const p2 = locateUser();
    expect(getPinState().geoStatus).toBe("locating");
    clearPin();
    expect(getPinState().geoStatus).toBe("idle");
    expect(getPinState().pin).toBeNull();

    errorCb!({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    await p2;
    expect(getPinState().geoStatus).toBe("idle");
    expect(getPinState().reason).toBeNull();
    expect(getPinState().pin).toBeNull();
  });
});
