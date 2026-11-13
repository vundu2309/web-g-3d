import { boatPalettes, type BoatPalette } from "./palette.ts";

/**
 * How the Blender boat (public/models/boat.glb, tools/blender/boat.py) is painted per player and
 * turned into the game's axes. Pure, no Babylon: tests read it directly.
 *
 * The model is built in the colours of the first palette. Two of them are ROLES: the hull paint
 * (the hull and the wheelhouse's domed roof) and the trim (rubbing strip, roof rim, the outboard's
 * band, the pennant). Every vertex whose colour is exactly a role colour takes the player's colour
 * for that role; all other vertices keep theirs.
 */
export const BOAT_FILE = "boat.glb";

/** The root node of the file and its parts (each with a pivot of its own). */
export const BOAT_ROOT = "boat";
export const BOAT_PARTS = [
  "hull",
  "deck",
  "canopy",
  "engine",
  "flag",
  "lantern",
] as const;

/**
 * The file is written with the bow at glTF +Z (and the rod holder at x = -1.25, z = -2.52). The
 * sea's scene is right-handed, so the loader adds no flip and the bow would point to +Z; the
 * game's bow points to -Z with the rod holder at starboard (+X) of the stern (+Z). Turning the
 * model half a turn about Y does exactly that (x -> -x, z -> -z); it is baked into the vertices.
 */
export const BOAT_YAW = Math.PI;

/** The colours the file carries for the two roles: palette 0, by definition. */
export const BOAT_ROLES: Readonly<BoatPalette> = boatPalettes[0]!;

const channel = (value: number, shift: number) =>
  ((value >> shift) & 255) / 255;
/** Closer than half a byte counts as the same colour (the file stores whole bytes). */
const SAME = 0.5 / 255;

/** The role colour as three 0..1 channels. */
export const rgb = (value: number): [number, number, number] => [
  channel(value, 16),
  channel(value, 8),
  channel(value, 0),
];

/**
 * A copy of `colors` (RGBA, `stride` floats per vertex) with the hull and trim roles replaced
 * by the palette's colours. Everything else, and the alpha, is kept.
 */
export function paintBoat(
  colors: ArrayLike<number>,
  palette: BoatPalette,
  stride = 4,
): Float32Array {
  const out = Float32Array.from(colors);
  const roles: [number[], number[]][] = [
    [rgb(BOAT_ROLES.hull), rgb(palette.hull)],
    [rgb(BOAT_ROLES.trim), rgb(palette.trim)],
  ];
  for (let i = 0; i + 2 < out.length; i += stride)
    for (const [from, to] of roles)
      if (
        Math.abs(out[i]! - from[0]!) < SAME &&
        Math.abs(out[i + 1]! - from[1]!) < SAME &&
        Math.abs(out[i + 2]! - from[2]!) < SAME
      ) {
        out[i] = to[0]!;
        out[i + 1] = to[1]!;
        out[i + 2] = to[2]!;
        break;
      }
  return out;
}

/** How many vertices carry each role colour (for tests and for checking a file). */
export function countRoles(colors: ArrayLike<number>, stride = 4) {
  const count = { hull: 0, trim: 0 };
  const hull = rgb(BOAT_ROLES.hull);
  const trim = rgb(BOAT_ROLES.trim);
  const near = (i: number, c: number[]) =>
    Math.abs(colors[i]! - c[0]!) < SAME &&
    Math.abs(colors[i + 1]! - c[1]!) < SAME &&
    Math.abs(colors[i + 2]! - c[2]!) < SAME;
  for (let i = 0; i + 2 < colors.length; i += stride) {
    if (near(i, hull)) count.hull++;
    else if (near(i, trim)) count.trim++;
  }
  return count;
}
