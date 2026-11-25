import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Angler,
  CAST_MAX,
  CAST_MIN,
  CHARGE_MS,
  FLIGHT_MS,
  HOOK_WINDOW_MS,
  SPECIES,
  SWEET_FROM,
  SWEET_POWER,
  SWEET_TO,
  addCatch,
  castDirection,
  castDistance,
  castTarget,
  heldSpecies,
  planRound,
  releaseOne,
  rollFish,
  speciesById,
  stockTotal,
  zoneAt,
  SHORE_RANGE,
  DEEP_RANGE,
} from "../src/ocean/fishing.ts";
import {
  UPGRADES,
  TIER_COUNT,
  DEFAULT_LOADOUT,
} from "../src/ocean/upgrades.ts";
import { SEA_BOUND, islands } from "../src/ocean/model.ts";
import { shoreOf, shoreShape } from "../src/ocean/shore.ts";

/** Just off island 0's south beach (z grows southward): a cast to the north lands on its sand. */
const offSouthShore = {
  x: islands[0].x,
  z: islands[0].z + shoreShape(0).coast(Math.PI / 2) + 5,
};

// A small seeded generator so distributions are tested without flakiness.
const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

test("the species table is consistent and every zone has fish", () => {
  assert.equal(new Set(SPECIES.map((s) => s.id)).size, SPECIES.length);
  for (const s of SPECIES) {
    assert.ok(s.kg[0] > 0 && s.kg[0] < s.kg[1], s.id);
    assert.ok([1, 2, 3].includes(s.rarity), s.id);
    assert.ok(
      Object.values(s.zones).every((w) => w >= 0),
      s.id,
    );
    assert.ok(
      Object.values(s.zones).some((w) => w > 0),
      `${s.id} lives somewhere`,
    );
  }
  for (const zone of ["shore", "open", "deep"])
    assert.ok(
      SPECIES.some((s) => s.zones[zone] > 0 && s.rarity === 1) ||
        SPECIES.some((s) => s.zones[zone] > 0),
      zone,
    );
  assert.equal(speciesById("ca-map").name, "Cá mập");
  assert.equal(SPECIES.length, 10, "ten animals, one model file each");
});

test("zones follow the distance to the nearest island shore", () => {
  const east = islands[0].x + shoreShape(0).coast(0);
  assert.equal(zoneAt(east + 10, islands[0].z), "shore");
  assert.equal(zoneAt(east + 80, islands[0].z), "open");
  assert.equal(
    zoneAt(-300, -250),
    "deep",
    "far from every shore and the harbor",
  );
  assert.equal(zoneAt(0, 22), "open", "the harbor is open water");
  // Measured from the real, irregular coast: the zone edges follow its bays and headlands,
  // SHORE_RANGE and DEEP_RANGE metres out along the shore's normal, all round every island.
  for (let index = 0; index < islands.length; index++)
    for (let a = 0; a < Math.PI * 2; a += 0.21) {
      const island = islands[index];
      const coast = shoreShape(index).coast(a);
      // The point `metres` off the coast (measured along its normal, not along the radius).
      const at = (metres) => {
        let lo = coast - 5;
        let hi = coast + metres * 3;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          const d = shoreOf(
            index,
            island.x + Math.cos(a) * mid,
            island.z + Math.sin(a) * mid,
          ).distance;
          if (d < metres) lo = mid;
          else hi = mid;
        }
        const r = (lo + hi) / 2;
        return zoneAt(island.x + Math.cos(a) * r, island.z + Math.sin(a) * r);
      };
      assert.equal(
        at(1),
        "shore",
        `island ${index} at ${a}: just off the sand`,
      );
      assert.equal(at(SHORE_RANGE - 1), "shore");
      const outside = at(SHORE_RANGE + 1);
      assert.notEqual(
        outside,
        "shore",
        `island ${index} at ${a}: past the shore band`,
      );
    }
  // The old ranges were measured from the radius circle, about 2.5 m beyond the sand.
  assert.equal(SHORE_RANGE, 30);
  assert.equal(DEEP_RANGE, 128);
});

