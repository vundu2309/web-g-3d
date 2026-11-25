import {
  TOP_TIER,
  UPGRADES,
  clampTier,
  type Loadout,
  type UpgradeKind,
} from "./upgrades.ts";

/**
 * What the upgrade page of the market shows, as plain data (no DOM, no network): for each tier
 * of the rod and of the bait, its price, whether it is owned, the next one to buy, affordable
 * or too poor, or still locked behind an earlier tier, which bait is in use, and the length of
 * the little bars that say what a tier does. The page (app/market-ui.ts) only draws this, and
 * the server (the database) stays the authority on what is owned and charged.
 */
export type ShopKind = UpgradeKind;

/** owned: bought (tier 0 always); next: the one to buy, with enough coins; poor: the one to buy, too few coins; locked: an earlier tier is missing. */
export type TierState = "owned" | "next" | "poor" | "locked";

/** What a bar measures: how strong the line is, the odds of rarity 2 fish, the odds of rarity 3 fish, how many fish the store holds. */
export type BarId = "line" | "rare2" | "rare3" | "slots";

export interface Bar {
  id: BarId;
  /** The number of the UPGRADES table this bar draws (tension, rare2 or rare3). */
  value: number;
  /** How full the bar is, 0 to 1; the best tier of the table fills it. */
  fill: number;
  /** Where the tier in use stands on the same bar (a tick), 0 to 1. */
  base: number;
}

export interface TierView {
  tier: number;
  price: number;
  state: TierState;
  /** The tier doing the work now: the best rod owned, the bait chosen. */
  inUse: boolean;
  /** An owned bait that is not the one in use: a tap puts it in use. */
  canUse: boolean;
  /** Coins still missing (0 when owned or affordable). */
  missing: number;
  /** Coins held against the price, 0 to 1 (1 when owned or affordable). */
  progress: number;
  bars: Bar[];
}

export interface RowView {
  kind: ShopKind;
  /** The highest tier owned. */
  owned: number;
  /** Nothing more to buy. */
  top: boolean;
  /** Tiers 0 (the free one) to the top. */
  tiers: TierView[];
}

export interface UpgradeView {
  rod: RowView;
  bait: RowView;
  /** The boats, for the shipyard's page (the market shows the rod and the bait only). */
  boat: RowView;
  /** The bait tier in use. */
  baitUsed: number;
}

const LINE_BEST = Math.min(...UPGRADES.rod.map((tier) => tier.tension));
const RARE2_BEST = Math.max(...UPGRADES.bait.map((tier) => tier.rare2));
const RARE3_BEST = Math.max(...UPGRADES.bait.map((tier) => tier.rare3));
const SLOTS_BEST = Math.max(...UPGRADES.boat.map((tier) => tier.slots));

/** The bars of one tier: the line holds more as the tension builds slower. */
export function barsOf(kind: ShopKind, tier: number, base: number): Bar[] {
  if (kind === "rod") {
    const at = (t: number) => LINE_BEST / UPGRADES.rod[clampTier(t)]!.tension;
    return [
      {
        id: "line",
        value: UPGRADES.rod[clampTier(tier)]!.tension,
        fill: at(tier),
        base: at(base),
      },
    ];
  }
  if (kind === "boat") {
    const at = (t: number) => UPGRADES.boat[clampTier(t)]!.slots;
    return [
      {
        id: "slots",
        value: at(tier),
        fill: at(tier) / SLOTS_BEST,
        base: at(base) / SLOTS_BEST,
      },
    ];
  }
  const row = (t: number) => UPGRADES.bait[clampTier(t)]!;
  return [
    {
      id: "rare2",
      value: row(tier).rare2,
      fill: row(tier).rare2 / RARE2_BEST,
      base: row(base).rare2 / RARE2_BEST,
    },
    {
      id: "rare3",
      value: row(tier).rare3,
      fill: row(tier).rare3 / RARE3_BEST,
      base: row(base).rare3 / RARE3_BEST,
    },
  ];
}

function rowOf(
  kind: ShopKind,
  owned: number,
  used: number,
  coins: number,
): RowView {
  const wallet = Number.isFinite(coins) ? Math.max(0, coins) : 0;
  const tiers: TierView[] = [];
  for (let tier = 0; tier <= TOP_TIER; tier++) {
    const price = UPGRADES[kind][tier]!.price;
    let state: TierState;
    if (tier <= owned) state = "owned";
    else if (tier > owned + 1) state = "locked";
    else state = wallet >= price ? "next" : "poor";
    const have = state === "owned" || state === "next";
    tiers.push({
      tier,
      price,
      state,
      inUse: tier === used,
      canUse: kind === "bait" && state === "owned" && tier !== used,
      missing: have ? 0 : Math.max(0, price - wallet),
      progress: have || price === 0 ? 1 : Math.min(1, wallet / price),
      bars: barsOf(kind, tier, used),
    });
  }
  return { kind, owned, top: owned >= TOP_TIER, tiers };
}

/** The upgrade page for a loadout and a wallet. */
export function upgradeView(loadout: Loadout, coins: number): UpgradeView {
  const rod = clampTier(loadout.rod);
  const bait = clampTier(loadout.bait);
  const boat = clampTier(loadout.boat);
  const used = Math.min(bait, clampTier(loadout.baitUsed));
  return {
    rod: rowOf("rod", rod, rod, coins),
    bait: rowOf("bait", bait, used, coins),
    // The best boat owned is the one the player sails.
    boat: rowOf("boat", boat, boat, coins),
    baitUsed: used,
  };
}
