import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARM_SPREAD,
  BOW,
  STERN,
  TRAIL_LIFE,
  TRAIL_SAMPLES,
  WakeTrail,
  armAlpha,
  foamPixels,
  layTrail,
  trailGeometry,
  washAlpha,
} from "../src/ocean/wake-trail.ts";

// A boat sails north (-Z) at `speed`; the trail records it every frame.
const sail = (speed, seconds, turn = 0) => {
  const trail = new WakeTrail();
  let x = 0;
  let z = 0;
  let t = 0;
  let heading = 0;
  trail.push(x, z, t);
  while (t < seconds) {
    t += 1 / 30;
    heading += turn / 30;
    x += (Math.sin(heading) * speed) / 30;
    z -= (Math.cos(heading) * speed) / 30;
    trail.push(x, z, t);
  }
  return { trail, t, x, z, heading };
};
const lay = (trail, now) => {
  const geometry = trailGeometry();
  layTrail(trail, now, geometry);
  return geometry;
};
/** Index of vertex `side` (0 left, 1 right) of point `i` of strip `strip`. */
const at = (strip, i, side) => (strip * TRAIL_SAMPLES + i) * 2 + side;
const centre = (g, strip, i) => ({
  x: (g.xz[at(strip, i, 0) * 2] + g.xz[at(strip, i, 1) * 2]) / 2,
  z: (g.xz[at(strip, i, 0) * 2 + 1] + g.xz[at(strip, i, 1) * 2 + 1]) / 2,
});
const width = (g, strip, i) =>
  Math.hypot(
    g.xz[at(strip, i, 1) * 2] - g.xz[at(strip, i, 0) * 2],
    g.xz[at(strip, i, 1) * 2 + 1] - g.xz[at(strip, i, 0) * 2 + 1],
  );

test("the trail keeps a point every few hundredths of a second and forgets old ones", () => {
  const { trail } = sail(12, 10);
  assert.ok(trail.samples.length > 20 && trail.samples.length <= TRAIL_SAMPLES);
  const span = trail.samples.at(-1).t - trail.samples[0].t;
  assert.ok(
    span <= TRAIL_LIFE + 0.2,
    `only ${span.toFixed(1)} s of path is kept`,
  );
  assert.ok(
    Math.abs(trail.speed - 12) < 0.5,
    `speed ${trail.speed.toFixed(1)}`,
  );
  // The distance along the path only grows.
  for (let i = 1; i < trail.samples.length; i++)
    assert.ok(trail.samples[i].dist > trail.samples[i - 1].dist);
});

test("a jump (a reconnect, a boat far away) starts a new trail instead of a streak across the sea", () => {
  const trail = new WakeTrail();
  trail.push(0, 0, 0);
  trail.push(0, -1, 0.1);
  trail.push(900, 900, 0.2);
  assert.equal(trail.samples.length, 1);
});

test("the wash starts as wide as the hull behind the stern, widens, and fades out", () => {
  const { trail, t } = sail(12, 4);
  const g = lay(trail, t);
  // The newest point: wash edges centred on the stern, a hull's width across.
  // (Points are kept every few hundredths of a second, so use the recorded one.)
  const newest = trail.samples.at(-1);
  const head = centre(g, 0, 0);
  assert.ok(
    Math.abs(head.x - newest.x) < 1e-3 &&
      Math.abs(head.z - (newest.z + STERN)) < 0.05,
    "starts at the stern",
  );
  assert.ok(
    width(g, 0, 0) > 2 && width(g, 0, 0) < 3.2,
    `a hull wide: ${width(g, 0, 0).toFixed(2)} m`,
  );
  // Older points are wider.
  assert.ok(width(g, 0, 20) > width(g, 0, 0) * 1.8, "it widens with age");
  // And fainter: the opacity of the wash falls to nothing at the end of its life.
  assert.ok(washAlpha(0) === 0 && washAlpha(0.5) > 0.7, "it builds up quickly");
  assert.ok(washAlpha(TRAIL_LIFE) < 0.01, "it is gone at the end of its life");
  for (let i = 1; i < 30; i++)
    assert.ok(
      g.alpha[at(0, i, 0)] <= g.alpha[at(0, i - 1, 0)] + 1e-6 || i < 4,
      "fading with age",
    );
});