test("what you catch depends on where, small fish are common and big ones rare, the sweet spot helps", () => {
  const rng = seeded(11);
  const rolls = (zone, sweet = false) =>
    Array.from({ length: 6000 }, () => rollFish(zone, rng, sweet));
  const shore = rolls("shore");
  const deep = rolls("deep");
  assert.ok(
    shore.every((c) => speciesById(c.species).zones.shore > 0),
    "shore only gives shore fish",
  );
  assert.ok(
    deep.every((c) => speciesById(c.species).zones.deep > 0),
    "deep only gives deep fish",
  );
  assert.ok(!shore.some((c) => ["ca-map", "ca-heo"].includes(c.species)));
  assert.ok(
    deep.some((c) => c.species === "ca-map"),
    "deep water has the big ones",
  );
  for (const c of [...shore, ...deep]) {
    const s = speciesById(c.species);
    assert.ok(c.kg >= s.kg[0] - 1e-9 && c.kg <= s.kg[1] + 1e-9);
    assert.ok(c.cm > 0);
  }
  // Within a species the weight is skewed to the light end.
  const sharks = deep.filter((c) => c.species === "ca-map");
  const [low, high] = speciesById("ca-map").kg;
  const mean = sharks.reduce((a, c) => a + c.kg, 0) / sharks.length;
  assert.ok(
    mean < low + (high - low) * 0.4,
    `most sharks are modest (${mean.toFixed(1)} kg)`,
  );
  const rareShare = (list) =>
    list.filter((c) => speciesById(c.species).rarity > 1).length / list.length;
  assert.ok(
    rareShare(rolls("open", true)) > rareShare(rolls("open", false)) * 1.15,
    "the sweet spot raises the share of better fish",
  );
  assert.deepEqual(rollFish("open", seeded(5)), rollFish("open", seeded(5)));
});

test("casts: power maps to distance, the sweet spot is marked, islands and the edge are not water", () => {
  assert.equal(castDistance(0), CAST_MIN);
  assert.equal(castDistance(1), CAST_MAX);
  assert.equal(castDistance(2), CAST_MAX, "clamped");
  const dir = castDirection(0);
  assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-9);
  assert.ok(
    dir.z < 0 && dir.x > 0,
    "ahead (-Z) and a little to starboard (+X)",
  );
  const east = castDirection(Math.PI / 2);
  assert.ok(east.x > 0, "heading 90 degrees points the cast towards +X");
  assert.ok(
    SWEET_POWER[0] > 0 && SWEET_POWER[1] < 1 && SWEET_POWER[0] < SWEET_POWER[1],
  );
  assert.equal(
    castTarget({ x: 0, z: 0 }, { x: 0, z: -1 }, SWEET_POWER[0] + 0.01).sweet,
    true,
  );
  assert.equal(castTarget({ x: 0, z: 0 }, { x: 0, z: -1 }, 0).sweet, false);
  assert.equal(castTarget({ x: 0, z: 0 }, { x: 0, z: -1 }, 1).sweet, false);
  assert.ok(SWEET_FROM >= CAST_MIN && SWEET_TO <= CAST_MAX);
  assert.equal(castTarget({ x: 0, z: 0 }, { x: 0, z: -1 }, 0.5).water, true);
  assert.equal(
    castTarget(offSouthShore, { x: 0, z: -1 }, 1).water,
    false,
    "the bobber would land on the island",
  );
  assert.equal(
    castTarget({ x: SEA_BOUND - 10, z: 0 }, { x: 1, z: 0 }, 1).water,
    false,
    "past the edge",
  );
});

function harness(rng = () => 0.5) {
  const events = [];
  const angler = new Angler((e) => events.push(e), rng);
  const types = () => events.map((e) => e.type);
  return { angler, events, types };
}
const FROM = { x: 0, z: 0 };
const DIR = { x: 0, z: -1 };
/** Charges to the sweet spot and throws at t0; returns the time the bobber lands. */
function cast(angler, t0 = 0) {
  angler.startCharge(t0);
  const held = ((SWEET_POWER[0] + SWEET_POWER[1]) / 2) * CHARGE_MS;
  angler.release(t0 + held, FROM, DIR);
  return t0 + held;
}

