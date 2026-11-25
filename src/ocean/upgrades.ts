/**
 * Permanent upgrades the player buys with coins: a rod, a bait and a boat, each in four
 * tiers. Tier 0 is the free default everyone owns; tiers 1 to 3 are bought, one after the
 * other, once. This file is plain maths with no rendering and no network. The prices are
 * written once here and once as seed rows of the database (see
 * supabase/migrations/..._upgrades.sql); tests/upgrades.test.mjs reads that file and fails if
 * the two ever disagree, because the DATABASE is the authority on what is owned and charged.
 *
 * The EFFECT numbers (line tension, bait weights, store slots) are applied on the device
 * (a catch is still a client report, docs/decisions/0010-server-economy.md); ownership and
 * the price are the server's. This file imports nothing so fishing.ts and fight.ts can read
 * it without a cycle.
 */
export const UPGRADE_KINDS = ["rod", "bait", "boat"] as const;
export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

/** Tiers of every kind, the free default (0) included. */
export const TIER_COUNT = 4;
export const TOP_TIER = TIER_COUNT - 1;

export interface RodTier {
  /** Coins; 0 for the free default. */
  price: number;
  /** Multiplier of how fast the line strain builds; lower means the line snaps less. */
  tension: number;
}
export interface BaitTier {
  price: number;
  /** Multiplier of the weight of rarity 2 fish in rollFish. */
  rare2: number;
  /** Multiplier of the weight of rarity 3 fish in rollFish. */
  rare3: number;
}
export interface BoatTier {
  price: number;
  /** Fish the store holds (1 slot = 1 fish). The top tier equals the server ledger's LEDGER_CAP. */
  slots: number;
}
export interface UpgradeTable {
  rod: readonly RodTier[];
  bait: readonly BaitTier[];
  boat: readonly BoatTier[];
}

/**
 * Prices for the "medium" pace: tier 1 is about 5 minutes of shore fishing (about 10 coins a
 * fish, 20 to 40 s a fish); all tiers together are a few hours of open-water fishing (about
 * 47 and 121 coins a fish). Each step costs about 5 to 6 times the one before, so the next
 * upgrade is always a goal. The boat costs more than the rod: it is the biggest change.
 */
export const UPGRADES: UpgradeTable = {
  rod: [
    { price: 0, tension: 1 },
    { price: 100, tension: 0.85 },
    { price: 600, tension: 0.7 },
    { price: 3000, tension: 0.55 },
  ],
  bait: [
    { price: 0, rare2: 1, rare3: 1 },
    { price: 100, rare2: 1.5, rare3: 1.8 },
    { price: 600, rare2: 2.2, rare3: 3 },
    { price: 3000, rare2: 3.2, rare3: 5 },
  ],
  boat: [
    { price: 0, slots: 20 },
    { price: 200, slots: 50 },
    { price: 1500, slots: 100 },
    { price: 8000, slots: 200 },
  ],
};

/** A tier number the table knows: a whole number from 0 to the top tier. */
export function isTier(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= TOP_TIER
  );
}

export function isKind(value: unknown): value is UpgradeKind {
  return (
    typeof value === "string" &&
    (UPGRADE_KINDS as readonly string[]).includes(value)
  );
}

/** The tier number itself, with anything invalid (NaN, fractions, out of range) as tier 0. */
export function clampTier(value: unknown): number {
  return isTier(value) ? value : 0;
}

/** How many fish the store holds on a boat tier: 1 slot is 1 fish (20 on the free boat, 200 on the best). */
export const slotsOf = (boat: unknown): number => tierOf("boat", boat).slots;

/** The row of a tier; an invalid tier gives tier 0, the free default. */
export function tierOf<K extends UpgradeKind>(
  kind: K,
  tier: unknown,
): UpgradeTable[K][number] {
  return UPGRADES[kind][clampTier(tier)] as UpgradeTable[K][number];
}

/** Coins a tier costs (0 for tier 0 and for an invalid tier). */
export function upgradePrice(kind: UpgradeKind, tier: unknown): number {
  return tierOf(kind, tier).price;
}

/** The tier a player who owns `owned` can buy next, or null at the top. */
export function nextTier(owned: unknown): number | null {
  const tier = clampTier(owned);
  return tier < TOP_TIER ? tier + 1 : null;
}

/**
 * Whether `tier` of `kind` can be bought now: only the NEXT tier after the one owned (no
 * skipping, no buying again, no going back), and with enough coins.
 */
export function canBuy(
  owned: unknown,
  coins: number,
  kind: UpgradeKind,
  tier: unknown,
): boolean {
  const next = nextTier(owned);
  return (
    isKind(kind) &&
    next !== null &&
    tier === next &&
    Number.isFinite(coins) &&
    coins >= upgradePrice(kind, next)
  );
}

/** What a player owns: the highest tier of each kind, and the bait tier in use. */
export interface Loadout {
  rod: number;
  bait: number;
  /** The bait tier chosen to fish with; every bought bait is kept, one is in use. */
  baitUsed: number;
  boat: number;
}

export const DEFAULT_LOADOUT: Readonly<Loadout> = Object.freeze({
  rod: 0,
  bait: 0,
  baitUsed: 0,
  boat: 0,
});

/** A loadout from anything (a server answer, a saved value): invalid parts become tier 0 and baitUsed never exceeds bait. */
export function loadoutOf(raw: unknown): Loadout {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const bait = clampTier(value.bait);
  return {
    rod: clampTier(value.rod),
    bait,
    baitUsed: Math.min(bait, clampTier(value.baitUsed)),
    boat: clampTier(value.boat),
  };
}
