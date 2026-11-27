/**
 * The boat colours and which one a player gets (from the account id by default, or from the
 * chosen paint of the shipyard shop, decision 0024). No Babylon in here: the boats, the crew
 * list and the minimap all use it.
 */
export interface BoatPalette {
  hull: number;
  trim: number;
}
/** How many palettes are assigned by account-id hash when a player has not chosen a paint (kept at 4 so existing players keep their colour). */
export const DEFAULT_PLAYER_PALETTES = 4;
/** How many of `boatPalettes` the players can sail (the first ones); the last is the patrol ships'. */
export const PLAYER_PALETTES = 8;
export const boatPalettes: BoatPalette[] = [
  // 0..3: the four classic palettes (also the free UID-hash defaults).
  { hull: 0x2a6fb8, trim: 0xffd35a },
  { hull: 0xe0654f, trim: 0xfff1c9 },
  { hull: 0x2f9a8a, trim: 0xffd35a },
  { hull: 0x7a5bb5, trim: 0xfff1c9 },
  // 4..7: the four premium shipyard paints (decision 0024).
  { hull: 0xe8a328, trim: 0x153b80 },
  { hull: 0x2e7d4f, trim: 0xf7d774 },
  { hull: 0xd85b88, trim: 0xfff4d6 },
  { hull: 0x222b3a, trim: 0xf2b830 },
  // The patrol ships (patrol-routes.ts): a white hull with the navy of the game's ink.
  { hull: 0xf6fbff, trim: 0x153b80 },
];
/** The patrol ships' palette. */
export const PATROL_PALETTE = PLAYER_PALETTES;
/** The id of a boat nobody owns (the patrol ships) starts with this; a player's account id never does. */
export const NPC_PREFIX = "npc:";

/** Default palette index from an account id (0..3 for players, PATROL_PALETTE for NPCs). */
export function paletteIndex(uid: string): number {
  if (uid.startsWith(NPC_PREFIX)) return PATROL_PALETTE;
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % DEFAULT_PLAYER_PALETTES;
}

/** Palette index for a boat, taking a chosen custom paint (0..7) when valid, else the account default. */
export function paintPalette(uid: string, paint?: unknown): number {
  if (uid.startsWith(NPC_PREFIX)) return PATROL_PALETTE;
  if (
    typeof paint === "number" &&
    Number.isInteger(paint) &&
    paint >= 0 &&
    paint < PLAYER_PALETTES
  )
    return paint;
  return paletteIndex(uid);
}

/** A 24-bit colour as `#rrggbb`. */
export const hexCss = (color: number) =>
  `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;

/** The hull colour as a CSS colour. */
export const hullCss = (uid: string, paint?: unknown) =>
  hexCss(boatPalettes[paintPalette(uid, paint)]!.hull);