test("angler: charging, a cast that fizzles on land, a throw that flies then waits", () => {
  const { angler, types } = harness();
  assert.equal(angler.busy, false);
  angler.startCharge(1000);
  assert.equal(angler.view(1000 + CHARGE_MS / 2).power, 0.5);
  assert.equal(angler.view(1000 + CHARGE_MS * 3).power, 1, "full power holds");
  assert.equal(angler.fishing, false, "charging is not fishing yet");
  angler.release(1000 + CHARGE_MS, offSouthShore, DIR);
  assert.deepEqual(types(), ["fizzle"]);
  assert.equal(angler.busy, false);
  const landed = cast(angler, 5000);
  assert.equal(angler.view(landed).phase, "flying");
  assert.equal(angler.fishing, true);
  angler.update(landed + FLIGHT_MS - 1);
  assert.equal(angler.view(landed + 1).phase, "flying");
  angler.update(landed + FLIGHT_MS);
  assert.equal(angler.view(landed + FLIGHT_MS).phase, "waiting");
  assert.deepEqual(types().slice(-1), ["splash"]);
});

test("angler: nibbles, then a bite, then exactly one second to pull", () => {
  // rng 0.5 on a sweet cast: lands, waits 2800 ms, nibbles at +2800 and +3600, bites at +4550.
  const { angler, types, events } = harness();
  const landed = cast(angler);
  const start = landed + FLIGHT_MS;
  const run = (until) => {
    for (let t = start; t <= until; t += 16) angler.update(t);
  };
  run(start + 2700);
  assert.equal(angler.view(start + 2700).phase, "waiting");
  run(start + 2900);
  assert.equal(angler.view(start + 2900).phase, "nibbling");
  assert.ok(angler.view(start + 2900).nibbleAges.length === 1);
  run(start + 3700);
  assert.equal(types().filter((t) => t === "nibble").length, 2);
  assert.ok(!types().includes("bite"));
  run(start + 4600);
  assert.equal(angler.view(start + 4600).phase, "biting");
  assert.ok(types().includes("bite"));
  const biteAt = start + 4550;
  assert.ok(
    angler.view(biteAt + 500).hurry > 0.3 &&
      angler.view(biteAt + 500).hurry < 0.7,
  );
  // Pulling inside the window hooks the fish: the tug of war begins, nothing is caught yet.
  angler.pull(biteAt + HOOK_WINDOW_MS - 20, 22);
  const hooked = events.find((e) => e.type === "hooked");
  assert.ok(hooked, "hooked");
  assert.ok(speciesById(hooked.fish.species));
  assert.equal(angler.view(biteAt + 1000).phase, "fighting");
  assert.ok(!types().includes("caught"), "not landed yet");
  assert.equal(angler.busy, true);
  assert.equal(angler.fishing, true, "the boat stays put while the fish is on");
  assert.equal(angler.view(biteAt + 1000).fight.distance, 22);
});

/** Hooks a fish on the first bite of a sweet cast; returns the time of the hook. */
function hook(h, distance = 22) {
  const landed = cast(h.angler);
  const start = landed + FLIGHT_MS;
  const biteAt = start + 4550;
  for (let t = start; t <= biteAt + 60; t += 16) h.angler.update(t);
  h.angler.pull(biteAt + 100, distance);
  return biteAt + 100;
}
/** Plays the tug of war frame by frame with a policy; returns the time it ended. */
function fightOn(h, from, policy) {
  let t = from;
  while (h.angler.view(t).phase === "fighting" && t < from + 90000) {
    t += 16;
    h.angler.update(t);
    const fight = h.angler.view(t).fight;
    if (!fight) break;
    if (policy(fight)) h.angler.pull(t);
    else h.angler.letGo();
  }
  return t;
}
const careful = (v) =>
  v.mood === "tired" || (v.mood === "strong" && v.tension < 0.5);

