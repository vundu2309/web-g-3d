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
} from "../src/ocean/fishing.ts";

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
  assert.equal(speciesById("ca-ngu").name, "Cá ngừ");
});

test("zones follow the distance to the nearest island shore", () => {
  assert.equal(zoneAt(-68 + 18 + 10, -65), "shore");
  assert.equal(zoneAt(-136, -65), "open");
  assert.equal(zoneAt(-170, 150), "deep");
  assert.equal(zoneAt(0, 22), "open", "the harbor is open water");
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
  assert.ok(
    !shore.some((c) => ["ca-ngu", "ca-kiem", "ca-duoi"].includes(c.species)),
  );
  assert.ok(
    deep.some((c) => c.species === "ca-kiem"),
    "deep water has the big ones",
  );
  for (const c of [...shore, ...deep]) {
    const s = speciesById(c.species);
    assert.ok(c.kg >= s.kg[0] - 1e-9 && c.kg <= s.kg[1] + 1e-9);
    assert.ok(c.cm > 0);
  }
  // Within a species the weight is skewed to the light end.
  const tuna = deep.filter((c) => c.species === "ca-ngu");
  const [low, high] = speciesById("ca-ngu").kg;
  const mean = tuna.reduce((a, c) => a + c.kg, 0) / tuna.length;
  assert.ok(
    mean < low + (high - low) * 0.4,
    `most tuna are modest (${mean.toFixed(1)} kg)`,
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
    castTarget({ x: -68, z: -10 }, { x: 0, z: -1 }, 1).water,
    false,
    "the bobber would land on the island",
  );
  assert.equal(
    castTarget({ x: 170, z: 0 }, { x: 1, z: 0 }, 1).water,
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
  angler.release(1000 + CHARGE_MS, { x: -68, z: -10 }, DIR);
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
  let r = addCatch(store, { species: "ca-mu", kg: 3.2, cm: 54 });
  assert.equal(r.record, true);
  store = r.inventory;
  r = addCatch(store, { species: "ca-mu", kg: 2.1, cm: 47 });
  assert.equal(r.record, false, "lighter than the best");
  store = r.inventory;
  r = addCatch(store, { species: "ca-com", kg: 0.1, cm: 11 });
  store = r.inventory;
  assert.equal(stockTotal(store), 3);
  assert.deepEqual(
    heldSpecies(store).map((s) => s.id),
    ["ca-com", "ca-mu"],
    "table order, only what is held",
  );
  store = releaseOne(store, "ca-mu");
  assert.equal(store["ca-mu"].n, 1);
  assert.equal(store["ca-mu"].best, 3.2, "the record stays after a release");
  store = releaseOne(releaseOne(store, "ca-mu"), "ca-mu");
  assert.equal(store["ca-mu"].n, 0);
  assert.deepEqual(
    heldSpecies(store).map((s) => s.id),
    ["ca-com"],
    "nothing held, no card",
  );
  assert.equal(
    releaseOne(store, "ca-kiem"),
    store,
    "unknown species untouched",
  );
});
