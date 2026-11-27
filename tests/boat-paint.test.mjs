import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PLAYER_PALETTES,
  PATROL_PALETTE,
  PLAYER_PALETTES,
  boatPalettes,
  hullCss,
  paintPalette,
  paletteIndex,
} from "../src/ocean/palette.ts";
import { PAL } from "../src/ocean/art/colors.ts";
import {
  PAINTS,
  clampPaint,
  isPaint,
  paintOwned,
  paintPrice,
  paintView,
} from "../src/ocean/paint.ts";
import { EconomyError, memoryEconomy } from "../src/ocean/economy-api.ts";
import { loadoutOf } from "../src/ocean/upgrades.ts";

const migration = readFileSync(
  "supabase/migrations/20261129120000_boat_paint.sql",
  "utf8",
);

test("eight player palettes exist, none collide with the flag or patrol ship, and UID defaults stay in 0..3", () => {
  assert.equal(DEFAULT_PLAYER_PALETTES, 4);
  assert.equal(PLAYER_PALETTES, 8);
  assert.equal(PATROL_PALETTE, 8);
  assert.equal(boatPalettes.length, PLAYER_PALETTES + 1);
  assert.equal(PAINTS.length, PLAYER_PALETTES);

  const patrol = boatPalettes[PATROL_PALETTE];
  for (let i = 0; i < PLAYER_PALETTES; i++) {
    const p = boatPalettes[i];
    assert.notEqual(p.hull, PAL.flag.red, `paint ${i} hull != flag red`);
    assert.notEqual(p.hull, PAL.flag.star, `paint ${i} hull != flag star`);
    assert.notEqual(p.trim, PAL.flag.red, `paint ${i} trim != flag red`);
    assert.notEqual(p.trim, PAL.flag.star, `paint ${i} trim != flag star`);
    assert.ok(
      p.hull !== patrol.hull || p.trim !== patrol.trim,
      `paint ${i} distinct from patrol ship`,
    );
  }

  for (let i = 0; i < 40; i++) {
    const uid = `player-${i}-${(i * 7919).toString(36)}`;
    const def = paletteIndex(uid);
    assert.ok(def >= 0 && def < DEFAULT_PLAYER_PALETTES);
    assert.equal(paintPalette(uid, undefined), def);
    assert.equal(paintPalette(uid, null), def);
    assert.equal(paintPalette(uid, 99), def);
    assert.equal(paintPalette(uid, 7), 7);
    assert.equal(
      hullCss(uid, 7),
      `#${boatPalettes[7].hull.toString(16).padStart(6, "0")}`,
    );
  }
  assert.equal(paintPalette("npc:patrol-0", 7), PATROL_PALETTE);
});

test("paint prices equal the seed rows of the boat paint migration", () => {
  const rows = [...migration.matchAll(/\((\d),\s*(\d+)\)/g)].map(
    ([, paint, price]) => ({
      paint: Number(paint),
      price: Number(price),
    }),
  );
  assert.equal(rows.length, PAINTS.length, "one seed row per paint");
  for (const row of rows) {
    assert.equal(
      paintPrice(row.paint),
      row.price,
      `paint ${row.paint} price matches migration`,
    );
  }
  assert.equal(isPaint(0), true);
  assert.equal(isPaint(7), true);
  assert.equal(isPaint(8), false);
  assert.equal(isPaint(-1), false);
  assert.equal(isPaint(1.5), false);
  assert.equal(clampPaint(5), 5);
  assert.equal(clampPaint("5"), undefined);
});

test("paintView computes owned, affordable, poor, and active states with free UID default", () => {
  const uid = "11111111-1111-1111-1111-111111111111";
  const def = paletteIndex(uid);
  const view = paintView(
    uid,
    loadoutOf({ rod: 0, bait: 0, baitUsed: 0, boat: 0 }),
    500,
  );
  assert.equal(view.active, def);
  assert.equal(view.cards.length, 8);
  for (const card of view.cards) {
    if (card.id === def) {
      assert.equal(card.state, "owned");
      assert.equal(card.inUse, true);
      assert.equal(card.canUse, false);
    } else if (card.price <= 500) {
      assert.equal(card.state, "buy");
      assert.equal(card.inUse, false);
      assert.equal(card.missing, 0);
    } else {
      assert.equal(card.state, "poor");
      assert.equal(card.missing, card.price - 500);
      assert.ok(card.progress > 0 && card.progress < 1);
    }
  }
  // Buying paint 7 does not require buying paints 0..6 first.
  const rich = paintView(
    uid,
    loadoutOf({ rod: 0, bait: 0, baitUsed: 0, boat: 0, paint: 7, paints: [7] }),
    0,
  );
  assert.equal(rich.active, 7);
  assert.equal(
    paintOwned(
      uid,
      { rod: 0, bait: 0, baitUsed: 0, boat: 0, paints: [7] },
      def,
    ),
    true,
  );
  assert.equal(
    paintOwned(uid, { rod: 0, bait: 0, baitUsed: 0, boat: 0, paints: [7] }, 7),
    true,
  );
  assert.equal(rich.cards[def].canUse, true);
  assert.equal(rich.cards[7].inUse, true);
});

test("memoryEconomy enforces buyPaint and setPaint rules", async () => {
  const uid = "22222222-2222-2222-2222-222222222222";
  const def = paletteIndex(uid);
  const economy = memoryEconomy({ coins: 1000, uid });

  // Buying own default paint is refused as already owned.
  await assert.rejects(
    () => economy.buyPaint(def),
    (e) => e instanceof EconomyError && e.failure === "owned",
  );
  // Buying a paint that costs more than balance is refused as poor.
  await assert.rejects(
    () => economy.buyPaint(7),
    (e) => e instanceof EconomyError && e.failure === "poor",
  );
  // Invalid paint id is refused.
  await assert.rejects(
    () => economy.buyPaint(99),
    (e) => e instanceof EconomyError && e.failure === "invalid",
  );
  // Setting an unowned paint is refused.
  await assert.rejects(
    () => economy.setPaint(6),
    (e) => e instanceof EconomyError && e.failure === "order",
  );

  // Buying paint 6 (800 xu) deducts coins and equips it immediately.
  const bought = await economy.buyPaint(6);
  assert.equal(bought.coins, 200);
  assert.equal(bought.loadout.paint, 6);
  assert.ok(bought.loadout.paints?.includes(6));

  // Buying the same paint again is refused as owned without charging.
  await assert.rejects(
    () => economy.buyPaint(6),
    (e) => e instanceof EconomyError && e.failure === "owned",
  );

  // Switching back to free default paint works and costs nothing.
  const back = await economy.setPaint(def);
  assert.equal(back.paint, def);
  assert.equal((await economy.state()).coins, 200);
});
