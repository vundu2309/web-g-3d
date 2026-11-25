import { PAL } from "./art/colors.ts";

/**
 * The seaplanes' lights at night, as plain numbers (no Babylon, so tests read them directly):
 * the red and green wing-tip lights of any aircraft (red on the LEFT, the port side; green on the
 * RIGHT), a steady white tail light and a white strobe on the fin that flashes briefly. Each shows
 * as a soft glow that always faces the camera (plane-glow.ts), lit from dusk to dawn with the
 * same level as the lighthouse (`beaconLevel`).
 *
 * Local axes are the plane's: the nose points to -Z, +X is its right, +Y up.
 */
export interface NavLight {
  name: "port" | "starboard" | "tail" | "strobe";
  /** Where it sits on the plane (m). */
  local: readonly [number, number, number];
  color: number;
  /** Flashes instead of shining steadily. */
  flashes: boolean;
}

export const NAV_LIGHTS: readonly NavLight[] = [
  {
    name: "port",
    local: [-5.6, 1.0, -0.7],
    color: PAL.paint.red,
    flashes: false,
  },
  {
    name: "starboard",
    local: [5.6, 1.0, -0.7],
    color: PAL.paint.green,
    flashes: false,
  },
  {
    name: "tail",
    local: [0, 0.6, 4.7],
    color: PAL.paint.white,
    flashes: false,
  },
  {
    name: "strobe",
    local: [0, 1.95, 4.0],
    color: PAL.paint.white,
    flashes: true,
  },
];

/** The strobe flashes for `on` seconds out of every `period`. */
export const STROBE = { period: 1.4, on: 0.14 } as const;
export const strobeOn = (time: number) =>
  ((time % STROBE.period) + STROBE.period) % STROBE.period < STROBE.on;

/** Below this night level the lights are off (and not drawn at all). */
export const LIGHTS_MIN_LEVEL = 0.03;
/** A glow is never smaller than this (m), and grows with distance so it stays about as big on the screen (radius in radians). */
export const GLOW_MIN = 0.9;
export const GLOW_ANGLE = 0.014;
export const glowSize = (distance: number) =>
  Math.max(GLOW_MIN, distance * GLOW_ANGLE);
