import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LOADOUT, UPGRADES } from "../src/ocean/upgrades.ts";
import { barsOf, upgradeView } from "../src/ocean/upgrade-view.ts";

const loadout = (over = {}) => ({ ...DEFAULT_LOADOUT, ...over });
const states = (row) => row.tiers.map((t) => t.state);

test("a new account owns only the free tier; the first tier is the one to buy, the rest are locked", () => {
  const view = upgradeView(loadout(), 0);
  for (const row of [view.rod, view.bait]) {
    assert.equal(row.tiers.length, 4);
    assert.equal(row.owned, 0);
    assert.equal(row.top, false);
    assert.deepEqual(states(row), ["owned", "poor", "locked", "locked"]);
  }
  assert.equal(view.rod.tiers[0].price, 0);
  assert.equal(view.rod.tiers[1].price, UPGRADES.rod[1].price);
  assert.equal(view.bait.tiers[3].price, UPGRADES.bait[3].price);
});

test("not enough coins: poor, with what is missing and how far along the wallet is", () => {
  const price = UPGRADES.rod[1].price;
  const tier = upgradeView(loadout(), price - 1).rod.tiers[1];
  assert.equal(tier.state, "poor");
  assert.equal(tier.missing, 1);
  assert.ok(tier.progress > 0.98 && tier.progress < 1);
  const none = upgradeView(loadout(), 0).rod.tiers[1];
  assert.equal(none.progress, 0);
  assert.equal(none.missing, price);
  const half = upgradeView(loadout(), price / 2).rod.tiers[1];
  assert.equal(half.progress, 0.5);
});

test("exactly enough coins is enough", () => {
  const price = UPGRADES.rod[1].price;
  const tier = upgradeView(loadout(), price).rod.tiers[1];
  assert.equal(tier.state, "next");
  assert.equal(tier.missing, 0);
  assert.equal(tier.progress, 1);
});

test("a bad wallet number counts as no coins", () => {
  for (const bad of [NaN, -5, Infinity, -Infinity]) {
    const tier = upgradeView(loadout(), bad).rod.tiers[1];
    assert.equal(tier.state, "poor", `state for ${bad}`);
    assert.ok(Number.isFinite(tier.missing), `missing is finite for ${bad}`);
    assert.ok(tier.missing >= 0, `missing is never negative for ${bad}`);
    assert.equal(
      tier.missing,
      UPGRADES.rod[1].price,
      `nothing held for ${bad}`,
    );
    assert.ok(Number.isFinite(tier.progress), `progress is finite for ${bad}`);
    assert.equal(tier.progress, 0, `no progress for ${bad}`);
  }
});

test("an owned tier is owned whatever the wallet holds, and only the next one is offered", () => {
  const view = upgradeView(loadout({ rod: 1 }), 0);
  assert.deepEqual(states(view.rod), ["owned", "owned", "poor", "locked"]);
  assert.equal(view.rod.owned, 1);
  assert.equal(view.rod.tiers[1].missing, 0);
  // Rich enough for the tier after the next one: it stays locked, not offered.
  const rich = upgradeView(loadout({ rod: 1 }), 1e9);
  assert.deepEqual(states(rich.rod), ["owned", "owned", "next", "locked"]);
});

test("tiers beyond the next one are locked even for a rich account", () => {
  const view = upgradeView(loadout(), 1e9);
  assert.deepEqual(states(view.rod), ["owned", "next", "locked", "locked"]);
  assert.deepEqual(states(view.bait), ["owned", "next", "locked", "locked"]);
});

test("the top tier: nothing more to buy", () => {
  const view = upgradeView(loadout({ rod: 3, bait: 3, baitUsed: 3 }), 0);
  for (const row of [view.rod, view.bait]) {
    assert.equal(row.top, true);
    assert.deepEqual(states(row), ["owned", "owned", "owned", "owned"]);
  }
  assert.equal(upgradeView(loadout({ rod: 2 }), 1e9).rod.top, false);
});