test("angler: a hooked fish is landed by a careful player and the catch arrives only then", () => {
  const h = harness(() => 0.5);
  const start = hook(h);
  const end = fightOn(h, start, careful);
  assert.ok(h.types().includes("caught"), `caught (${h.types().join(",")})`);
  assert.ok(h.types().includes("mood"), "the mood changes were reported");
  assert.equal(h.angler.busy, false);
  assert.ok(end - start > 3000, "a fight takes more than a few seconds");
  const caught = h.events.find((e) => e.type === "caught");
  assert.deepEqual(
    caught.fish,
    h.events.find((e) => e.type === "hooked").fish,
    "the fish hooked is the fish landed",
  );
});

test("angler: reeling against a surge loses the fish; so does never reeling", () => {
  let h = harness(() => 0.5);
  let start = hook(h);
  fightOn(h, start, () => true);
  assert.deepEqual(h.types().slice(-1), ["lost"]);
  assert.equal(h.events.at(-1).reason, "snap");
  assert.ok(!h.types().includes("caught"));
  assert.equal(h.angler.busy, false);
  h = harness(() => 0.5);
  start = hook(h);
  fightOn(h, start, () => false);
  assert.deepEqual(h.types().slice(-1), ["lost"]);
  assert.ok(
    ["run", "shed"].includes(h.events.at(-1).reason),
    h.events.at(-1).reason,
  );
});

test("angler: leaving mid-fight (the boat drifted, a hidden tab) loses the fish once, and a long gap is capped", () => {
  const h = harness(() => 0.5);
  const start = hook(h);
  h.angler.cancel();
  assert.deepEqual(h.types().slice(-1), ["lost"]);
  assert.equal(h.events.at(-1).reason, "cancel");
  h.angler.cancel();
  assert.equal(h.types().filter((t) => t === "lost").length, 1, "only once");
  // A frame after a very long gap advances the fight by at most a moment.
  const g = harness(() => 0.5);
  const from = hook(g);
  g.angler.update(from + 600000);
  assert.equal(
    g.angler.view(from + 600000).phase,
    "fighting",
    "one frame cannot end a fight",
  );
  assert.ok(start > 0);
});

test("angler: a late pull catches nothing, an early pull reels in, waiting too long loses the fish", () => {
  let h = harness();
  let landed = cast(h.angler);
  let start = landed + FLIGHT_MS;
  for (let t = start; t <= start + 4540 + HOOK_WINDOW_MS + 50; t += 16)
    h.angler.update(t);
  assert.ok(h.types().includes("escaped"), "the window closed");
  assert.ok(!h.types().includes("caught"));
  assert.equal(h.angler.busy, false);
  // Even if no frame ran in between, a late pull does not count.
  h = harness();
  landed = cast(h.angler);
  start = landed + FLIGHT_MS;
  for (let t = start; t <= start + 4600; t += 16) h.angler.update(t);
  h.angler.pull(start + 4550 + HOOK_WINDOW_MS + 5);
  assert.ok(!h.types().includes("caught"));
  assert.deepEqual(h.types().slice(-1), ["retrieved"]);
  // Pulling while it nibbles just reels the line in.
  h = harness();
  landed = cast(h.angler);
  start = landed + FLIGHT_MS;
  for (let t = start; t <= start + 3000; t += 16) h.angler.update(t);
  h.angler.pull(start + 3000);
  assert.deepEqual(h.types().slice(-1), ["retrieved"]);
  assert.equal(h.angler.busy, false);
  // cancel() (boat drifted off) reels in without leaving a caught fish.
  h = harness();
  cast(h.angler);
  h.angler.cancel();
  assert.deepEqual(h.types().slice(-1), ["retrieved"]);
  h.angler.cancel();
  assert.equal(
    h.types().filter((t) => t === "retrieved").length,
    1,
    "only once",
  );
});

