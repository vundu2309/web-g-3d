import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_LOADOUT,
  TIER_COUNT,
  TOP_TIER,
  UPGRADES,
  UPGRADE_KINDS,
  canBuy,
  clampTier,
  loadoutOf,
  nextTier,
  tierOf,
  upgradePrice,
} from "../src/ocean/upgrades.ts";
import { LEDGER_CAP } from "../src/ocean/economy.ts";

const migration = readFileSync(
  "supabase/migrations/20261120130000_upgrades.sql",
  "utf8",
);

test("every kind has four tiers, the first one free", () => {
  assert.deepEqual([...UPGRADE_KINDS], ["rod", "bait", "boat"]);
  assert.equal(TIER_COUNT, 4);
  for (const kind of UPGRADE_KINDS) {
    assert.equal(UPGRADES[kind].length, TIER_COUNT, `${kind} has 4 tiers`);
    assert.equal(UPGRADES[kind][0].price, 0, `${kind} tier 0 is free`);
    for (let tier = 1; tier < TIER_COUNT; tier++)
      assert.ok(UPGRADES[kind][tier].price > 0, `${kind} tier ${tier} costs`);
  }
});

test("each tier costs more and is better than the one before", () => {
  for (const kind of UPGRADE_KINDS)
    for (let tier = 1; tier < TIER_COUNT; tier++)
      assert.ok(
        UPGRADES[kind][tier].price > UPGRADES[kind][tier - 1].price,
        `${kind} price rises at tier ${tier}`,
      );
  for (let t = 1; t < TIER_COUNT; t++) {
    assert.ok(UPGRADES.rod[t].tension < UPGRADES.rod[t - 1].tension);
    assert.ok(UPGRADES.bait[t].rare2 > UPGRADES.bait[t - 1].rare2);
    assert.ok(UPGRADES.bait[t].rare3 > UPGRADES.bait[t - 1].rare3);
    assert.ok(UPGRADES.boat[t].slots > UPGRADES.boat[t - 1].slots);
  }
  // The default tiers change nothing: today's line and today's fish odds.
  assert.equal(UPGRADES.rod[0].tension, 1);
  assert.equal(UPGRADES.bait[0].rare2, 1);
  assert.equal(UPGRADES.bait[0].rare3, 1);
  assert.ok(UPGRADES.rod[TOP_TIER].tension > 0, "the line still strains");
  assert.equal(UPGRADES.boat[0].slots, 20);
});

test("the best boat holds as many fish as the server ledger", () => {
  assert.equal(UPGRADES.boat[TOP_TIER].slots, LEDGER_CAP);
});

test("tierOf clamps anything invalid to the free default tier", () => {
  assert.equal(tierOf("rod", 2), UPGRADES.rod[2]);
  for (const bad of [-1, 4, 99, 1.5, NaN, Infinity, "2", null, undefined])
    assert.equal(tierOf("boat", bad), UPGRADES.boat[0], String(bad));
  assert.equal(clampTier(3), 3);
  assert.equal(clampTier(-2), 0);
  assert.equal(upgradePrice("bait", 3), 3000);
  assert.equal(upgradePrice("bait", 17), 0);
});

test("nextTier is the one after the owned tier, and none at the top", () => {
  assert.equal(nextTier(0), 1);
  assert.equal(nextTier(2), 3);
  assert.equal(nextTier(TOP_TIER), null);
  assert.equal(nextTier(NaN), 1, "an invalid owned tier counts as tier 0");
});

test("canBuy accepts only the next tier with enough coins", () => {
  assert.ok(canBuy(0, 100, "rod", 1));
  assert.ok(canBuy(0, 1e9, "rod", 1));
  assert.ok(!canBuy(0, 99, "rod", 1), "too poor");
  assert.ok(!canBuy(0, 1e9, "rod", 2), "no skipping");
  assert.ok(!canBuy(1, 1e9, "rod", 1), "no buying again");
  assert.ok(!canBuy(2, 1e9, "rod", 1), "no going back");
  assert.ok(!canBuy(TOP_TIER, 1e9, "rod", 3), "nothing above the top");
  assert.ok(!canBuy(0, 1e9, "rod", 0));
  assert.ok(!canBuy(0, NaN, "rod", 1));
  assert.ok(!canBuy(0, 1e9, "sail", 1), "not a kind");
  assert.ok(canBuy(1, 600, "bait", 2));
  assert.ok(!canBuy(1, 599, "bait", 2));
  assert.ok(canBuy(2, 8000, "boat", 3));
  assert.ok(!canBuy(2, 7999, "boat", 3));
});

