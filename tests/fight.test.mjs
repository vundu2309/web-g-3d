import { test } from "node:test";
import assert from "node:assert/strict";
import { UPGRADES, TIER_COUNT } from "../src/ocean/upgrades.ts";
import {
  Fight,
  FIGHT_STYLES,
  LANDED_WITHIN,
  SNAP,
  TENSION_FLOOR,
} from "../src/ocean/fight.ts";

const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const STYLES = Object.keys(FIGHT_STYLES);
const make = (style = "runner", weight = 0.5, seed = 1, distance = 25) =>
  new Fight({ style, weight, distance, maxLine: 48, rng: seeded(seed) });
const END = ["snap", "escaped", "shed", "landed"];

/** Plays a fight at 30 fps with a policy; returns how it ended and how long it took. */
function play(fight, policy, limit = 100) {
  const dt = 1 / 30;
  let t = 0;
  let end = null;
  while (!fight.finished && t < limit) {
    fight.reel(policy(fight.view(), t));
    for (const event of fight.update(dt))
      if (END.includes(event.type)) end = event.type;
    t += dt;
  }
  return { end, t };
}
// A careful player: reel a tired fish, or a strong one while the line is slack enough.
const careful = (v) =>
  v.mood === "tired" || (v.mood === "strong" && v.tension < 0.5);

/** Plays on (idle, or with a policy) until the fish is in the given mood. */
function until(mood, fight, policy = () => false) {
  for (
    let i = 0;
    i < 3000 && fight.view().mood !== mood && !fight.finished;
    i++
  ) {
    fight.reel(policy(fight.view(), i / 30));
    fight.update(1 / 30);
  }
  return fight;
}

test("reeling against a surge snaps the line fast, and nothing reels a surging fish in", () => {
  for (const style of STYLES.filter((s) => s !== "crawler")) {
    const fight = until("surge", make(style));
    assert.equal(fight.view().mood, "surge", style);
    const before = fight.view().distance;
    fight.reel(true);
    const events = [];
    let t = 0;
    while (!fight.finished && t < 3) {
      events.push(...fight.update(1 / 30));
      t += 1 / 30;
    }
    assert.ok(
      events.some((e) => e.type === "snap"),
      `${style} snapped`,
    );
    assert.ok(t < 1, `${style} snapped within a second, took ${t.toFixed(2)}`);
    assert.ok(
      fight.view().distance >= before - 0.1,
      "no line won against a surge",
    );
  }
});

test("letting go in a surge is safe: the line stays under the limit and the fish tires", () => {
  const fight = until("surge", make("runner", 0.5, 4));
  const stamina = fight.view().stamina;
  fight.reel(false);
  let peak = 0;
  for (let i = 0; i < 90 && fight.view().mood === "surge"; i++) {
    fight.update(1 / 30);
    peak = Math.max(peak, fight.view().tension);
  }
  assert.ok(peak < SNAP, `tension ${peak}`);
  assert.ok(fight.view().stamina < stamina, "the surge wore the fish out");
  // The fish takes line while it runs.
  assert.ok(fight.view().distance > 25);
});

test("a tired fish can be reeled all the way in without the line snapping", () => {
  for (const style of STYLES) {
    for (const weight of [0, 1]) {
      const fight = until("tired", make(style, weight, 2, 30), careful);
      assert.equal(
        fight.view().mood,
        "tired",
        `${style} w${weight} tires when left alone`,
      );
      fight.reel(true);
      let landed = false;
      let t = 0;
      while (!fight.finished && t < 20) {
        for (const event of fight.update(1 / 30)) {
          assert.notEqual(
            event.type,
            "snap",
            `${style} w${weight} snapped while tired`,
          );
          if (event.type === "landed") landed = true;
        }
        t += 1 / 30;
      }
      assert.ok(landed, `${style} w${weight} landed within 20 s`);
      assert.equal(fight.view().distance, 0);
    }
  }
});

