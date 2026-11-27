import {
  PLAYER_PALETTES,
  boatPalettes,
  hexCss,
  paintPalette,
  paletteIndex,
} from "./palette.ts";
import type { Loadout } from "./upgrades.ts";

/**
 * Shipyard boat paints (decision 0024): eight hull+trim palettes (0..7), bought once with coins
 * in any order and switched freely. Every player owns their account-id default (0..3) for free.
 * Pure maths, no DOM, no Babylon; prices are kept equal to the SQL migration by tests/boat-paint.test.mjs.
 */
export interface PaintDef {
  id: number;
  name: string;
  price: number;
  hull: string;
  trim: string;
}

const META: readonly { name: string; price: number }[] = [
  { name: "Xanh Đại Dương", price: 150 },
  { name: "Đỏ San Hô", price: 150 },
  { name: "Xanh Ngọc Bích", price: 150 },
  { name: "Tím Hoàng Hôn", price: 150 },
  { name: "Vàng Nắng Mai", price: 400 },
  { name: "Xanh Rừng Tràm", price: 400 },
  { name: "Hồng Hải Đường", price: 800 },
  { name: "Đen Huyền Thoại", price: 2000 },
];

export const PAINTS: readonly PaintDef[] = META.map((item, id) => {
  const palette = boatPalettes[id]!;
  return {
    id,
    name: item.name,
    price: item.price,
    hull: hexCss(palette.hull),
    trim: hexCss(palette.trim),
  };
});

/** Whether `value` is a valid player paint index (0..7). */
export function isPaint(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < PLAYER_PALETTES
  );
}

/** Valid paint index, or `undefined` when absent/invalid. */
export function clampPaint(value: unknown): number | undefined {
  return isPaint(value) ? value : undefined;
}

/** Coins a paint costs (0 for an invalid paint id). */
export function paintPrice(id: unknown): number {
  return isPaint(id) ? PAINTS[id]!.price : 0;
}

/** Whether a player owns `paintId` (either their free UID default or in `loadout.paints`). */
export function paintOwned(
  uid: string,
  loadout: Pick<Loadout, "paints">,
  paintId: number,
): boolean {
  if (!isPaint(paintId)) return false;
  if (paintId === paletteIndex(uid)) return true;
  return Array.isArray(loadout.paints) && loadout.paints.includes(paintId);
}

/** State of one paint card in the shipyard's Sơn tàu page. */
export type PaintState = "owned" | "buy" | "poor";

export interface PaintCardView {
  id: number;
  name: string;
  hull: string;
  trim: string;
  price: number;
  state: PaintState;
  inUse: boolean;
  canUse: boolean;
  missing: number;
  progress: number;
}

export interface PaintShopView {
  active: number;
  cards: PaintCardView[];
}

/** Builds the plain view-model for the shipyard's Sơn tàu grid. */
export function paintView(
  uid: string,
  loadout: Loadout,
  coins: number,
): PaintShopView {
  const wallet = Number.isFinite(coins) ? Math.max(0, coins) : 0;
  const active = paintPalette(uid, loadout.paint);
  const cards: PaintCardView[] = PAINTS.map((paint) => {
    const owned = paintOwned(uid, loadout, paint.id);
    const inUse = paint.id === active;
    const state: PaintState = owned
      ? "owned"
      : wallet >= paint.price
        ? "buy"
        : "poor";
    const have = state === "owned" || state === "buy";
    return {
      id: paint.id,
      name: paint.name,
      hull: paint.hull,
      trim: paint.trim,
      price: owned ? 0 : paint.price,
      state,
      inUse,
      canUse: owned && !inUse,
      missing: have ? 0 : Math.max(0, paint.price - wallet),
      progress:
        have || paint.price === 0 ? 1 : Math.min(1, wallet / paint.price),
    };
  });
  return { active, cards };
}
