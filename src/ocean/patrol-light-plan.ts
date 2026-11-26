/**
 * The patrol ships' lights, as numbers (no Babylon: tests/patrol-lights.test.mjs pins them, and the
 * model's positions against `public/models/boat-patrol.glb`). The scene draws them in
 * `patrol-lights.ts`:
 *
 *  - the light bar's two lenses (a blue one to starboard, a red one to port, colours of their own
 *    in the model) flash one after the other, twice each, from dusk to dawn, with a halo round each;
 *    by day they are a steady glass;
 *  - the mast lantern has a warm halo;
 *  - the searchlights lay a wedge of light on the sea ahead that swings slowly from side to side.
 *
 * Everything follows the shared atmosphere (`beaconLevel`: dusk to dawn, dimmer in rain and mist) and
 * is off by day. With reduced motion the lenses are a steady glow and the wedge stays ahead.
 * Positions are in the boat's space (the model is already placed there; the bow is -z).
 */
export const PATROL_LIGHTS = {
  blue: { x: 0.26, y: 2.61, z: -2.0 },
  red: { x: -0.26, y: 2.61, z: -2.0 },
  mast: { x: 0, y: 4.7, z: 0.1 },
  search: { x: 0, y: 2.67, z: -2.55 },
} as const;

/** Seconds for one round of flashes: blue twice, then red twice. */
export const FLASH_PERIOD = 0.9;
/** The flash of each lens (0..1) as fractions of the period: two bursts each, red half a period after blue. */
const BURSTS = {
  blue: [
    [0.0, 0.1],
    [0.16, 0.26],
  ],
  red: [
    [0.5, 0.6],
    [0.66, 0.76],
  ],
} as const;
/** A burst's rise and fall, as a fraction of the period. */
const EDGE = 0.02;

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How bright each lens is flashing at `time` seconds (0 dark, 1 full). */
export function flash(time: number): { blue: number; red: number } {
  const t = (((time / FLASH_PERIOD) % 1) + 1) % 1;
  const level = (bursts: readonly (readonly [number, number])[]) =>
    Math.max(
      ...bursts.map(
        ([from, to]) =>
          smooth(from, from + EDGE, t) * (1 - smooth(to - EDGE, to, t)),
      ),
    );
  return { blue: level(BURSTS.blue), red: level(BURSTS.red) };
}

/** A lens's glass by day is this bright (a steady colour), and between flashes at night this much of it. */
export const LENS_DAY = 0.55;
export const LENS_DARK = 0.12;
/** The brightness a lens glows with: the steady day glass in daylight, the flashing one at night (`night` 0..1). */
export function lensGlow(flashing: number, night: number): number {
  const lit = LENS_DARK + (1 - LENS_DARK) * flashing;
  return LENS_DAY + (lit - LENS_DAY) * Math.min(1, Math.max(0, night));
}

/** The searchlights' wedge on the sea: its length and its width at the ship and at the far end (m), the height above the waterline it lies at, and how it swings. */
export const SEARCH = {
  length: 70,
  near: 1.4,
  far: 24,
  height: 0.3,
  /** The swing (rad each side of the bow) and its rate (rad/s). */
  sweep: 0.5,
  rate: 0.45,
} as const;

/** The angle of the wedge from the bow at `time`; each ship has its own `phase` (0..1) so they do not swing together. */
export function searchAngle(time: number, phase: number): number {
  return SEARCH.sweep * Math.sin(time * SEARCH.rate + phase * Math.PI * 2);
}

/**
 * The wedge as a flat strip (a trapezoid) from the searchlight along -z, uv.x from 0 at the ship to 1 at
 * the far end and uv.y across (0.5 in the middle), in the layout the beacon's beam shader reads.
 */
export function searchWedge() {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const t of [0, 1]) {
    const width = SEARCH.near + t * (SEARCH.far - SEARCH.near);
    for (const side of [-1, 1]) {
      positions.push((side * width) / 2, SEARCH.height, -t * SEARCH.length);
      uvs.push(t, side * 0.5 + 0.5);
    }
  }
  // The material draws both faces, so the winding does not matter.
  return { positions, uvs, indices: [0, 2, 1, 1, 2, 3] };
}

/**
 * How far a ship's lights reach (m) and how they thin out, never cut in one frame: the searchlight's
 * wedge lies on the sea and is drawn within `LIGHT_RANGE`, thinning over the last `WEDGE_BAND`; the
 * halos of the light bar and the mast lantern, the lights a ship at night is seen by from far, are
 * drawn within `HALO_RANGE`, thinning over the last `HALO_BAND` (the taper is
 * `distanceAmount` in distance-fade.ts).
 */
export const LIGHT_RANGE = 380;
export const WEDGE_BAND = 120;
export const HALO_RANGE = 1100;
export const HALO_BAND = 300;
/**
 * A halo is never smaller on the screen than this (radians of its radius): a 2.4 m halo is under a
 * pixel from 400 m, so past that it is made larger with the distance, as a distant light is.
 */
export const HALO_ANGLE = 0.011;
/** The scale to give a halo whose own size is `size` m, at `distance` m, on a parent scaled `base` (never below `base`). */
export const haloScale = (size: number, distance: number, base: number) =>
  Math.max(base, (2 * HALO_ANGLE * distance) / size);