test("reeling for too long against a strong fish loses it; short pulls do not", () => {
  // Hold the button from the start: every style ends in a snap, never a landing.
  for (const style of STYLES)
    for (const weight of [0, 1]) {
      const { end } = play(make(style, weight, 3), () => true);
      assert.equal(end, "snap", `${style} w${weight}`);
    }
  // A strong, steady fish (no surges yet) still takes tension from a long pull.
  const fight = make("crawler", 0.5, 1);
  fight.reel(true);
  let t = 0;
  while (!fight.finished && t < 20) {
    fight.update(0.1);
    t += 0.1;
  }
  assert.equal(fight.view().tension, SNAP);
  // Short pulls on a strong fish: the tension never reaches the limit.
  const careful = make("crawler", 0.5, 1);
  let peak = 0;
  for (let i = 0; i < 600; i++) {
    careful.reel(i % 30 < 10);
    careful.update(1 / 30);
    peak = Math.max(peak, careful.view().tension);
  }
  assert.ok(peak < SNAP, `peak ${peak}`);
});

test("a careful player lands every kind of fish in a sensible time; a button-masher never does", () => {
  for (const style of STYLES)
    for (const weight of [0, 0.5, 1])
      for (let seed = 1; seed <= 12; seed++) {
        const result = play(make(style, weight, seed), careful);
        assert.equal(
          result.end,
          "landed",
          `${style} w${weight} seed ${seed}: ${result.end}`,
        );
        assert.ok(
          result.t > 4 && result.t < 40,
          `${style} w${weight}: ${result.t.toFixed(1)} s`,
        );
        const masher = play(make(style, weight, seed), () => true);
        assert.equal(masher.end, "snap", `${style} masher`);
      }
});

test("never reeling never lands the fish: it runs out the line or shakes the hook", () => {
  for (const style of STYLES) {
    const { end } = play(make(style, 1, 5), () => false);
    assert.ok(["escaped", "shed"].includes(end), `${style}: ${end}`);
  }
});

test("a tired fish that is left alone for a while recovers and fights again", () => {
  const fight = until("tired", make("steady", 0.2, 6));
  assert.equal(fight.view().mood, "tired");
  const events = [];
  for (let i = 0; i < 30 * 12 && !fight.finished; i++)
    events.push(...fight.update(1 / 30));
  assert.ok(
    events.some((e) => e.type === "recovered"),
    "it recovered",
  );
});

test("the fight is deterministic, ignores frame length and resting tension follows the mood", () => {
  const a = make("jet", 0.6, 9);
  const b = make("jet", 0.6, 9);
  const log = (fight, step) => {
    const out = [];
    for (let t = 0; t < 8; t += step) {
      fight.reel(Math.floor(t) % 2 === 0);
      out.push(...fight.update(step).map((e) => e.type));
    }
    return out;
  };
  assert.deepEqual(
    log(a, 1 / 60),
    log(b, 1 / 20),
    "frame length does not change what happens",
  );
  // Left alone, tension settles on the resting level of the mood.
  const calm = make("steady", 0.5, 2);
  calm.update(0.5);
  assert.ok(
    Math.abs(calm.view().tension - TENSION_FLOOR[calm.view().mood]) < 0.1,
  );
  assert.ok(LANDED_WITHIN > 0);
});

// ----- The rod: a better rod slows how fast the line strain builds -----

const rodTier = (tier) => UPGRADES.rod[tier].tension;
const makeRod = (tier, style, weight, seed) =>
  new Fight({
    style,
    weight,
    distance: 25,
    maxLine: 48,
    rng: seeded(seed),
    rodTension: rodTier(tier),
  });

/** A hasty player: sees the fish `lag` frames late and reels while strong and under `limit`. */
function hasty(limit, lag) {
  const seen = [];
  return (view) => {
    seen.push(view);
    const late = seen[Math.max(0, seen.length - 1 - lag)];
    return (
      late.mood === "tired" || (late.mood === "strong" && late.tension < limit)
    );
  };
}

/** The share of fights a hasty bot loses to a snapped line, over fixed seeds, at a rod tier. */
function snapShare(tier, styles) {
  let snapped = 0;
  let total = 0;
  for (const style of styles)
    for (const lag of [3, 4, 5, 6])
      for (const limit of [0.5, 0.6])
        for (let seed = 1; seed <= 100; seed++)
          for (const weight of [0.5, 1]) {
            const { end } = play(
              makeRod(tier, style, weight, seed),
              hasty(limit, lag),
            );
            if (end === "snap") snapped++;
            total++;
          }
  return snapped / total;
}

