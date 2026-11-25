/**
 * The boat colours and which one a player gets (from the account id, so it is the same
 * for everyone and on every device). No Babylon in here: the boats, the crew list and
 * the minimap all use it.
 */
export interface BoatPalette {
  hull: number;
  trim: number;
}
/** How many of `boatPalettes` the players get (the first ones); the last is the patrol ships'. */
export const PLAYER_PALETTES = 4;
export const boatPalettes: BoatPalette[] = [
  { hull: 0x2a6fb8, trim: 0xffd35a },
  { hull: 0xe0654f, trim: 0xfff1c9 },
  { hull: 0x2f9a8a, trim: 0xffd35a },
  { hull: 0x7a5bb5, trim: 0xfff1c9 },
  // The patrol ships (patrol-routes.ts): a white hull with the navy of the game's ink.
  { hull: 0xf6fbff, trim: 0x153b80 },
];
/** The patrol ships' palette. */
export const PATROL_PALETTE = PLAYER_PALETTES;
/** The id of a boat nobody owns (the patrol ships) starts with this; a player's account id never does. */
export const NPC_PREFIX = "npc:";

export function paletteIndex(uid: string): number {
  if (uid.startsWith(NPC_PREFIX)) return PATROL_PALETTE;
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % PLAYER_PALETTES;
}

/** The hull colour as a CSS colour. */
export const hullCss = (uid: string) =>
  `#${boatPalettes[paletteIndex(uid)]!.hull.toString(16).padStart(6, "0")}`;