test("the bait in use is marked, the other owned baits can be chosen, the unowned cannot", () => {
  const view = upgradeView(loadout({ bait: 2, baitUsed: 1 }), 50);
  assert.equal(view.baitUsed, 1);
  const row = view.bait.tiers;
  assert.deepEqual(
    row.map((t) => t.inUse),
    [false, true, false, false],
  );
  assert.deepEqual(
    row.map((t) => t.canUse),
    [true, false, true, false],
  );
  assert.equal(row[3].state, "poor", "the next bait is still to buy");
  // Buying a bait puts it in use at once (the server does that): the view follows.
  const bought = upgradeView(loadout({ bait: 3, baitUsed: 3 }), 0).bait.tiers;
  assert.deepEqual(
    bought.map((t) => t.inUse),
    [false, false, false, true],
  );
  // The free bait can be chosen again.
  assert.equal(
    upgradeView(loadout({ bait: 1, baitUsed: 1 }), 0).bait.tiers[0].canUse,
    true,
  );
});

test("the rod in use is the best one owned and a rod is never chosen", () => {
  const view = upgradeView(loadout({ rod: 2 }), 0);
  assert.deepEqual(
    view.rod.tiers.map((t) => t.inUse),
    [false, false, true, false],
  );
  assert.ok(view.rod.tiers.every((t) => !t.canUse));
});

test("a bait in use above the bait owned is clamped to what is owned", () => {
  const view = upgradeView({ rod: 0, bait: 1, baitUsed: 3, boat: 0 }, 0);
  assert.equal(view.baitUsed, 1);
  assert.equal(view.bait.tiers[1].inUse, true);
});

test("the bars come from the UPGRADES table: the best tier is full, the others in proportion", () => {
  const view = upgradeView(loadout(), 0);
  view.rod.tiers.forEach((t, i) => {
    assert.equal(t.bars.length, 1);
    const [bar] = t.bars;
    assert.equal(bar.id, "line");
    assert.equal(bar.value, UPGRADES.rod[i].tension);
    // A line that builds strain slower is stronger: fill is the best tension over this one.
    assert.ok(
      Math.abs(bar.fill - UPGRADES.rod[3].tension / UPGRADES.rod[i].tension) <
        1e-9,
    );
  });
  const fills = view.rod.tiers.map((t) => t.bars[0].fill);
  assert.equal(fills[3], 1);
  assert.deepEqual(
    [...fills].sort((a, b) => a - b),
    fills,
    "stronger up the tiers",
  );
  view.bait.tiers.forEach((t, i) => {
    assert.deepEqual(
      t.bars.map((b) => b.id),
      ["rare2", "rare3"],
    );
    assert.equal(t.bars[0].value, UPGRADES.bait[i].rare2);
    assert.equal(t.bars[1].value, UPGRADES.bait[i].rare3);
    assert.ok(
      Math.abs(
        t.bars[0].fill - UPGRADES.bait[i].rare2 / UPGRADES.bait[3].rare2,
      ) < 1e-9,
    );
    assert.ok(
      Math.abs(
        t.bars[1].fill - UPGRADES.bait[i].rare3 / UPGRADES.bait[3].rare3,
      ) < 1e-9,
    );
  });
  assert.equal(view.bait.tiers[3].bars[0].fill, 1);
  assert.equal(view.bait.tiers[3].bars[1].fill, 1);
  for (const row of [view.rod, view.bait])
    for (const t of row.tiers)
      for (const bar of t.bars) assert.ok(bar.fill > 0 && bar.fill <= 1);
});

test("the tick on every bar is the tier in use", () => {
  const view = upgradeView(loadout({ rod: 2, bait: 2, baitUsed: 1 }), 0);
  for (const t of view.rod.tiers)
    assert.equal(t.bars[0].base, view.rod.tiers[2].bars[0].fill);
  for (const t of view.bait.tiers) {
    assert.equal(t.bars[0].base, view.bait.tiers[1].bars[0].fill);
    assert.equal(t.bars[1].base, view.bait.tiers[1].bars[1].fill);
  }
  assert.deepEqual(barsOf("rod", 3, 0)[0].base, barsOf("rod", 0, 0)[0].fill);
});