test("fish nibble 1 to 3 times and sometimes lose interest; the sweet spot waits less", () => {
  const rng = seeded(3);
  let none = 0;
  let waitSweet = 0;
  let waitFar = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const r = planRound(0, false, rng);
    assert.ok(r.nibbles.length >= 1 && r.nibbles.length <= 3);
    assert.ok(r.nibbles.every((t, k) => k === 0 || t > r.nibbles[k - 1]));
    if (r.biteAt === undefined) none++;
    else assert.ok(r.biteAt > r.nibbles.at(-1));
    waitFar += r.nibbles[0];
    waitSweet += planRound(0, true, rng).nibbles[0];
  }
  assert.ok(
    none / n > 0.1 && none / n < 0.3,
    `about one in five lose interest (${none / n})`,
  );
  assert.ok(waitSweet < waitFar * 0.8, "the sweet spot is quicker");
});

test("the fish store counts held fish, keeps records, releases one at a time and ignores empty releases", () => {
  let store = {};
  let r = addCatch(store, { species: "tom-hum", kg: 3.2, cm: 54 });
  assert.equal(r.record, true);
  store = r.inventory;
  r = addCatch(store, { species: "tom-hum", kg: 2.1, cm: 47 });
  assert.equal(r.record, false, "lighter than the best");
  store = r.inventory;
  r = addCatch(store, { species: "ca-madeka", kg: 0.03, cm: 7 });
  store = r.inventory;
  assert.equal(stockTotal(store), 3);
  assert.deepEqual(
    heldSpecies(store).map((s) => s.id),
    ["ca-madeka", "tom-hum"],
    "table order, only what is held",
  );
  store = releaseOne(store, "tom-hum");
  assert.equal(store["tom-hum"].n, 1);
  assert.equal(store["tom-hum"].best, 3.2, "the record stays after a release");
  store = releaseOne(releaseOne(store, "tom-hum"), "tom-hum");
  assert.equal(store["tom-hum"].n, 0);
  assert.deepEqual(
    heldSpecies(store).map((s) => s.id),
    ["ca-madeka"],
    "nothing held, no card",
  );
  assert.equal(
    releaseOne(store, "ca-rong"),
    store,
    "unknown species untouched",
  );
});

test("a fish is drawn at a size that fits its species, never filling the boat", async () => {
  const { SPECIES, drawnLength } = await import("../src/ocean/fishing.ts");
  const by = (id) => SPECIES.find((s) => s.id === id);
  const madeka = drawnLength(by("ca-madeka"), by("ca-madeka").kg[0]);
  const shark = drawnLength(by("ca-map"), by("ca-map").kg[1]);
  assert.ok(madeka < shark, "a small fish is drawn smaller than a big one");
  for (const species of SPECIES)
    for (const kg of species.kg) {
      const length = drawnLength(species, kg);
      assert.ok(
        length >= 0.3 && length <= 4,
        `${species.id} ${kg} kg: ${length} m`,
      );
    }
  // A heavier fish of the same kind is never drawn smaller.
  const s = by("tom-hum");
  assert.ok(drawnLength(s, s.kg[1]) >= drawnLength(s, s.kg[0]));
});

// ----- The bait: a better bait makes rare fish likelier -----

const rareShares = (zone, tier, sweet = false, seed = 77, rolls = 20000) => {
  const rng = seeded(seed);
  let two = 0;
  let three = 0;
  for (let i = 0; i < rolls; i++) {
    const { rarity } = speciesById(
      rollFish(zone, rng, sweet, UPGRADES.bait[tier]).species,
    );
    if (rarity === 2) two++;
    if (rarity === 3) three++;
  }
  return { two: two / rolls, three: three / rolls };
};