test("each arm runs back from the bow at the angle of a wake and spreads at the wave speed", () => {
  const { trail, t, x, z } = sail(12, 4);
  const g = lay(trail, t);
  // Left and right are mirror images of each other about the path.
  const left = centre(g, 1, 10);
  const right = centre(g, 2, 10);
  assert.ok(
    left.x < x && right.x > x,
    "one arm each side of a boat heading north",
  );
  assert.ok(Math.abs(left.x + right.x - 2 * x) < 0.2, "mirror images");
  assert.ok(Math.abs(left.z - right.z) < 0.05);
  // The half angle follows asin(spread / speed): the farther back, the wider by the spread.
  const sample = trail.samples.at(-1 - 10);
  const age = t - sample.t;
  const lateral = Math.abs(right.x - sample.x);
  assert.ok(
    Math.abs(lateral - (1.3 + ARM_SPREAD * age)) < 0.1,
    `spread ${lateral.toFixed(2)} m at ${age.toFixed(2)} s`,
  );
  // Close to the boat the arms come from the bow side, far back from the stern line.
  const near = centre(g, 2, 0);
  assert.ok(
    near.z < z,
    "the arms start ahead of the hull's middle, at the bow",
  );
  assert.ok(BOW > 0 && STERN > 0);
  assert.ok(
    armAlpha(0) === 0 && armAlpha(1) > 0.5 && armAlpha(TRAIL_LIFE) < 0.01,
  );
});

test("a slow boat has no arms and a faint wash; a stopped one has nothing", () => {
  const slow = sail(3, 4);
  const g = lay(slow.trail, slow.t);
  let arms = 0;
  for (let i = 0; i < TRAIL_SAMPLES; i++)
    arms += g.alpha[at(1, i, 0)] + g.alpha[at(2, i, 0)];
  assert.equal(arms, 0, "no arms below a wake speed");
  assert.ok(
    Math.max(...Array.from({ length: 20 }, (_, i) => g.alpha[at(0, i, 0)])) > 0,
    "but some wash",
  );
  const still = sail(0, 3);
  const h = lay(still.trail, still.t);
  assert.equal(Math.max(...h.alpha), 0);
});

test("in a turn the wake bends with the path instead of staying straight", () => {
  const { trail, t, x, z } = sail(11, 5, 0.5);
  const g = lay(trail, t);
  const old = centre(g, 0, 30);
  const sample = trail.samples.at(-1 - 30);
  // The wash lies behind the old sample on its own heading, not behind the current one.
  assert.ok(
    Math.abs(old.x - (sample.x - Math.sin(sample.heading) * STERN)) < 0.05,
  );
  assert.ok(
    Math.hypot(old.x - x, old.z - z) > 8,
    "far back along a curved path",
  );
  // A straight line back from the boat would miss it by metres.
  const straightX =
    x -
    Math.sin(trail.samples.at(-1).heading) * Math.hypot(old.x - x, old.z - z);
  assert.ok(
    Math.abs(old.x - straightX) > 1.5,
    `off the straight line by ${Math.abs(old.x - straightX).toFixed(1)} m`,
  );
});

test("the foam is attached to the water: its coordinate along the strip is the distance travelled", () => {
  const { trail, t } = sail(10, 4);
  const g = lay(trail, t);
  // v grows with distance along the path, and does not depend on when it is drawn.
  const a = g.uv[at(0, 5, 0) * 2 + 1];
  const later = lay(trail, t + 0.01);
  assert.equal(later.uv[at(0, 5, 0) * 2 + 1], a);
  assert.ok(
    g.uv[at(0, 0, 0) * 2 + 1] > g.uv[at(0, 10, 0) * 2 + 1],
    "newer points are farther along",
  );
  // u is 0 on the left edge and 1 on the right.
  assert.equal(g.uv[at(0, 3, 0) * 2], 0);
  assert.equal(g.uv[at(0, 3, 1) * 2], 1);
  assert.ok(
    g.xz.every(Number.isFinite) &&
      g.uv.every(Number.isFinite) &&
      g.alpha.every(Number.isFinite),
  );
});

test("the foam texture is deterministic, streaked along the path, and tiles", () => {
  const a = foamPixels(64, 7);
  const b = foamPixels(64, 7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(foamPixels(64, 8), a);
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(
    mean > 40 && mean < 200,
    `a mix of foam and clear water: mean ${mean.toFixed(0)}`,
  );
  assert.ok(
    Math.min(...a) < 20 && Math.max(...a) > 200,
    "uses the whole range",
  );
  // Streaks run along v (rows of the image): neighbours along v are alike, across u less so.
  let along = 0;
  let across = 0;
  for (let y = 0; y < 63; y++)
    for (let x = 0; x < 63; x++) {
      along += Math.abs(a[y * 64 + x] - a[(y + 1) * 64 + x]);
      across += Math.abs(a[y * 64 + x] - a[y * 64 + x + 1]);
    }
  assert.ok(
    along < across,
    `streaks: change along ${along} < across ${across}`,
  );
  // It tiles: the edge row is as close to the first row as any two neighbouring rows.
  let seam = 0;
  for (let x = 0; x < 64; x++) seam += Math.abs(a[63 * 64 + x] - a[x]);
  assert.ok(seam < (along / 63) * 2.5, "no seam where the texture repeats");
});