test("loadoutOf repairs anything and keeps the bait in use within the bait owned", () => {
  assert.deepEqual(loadoutOf(undefined), DEFAULT_LOADOUT);
  assert.deepEqual(loadoutOf("x"), DEFAULT_LOADOUT);
  assert.deepEqual(loadoutOf({ rod: 2, bait: 1, baitUsed: 3, boat: 9 }), {
    rod: 2,
    bait: 1,
    baitUsed: 1,
    boat: 0,
  });
  assert.deepEqual(loadoutOf({ rod: 1, bait: 3, baitUsed: 2, boat: 3 }), {
    rod: 1,
    bait: 3,
    baitUsed: 2,
    boat: 3,
  });
});

test("the prices equal the seed rows of the migration", () => {
  const rows = [
    ...migration.matchAll(/\('(rod|bait|boat)', (\d), (\d+)\)/g),
  ].map(([, kind, tier, price]) => ({
    kind,
    tier: Number(tier),
    price: Number(price),
  }));
  assert.equal(
    rows.length,
    UPGRADE_KINDS.length * TIER_COUNT,
    "every kind and tier is seeded once",
  );
  for (const kind of UPGRADE_KINDS)
    for (let tier = 0; tier < TIER_COUNT; tier++)
      assert.deepEqual(
        rows.filter((row) => row.kind === kind && row.tier === tier),
        [{ kind, tier, price: UPGRADES[kind][tier].price }],
        `${kind} tier ${tier} costs the same in the database`,
      );
});

test("the migration keeps the tables private and only authenticated may call the RPCs", () => {
  assert.match(
    migration,
    /revoke all on all tables in schema economy_private from public, anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant (select|insert|update|delete)[^;]*economy_private/i,
  );
  for (const fn of [
    "economy_buy\\(text, integer\\)",
    "economy_set_bait\\(integer\\)",
    "economy_loadout\\(\\)",
  ])
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${fn} to authenticated`),
    );
  for (const table of ["upgrade_prices", "loadouts"])
    assert.match(
      migration,
      new RegExp(
        `alter table economy_private\\.${table} enable row level security`,
      ),
    );
});

// The migration's safety rests on two lines that no single-session scenario can notice losing,
// so the file itself is checked (a review removed each one and every other test still passed).
test("buy and set_bait lock the wallet row, and every new security definer pins its search_path", () => {
  const body = (name) => {
    const start = migration.indexOf(`create function economy_private.${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    const end = migration.indexOf("end$$;", start);
    return migration.slice(start, end);
  };
  assert.match(
    body("buy"),
    /from economy_private\.wallets where user_id = uid for update/,
  );
  assert.match(
    body("set_bait"),
    /from economy_private\.wallets where user_id = uid for update/,
  );
  for (const name of ["loadout_of", "loadout", "buy", "set_bait"]) {
    const start = migration.indexOf(`create function economy_private.${name}(`);
    const header = migration.slice(start, migration.indexOf("$$", start));
    assert.match(
      header,
      /security definer set search_path = ''/,
      `${name} pins search_path`,
    );
  }
  for (const fn of ["economy_loadout", "economy_buy", "economy_set_bait"]) {
    const start = migration.indexOf(`create function public.${fn}(`);
    const header = migration.slice(start, migration.indexOf("$$", start));
    assert.match(
      header,
      /security definer set search_path = ''/,
      `${fn} pins search_path`,
    );
  }
  // economy_state is replaced, not created: it must keep its pinned path too.
  const state = migration.indexOf(
    "create or replace function economy_private.state()",
  );
  assert.match(
    migration.slice(state, migration.indexOf("$$", state)),
    /set search_path = ''/,
  );
});

test("the store has 1 slot per fish: 20 on the free boat up to 200 on the best, and anything invalid is the free boat", async () => {
  const { slotsOf } = await import("../src/ocean/upgrades.ts");
  assert.deepEqual([0, 1, 2, 3].map(slotsOf), [20, 50, 100, 200]);
  for (const bad of [-1, 4, 1.5, NaN, "2", null, undefined, {}])
    assert.equal(slotsOf(bad), 20, String(bad));
  assert.equal(slotsOf(DEFAULT_LOADOUT.boat), 20);
});