test("the page is drawn from this view and calls the economy once per tap", () => {
  const source = readFileSync("src/app/market-ui.ts", "utf8");
  assert.match(source, /upgradeView\(/);
  assert.match(source, /economy\.buy\(/);
  assert.match(source, /economy\.setBait\(/);
  // A second tap while a purchase runs must not reach the server: the guard is before the call,
  // and the flag is released in a finally, so a failed call never leaves the page locked.
  const body = (from, to) => {
    const start = source.indexOf(from);
    assert.ok(start > -1, from);
    return source.slice(start, source.indexOf(to, start));
  };
  for (const [name, from, to, call] of [
    ["buy", "async function buy(", "async function useBait(", "economy.buy("],
    [
      "useBait",
      "async function useBait(",
      "function lockUpgrades(",
      "economy.setBait(",
    ],
  ]) {
    const text = body(from, to);
    const guard = text.indexOf("if (busy");
    assert.ok(
      guard > -1 && guard < text.indexOf(call),
      `${name}: busy guard before the call`,
    );
    assert.match(
      text,
      /finally\s*\{\s*busy = false;/,
      `${name}: busy released in a finally`,
    );
    // An answer that comes back to an older opening of the market must not draw into the new one.
    assert.match(
      text,
      /session !== at/,
      `${name}: drops an answer for an older opening`,
    );
  }
  // Each failure has its own message in the FAILURES map (not just a word elsewhere in the file).
  const failures = body("const FAILURES", "};");
  for (const failure of ["poor", "owned", "order", "network", "signin"])
    assert.match(
      failures,
      new RegExp(`\\b${failure}: "`),
      `failure ${failure} has a message`,
    );
});

test("the tab strip is really hidden while the market loads (a display rule must not beat [hidden])", () => {
  const css = readFileSync("src/ocean/style.css", "utf8");
  assert.match(css, /\.market-tabs\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(
    readFileSync("src/app/market-ui.ts", "utf8"),
    /tabs\.hidden = true/,
  );
});

test("the boat row is for the shipyard: four tiers, the best owned is the one sailed, only the next is for sale, and a bar says the slots", async () => {
  const { upgradeView: view } = await import("../src/ocean/upgrade-view.ts");
  const { UPGRADES: table } = await import("../src/ocean/upgrades.ts");
  const poor = view({ rod: 0, bait: 0, baitUsed: 0, boat: 0 }, 50).boat;
  assert.equal(poor.kind, "boat");
  assert.equal(poor.tiers.length, 4);
  assert.deepEqual(
    poor.tiers.map((t) => t.state),
    ["owned", "poor", "locked", "locked"],
  );
  assert.equal(poor.tiers[0].inUse, true);
  assert.equal(poor.tiers[1].missing, table.boat[1].price - 50);
  const rich = view({ rod: 0, bait: 0, baitUsed: 0, boat: 1 }, 5000).boat;
  assert.deepEqual(
    rich.tiers.map((t) => t.state),
    ["owned", "owned", "next", "locked"],
  );
  assert.deepEqual(
    rich.tiers.map((t) => t.inUse),
    [false, true, false, false],
    "the best boat owned is the one in use",
  );
  assert.ok(
    rich.tiers.every((t) => !t.canUse),
    "a boat is not chosen like a bait",
  );
  for (const tier of rich.tiers) {
    assert.equal(tier.bars.length, 1);
    assert.equal(tier.bars[0].id, "slots");
    assert.equal(tier.bars[0].value, table.boat[tier.tier].slots);
    assert.ok(tier.bars[0].fill > 0 && tier.bars[0].fill <= 1);
  }
  assert.equal(rich.tiers[3].bars[0].fill, 1, "the top boat fills the bar");
  assert.equal(
    view({ rod: 0, bait: 0, baitUsed: 0, boat: 3 }, 0).boat.top,
    true,
  );
  // the market's rows are as they were
  const both = view({ rod: 0, bait: 0, baitUsed: 0, boat: 2 }, 0);
  assert.equal(both.rod.kind, "rod");
  assert.equal(both.bait.kind, "bait");
});