test("a better rod snaps the line less often: the share of snapped fights falls with each tier", () => {
  assert.equal(TIER_COUNT, 4);
  for (const styles of [["heavy"], ["heavy", "runner", "jet"]]) {
    const shares = [0, 1, 2, 3].map((tier) => snapShare(tier, styles));
    // Measured (hasty bot, 1,600 fights per style and tier): heavy 0.48 0.22 0.10 0.03,
    // heavy+runner+jet 0.29 0.20 0.08 0.02.
    for (let tier = 1; tier < 4; tier++)
      assert.ok(
        shares[tier] < shares[tier - 1],
        `${styles}: tier ${tier} ${shares[tier].toFixed(3)} < tier ${tier - 1} ${shares[tier - 1].toFixed(3)}`,
      );
    assert.ok(shares[0] > 0.2, `${styles}: the free rod snaps often enough`);
    assert.ok(shares[3] < 0.1, `${styles}: the best rod rarely snaps`);
  }
});

test("a better rod still snaps for a player who never lets go, at every tier and style", () => {
  for (let tier = 0; tier < TIER_COUNT; tier++)
    for (const style of STYLES)
      for (const weight of [0, 1])
        for (let seed = 1; seed <= 6; seed++) {
          const { end } = play(makeRod(tier, style, weight, seed), () => true);
          assert.equal(
            end,
            "snap",
            `tier ${tier} ${style} w${weight} #${seed}`,
          );
        }
});

test("a careful player lands every fish with every rod, and a better rod is never slower to snap", () => {
  for (let tier = 0; tier < TIER_COUNT; tier++)
    for (const style of STYLES)
      for (const weight of [0, 1]) {
        const { end } = play(makeRod(tier, style, weight, 7), careful);
        assert.equal(end, "landed", `tier ${tier} ${style} w${weight}`);
      }
  // Holding the button: the time to the snap grows as the rod gets better.
  for (const style of STYLES) {
    const times = [0, 1, 2, 3].map(
      (tier) => play(makeRod(tier, style, 0.5, 3), () => true).t,
    );
    for (let tier = 1; tier < 4; tier++)
      assert.ok(times[tier] > times[tier - 1], `${style} ${times}`);
  }
});

test("the default rod is today's fight exactly: a recorded fight is unchanged with no option, with tier 0 and with 1", () => {
  assert.equal(rodTier(0), 1);
  assert.equal(SNAP, 1);
  // Recorded from fight.ts before the rod option existed: a heavy fish of weight 0.4 from 25 m,
  // rng seed 21, the button held for 5 frames in every 40, at 30 fps.
  const RECORDED = [
    [60, "strong", 0.29335, 28.357667, 0.692262],
    [120, "strong", 0.18, 28.632667, 0.647619],
    [180, "strong", 0.18, 28.682667, 0.594048],
    [240, "tired", 0.05, 32.185333, 0.296429],
    [300, "tired", 0.05, 31.018667, 0.296429],
  ];
  const sample = (fight) => {
    const out = [];
    for (let i = 0; i < 300; i++) {
      fight.reel(i % 40 < 5);
      fight.update(1 / 30);
      if (i % 60 === 59) {
        const v = fight.view();
        out.push([
          i + 1,
          v.mood,
          +v.tension.toFixed(6),
          +v.distance.toFixed(6),
          +v.stamina.toFixed(6),
        ]);
      }
    }
    return out;
  };
  const base = { style: "heavy", weight: 0.4, distance: 25, maxLine: 48 };
  assert.deepEqual(sample(new Fight({ ...base, rng: seeded(21) })), RECORDED);
  assert.deepEqual(
    sample(new Fight({ ...base, rng: seeded(21), rodTension: rodTier(0) })),
    RECORDED,
  );
  // A better rod changes only how fast the strain builds: 15 % and 45 % less for tiers 1 and 3.
  const gain = (tier) => {
    const fight = makeRod(tier, "crawler", 0.5, 1);
    const before = fight.view().tension;
    fight.reel(true);
    fight.update(0.5);
    return fight.view().tension - before;
  };
  assert.ok(Math.abs(gain(1) / gain(0) - 0.85) < 1e-9);
  assert.ok(Math.abs(gain(3) / gain(0) - 0.55) < 1e-9);
});
