/**
 * The boat colours and which one a player gets (from the account id, so it is the same
 * for everyone and on every device). No Babylon in here: the boats, the crew list and
 * the minimap all use it.
 */
export interface BoatPalette {
  hull: number;
  trim: number;
}
export const boatPalettes: BoatPalette[] = [
  { hull: 0x2a6fb8, trim: 0xffd35a },
  { hull: 0xe0654f, trim: 0xfff1c9 },
  { hull: 0x2f9a8a, trim: 0xffd35a },
  { hull: 0x7a5bb5, trim: 0xfff1c9 },
];

export function paletteIndex(uid: string): number {
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % boatPalettes.length;
}

/** The hull colour as a CSS colour. */
export const hullCss = (uid: string) =>
  `#${boatPalettes[paletteIndex(uid)]!.hull.toString(16).padStart(6, "0")}`;