test("rollFish with no bait is the old roll: the same fish and the same rng draws as before the baits", () => {
  // Recorded from rollFish before the bait parameter existed (rng seed 2024).
  const RECORDED = [
    "ca-madeka:0.05",
    "sao-bien:0.18",
    "cua-bien:1.95",
    "sua:3.44",
    "sua:2.86",
    "sua:2.45",
    "rua-bien:28.8",
    "sua:3.11",
    "ca-heo:60.3",
    "ca-heo:85.1",
    "sua:1.91",
    "ca-map:94.8",
    "sua:0.97",
    "sua:0.35",
    "sua:1.27",
    "ca-he:0.24",
  ];
  const run = (bait) => {
    const rng = seeded(2024);
    const out = [];
    for (const [zone, sweet] of [
      ["shore", false],
      ["open", true],
      ["deep", false],
      ["open", false],
    ])
      for (let i = 0; i < 4; i++) {
        const c = rollFish(zone, rng, sweet, bait);
        out.push(`${c.species}:${c.kg}`);
      }
    return { out, next: rng() };
  };
  for (const bait of [undefined, UPGRADES.bait[0]]) {
    const { out, next } = run(bait);
    assert.deepEqual(out, RECORDED);
    // Two draws a roll, nothing more: the next draw is where the old code left the generator.
    assert.equal(next, 0.11517729028128088);
  }
  assert.equal(DEFAULT_LOADOUT.baitUsed, 0);
});

test("a better bait makes rare fish likelier in every zone, with and without the sweet spot", () => {
  assert.equal(TIER_COUNT, 4);
  for (const zone of ["shore", "open", "deep"])
    for (const sweet of [false, true]) {
      const shares = [0, 1, 2, 3].map((tier) => rareShares(zone, tier, sweet));
      for (let tier = 1; tier < 4; tier++) {
        const rare = (s) => s.two + s.three;
        assert.ok(
          rare(shares[tier]) > rare(shares[tier - 1]),
          `${zone} sweet=${sweet}: tier ${tier} ${rare(shares[tier]).toFixed(3)} > ${rare(shares[tier - 1]).toFixed(3)}`,
        );
        // Rarity 3 grows with every bait wherever it lives; rarity 2 wherever it lives.
        if (shares[0].three > 0)
          assert.ok(shares[tier].three > shares[tier - 1].three, `${zone} r3`);
        if (shares[0].two > 0)
          assert.ok(shares[tier].two > shares[tier - 1].two, `${zone} r2`);
      }
    }
  // Measured (20,000 rolls, share of rarity 2 / rarity 3, no sweet spot), tiers 0 to 3:
  //   shore 16.7/0.7  22.9/1.2  30.0/1.7  38.0/2.5
  //   open  25.4/10.7 31.4/16.0 36.9/21.2 40.9/26.8
  //   deep  0.0/37.5  0.0/52.1  0.0/64.3  0.0/74.7
  assert.ok(rareShares("shore", 3).two > rareShares("shore", 0).two * 2);
  assert.ok(rareShares("deep", 3).three > rareShares("deep", 0).three * 1.8);
  assert.equal(
    rareShares("deep", 3).two,
    0,
    "no rarity 2 lives in the deep sea",
  );
});

test("a bait only changes the odds of the rare fish: the common ones stay possible and only live fish are caught", () => {
  for (const zone of ["shore", "open", "deep"]) {
    const rng = seeded(5);
    const seen = new Set();
    for (let i = 0; i < 6000; i++) {
      const c = rollFish(zone, rng, true, UPGRADES.bait[3]);
      assert.ok(speciesById(c.species).zones[zone] > 0, `${zone} ${c.species}`);
      seen.add(speciesById(c.species).rarity);
    }
    assert.ok(
      seen.has(1) || zone === "deep",
      `${zone} still gives common fish`,
    );
  }
  // Multipliers of exactly 1 change nothing.
  assert.deepEqual(
    rollFish("open", seeded(9), true, { rare2: 1, rare3: 1 }),
    rollFish("open", seeded(9), true),
  );
});

/** An Angler with a loadout; its rng is 0.5 until `live.on`, then `random` (so the bite is on time). */
function loadoutHarness(loadout, random = () => 0.5) {
  const events = [];
  const live = { on: false };
  const angler = new Angler(
    (e) => events.push(e),
    () => (live.on ? random() : 0.5),
    1,
    loadout ? () => loadout : undefined,
  );
  return { angler, events, live, types: () => events.map((e) => e.type) };
}
/** Hooks a fish at the first bite; the roll and the fight use the live rng. */
function hookLive(h, distance = 22) {
  const start = cast(h.angler) + FLIGHT_MS;
  const biteAt = start + 4550;
  for (let t = start; t <= biteAt + 60; t += 16) h.angler.update(t);
  h.live.on = true;
  h.angler.pull(biteAt + 100, distance);
  return biteAt + 100;
}

test("the angler reads the loadout when the fish takes the hook: the bait in use picks the fish, the rod sets the line", () => {
  const rareOf = (loadout) => {
    let rare = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const h = loadoutHarness(loadout, seeded(seed));
      hookLive(h);
      const hooked = h.events.find((e) => e.type === "hooked");
      if (speciesById(hooked.fish.species).rarity > 1) rare++;
    }
    return rare / n;
  };
  const none = rareOf(undefined);
  assert.equal(
    rareOf({ ...DEFAULT_LOADOUT }),
    none,
    "the default loadout is no loadout",
  );
  const best = rareOf({ rod: 0, bait: 3, baitUsed: 3, boat: 0 });
  assert.ok(best > none * 1.2, `bait 3 ${best} against ${none}`);
  // Every bait bought is kept but only the one in use counts.
  assert.equal(rareOf({ rod: 0, bait: 3, baitUsed: 0, boat: 0 }), none);
  assert.ok(rareOf({ rod: 0, bait: 2, baitUsed: 2, boat: 0 }) > none);
  // A bait tier that does not exist is the free bait.
  assert.equal(rareOf({ rod: 0, bait: 9, baitUsed: 9, boat: 0 }), none);

  // The rod: the same fish and the same rng, button held, the line lasts longer with a better rod.
  const holdTime = (rod) => {
    const h = loadoutHarness({ rod, bait: 0, baitUsed: 0, boat: 0 });
    const start = hookLive(h);
    const end = fightOn(h, start, () => true);
    assert.ok(h.types().includes("lost"), `rod ${rod} snapped (${h.types()})`);
    assert.equal(h.events.find((e) => e.type === "lost").reason, "snap");
    return end - start;
  };
  const times = [0, 1, 2, 3].map(holdTime);
  for (let tier = 1; tier < 4; tier++)
    assert.ok(times[tier] > times[tier - 1], `rod ${times}`);
  assert.equal(
    holdTime(0),
    (() => {
      const h = harness(() => 0.5);
      const start = hook(h);
      return fightOn(h, start, () => true) - start;
    })(),
    "the free rod holds as long as an Angler without a loadout",
  );
});

test("a store keeps a fish only while it has a slot, and one that holds more than it has is left alone", async () => {
  const {
    canKeep,
    stockTotal,
    addCatch: add,
  } = await import("../src/ocean/fishing.ts");
  let store = {};
  for (let i = 0; i < 19; i++)
    store = add(store, { species: "ca-he", kg: 1, cm: 30 }).inventory;
  assert.equal(stockTotal(store), 19);
  assert.equal(canKeep(store, 20), true, "19 of 20: one more fits");
  store = add(store, { species: "ca-map", kg: 2, cm: 40 }).inventory;
  assert.equal(stockTotal(store), 20);
  assert.equal(canKeep(store, 20), false, "20 of 20: full");
  assert.equal(canKeep(store, 50), true, "a bigger boat makes room");
  // a store from before the slots: more fish than slots. It is not trimmed, it only takes no more.
  const legacy = { "ca-he": { n: 35, best: 3 } };
  assert.equal(canKeep(legacy, 20), false);
  assert.equal(stockTotal(legacy), 35, "nothing is taken away");
  assert.equal(canKeep(legacy, 35), false, "exactly full");
  assert.equal(canKeep(legacy, 36), true);
  assert.equal(canKeep({}, 20), true);
});
