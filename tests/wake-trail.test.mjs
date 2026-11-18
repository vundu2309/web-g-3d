import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ARM_ROOT,
  ARM_SLOPE,
  BOW,
  FOAM_TILE,
  START_TAPER,
  STERN,
  TRAIL_ACROSS,
  TRAIL_LIFE,
  TRAIL_SAMPLES,
  TRAIL_STRIPS,
  WakeTrail,
  armAlpha,
  armKeep,
  foamPixels,
  layTrail,
  trailGeometry,
  vertexAt,
  washAlpha,
  washHalfWidth,
} from "../src/ocean/wake-trail.ts";

// A boat sails north (-Z) at `speed`; the trail records it every frame (`fps` of them a second).
const sail = (speed, seconds, turn = 0, fps = 30) => {
  const trail = new WakeTrail();
  let x = 0;
  let z = 0;
  let t = 0;
  let heading = 0;
  trail.push(x, z, t);
  while (t < seconds) {
    t += 1 / fps;
    heading += turn / fps;
    x += (Math.sin(heading) * speed) / fps;
    z -= (Math.cos(heading) * speed) / fps;
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
const at = (strip, i, side) => vertexAt(strip, i, side ? TRAIL_ACROSS - 1 : 0);
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
    width(g, 0, 0) > 1.8 && width(g, 0, 0) < 3.2,
    `a hull wide: ${width(g, 0, 0).toFixed(2)} m`,
  );
  // Older points are wider.
  assert.ok(width(g, 0, 20) > width(g, 0, 0) * 1.8, "it widens with age");
  // And fainter: the opacity of the wash falls to nothing at the end of its life.
  assert.ok(washAlpha(0) === 0 && washAlpha(0.5) > 0.7, "it builds up quickly");
  assert.ok(washAlpha(TRAIL_LIFE) < 0.01, "it is gone at the end of its life");
  for (let i = 1; i < 30; i++)
    assert.ok(
      // (the core's density swells and thins by up to 0.25 along the path)
      g.alpha[at(0, i, 0)] <= g.alpha[at(0, i - 1, 0)] + 0.3 || i < 4,
      "fading with age",
    );
});

test("each arm leaves the stem and runs back along a Kelvin line, mirrored, ARM_SLOPE metres out for every metre sailed", () => {
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
  // The sideways distance is ARM_ROOT plus ARM_SLOPE for every metre sailed since the point was laid.
  const sample = trail.samples.at(-1 - 10);
  const sailed = trail.samples.at(-1).dist - sample.dist;
  const lateral = Math.abs(right.x - sample.x);
  assert.ok(
    Math.abs(lateral - (ARM_ROOT + ARM_SLOPE * sailed)) < 0.05,
    `spread ${lateral.toFixed(2)} m after ${sailed.toFixed(1)} m`,
  );
  // The newest part of the arm is at the stem, ahead of the hull's middle.
  const near = centre(g, 2, 0);
  assert.ok(near.z < z - 3, "the arms start at the stem");
  assert.ok(STERN > 0 && BOW > 3);
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
  // u is in metres of the strip across (tiles of FOAM_TILE), so the foam is not stretched as a
  // strip widens: the same width in u as in the world, and the strip's middle is where u is 0.
  const wide = lay(trail, t);
  assert.ok(
    Math.abs(
      (wide.uv[at(0, 25, 1) * 2] - wide.uv[at(0, 25, 0) * 2]) * FOAM_TILE -
        width(wide, 0, 25),
    ) < 1e-3,
    "u spans the strip's width in metres",
  );
  assert.ok(
    Math.abs(wide.uv[at(0, 25, 1) * 2] + wide.uv[at(0, 25, 0) * 2]) < 1e-3,
    "u is 0 in the middle",
  );
  // The across coordinate the shader fades the sides with: 0 left, 0.5 middle, 1 right.
  for (let i = 0; i < TRAIL_SAMPLES; i++) {
    assert.equal(g.across[vertexAt(0, i, 0)], 0);
    assert.equal(g.across[vertexAt(0, i, 1)], 0.5);
    assert.equal(g.across[vertexAt(0, i, 2)], 1);
  }
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
  assert.ok(Math.max(...a) - Math.min(...a) > 140, "uses a wide range");
  // No flat black or white plateaus: thresholded, a plateau gives boxes with straight steps (the
  // old texture clamped its contrast and was a third pure black or white).
  const flat = a.filter((v) => v < 3 || v > 252).length / a.length;
  assert.ok(flat < 0.03, `${(flat * 100).toFixed(1)} % of pixels are flat`);
  // And it is smooth, at the size the game uses: neighbouring pixels differ by a few levels,
  // never a step (the old one had steps of 100 levels and more).
  const game = foamPixels(128, 7);
  let steepest = 0;
  for (let y = 0; y < 127; y++)
    for (let x = 0; x < 127; x++)
      steepest = Math.max(
        steepest,
        Math.abs(game[y * 128 + x] - game[y * 128 + x + 1]),
        Math.abs(game[y * 128 + x] - game[(y + 1) * 128 + x]),
      );
  assert.ok(steepest < 64, `steepest step between pixels ${steepest}`);
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

// ----- The ends of the strips, turns, frame rate -----

/** A boat that sets off at speed at t = 0 (no acceleration), so the trail starts at once. */
const burst = (speed, seconds, fps) => sail(speed, seconds, 0, fps);

test("a strip ends in nothing: no hard cut where the trail began or where it ran out", () => {
  // The old strips ended at the oldest point with the opacity it had: a boat that had set off a
  // moment ago left a wash that stopped in a straight line (the cut seen on a phone). Check at
  // several frame rates and speeds, and at several moments, including while the trail is
  // younger than TRAIL_LIFE and once it is rolling.
  for (const fps of [10, 20, 30, 60])
    for (const speed of [6, 9, 12])
      for (const seconds of [1.2, 2.5, 3.5, 6]) {
        const { trail, t } = burst(speed, seconds, fps);
        const g = lay(trail, t);
        const n = trail.samples.length;
        for (let strip = 0; strip < TRAIL_STRIPS; strip++) {
          const oldest = g.alpha[at(strip, n - 1, 0)];
          assert.ok(
            oldest < 0.02,
            `strip ${strip} ends with opacity ${oldest.toFixed(3)} (${speed} m/s, ${fps} fps, ${seconds} s)`,
          );
          // And it gets there gently: no step in opacity between neighbouring points along the
          // old half of the strip (the first points of a trail taper in over START_TAPER seconds).
          for (let i = Math.max(1, Math.floor(n / 2)); i < n; i++) {
            const step = Math.abs(
              g.alpha[at(strip, i, 0)] - g.alpha[at(strip, i - 1, 0)],
            );
            assert.ok(
              step < 0.4 * (1 + 0.1 / Math.max(START_TAPER, 0.1)),
              `strip ${strip} point ${i}: step ${step.toFixed(2)} (${speed} m/s, ${fps} fps, ${seconds} s)`,
            );
          }
        }
      }
});

test("the wake looks the same at every frame rate: opacity depends on age, not on how often the boat is recorded", () => {
  const alphaAt = (fps) => {
    const { trail, t } = burst(11, 8, fps);
    const g = lay(trail, t);
    // The point nearest to an age of 1 s.
    let best = 0;
    for (let i = 0; i < trail.samples.length; i++)
      if (
        Math.abs(t - trail.samples.at(-1 - i).t - 1) <
        Math.abs(t - trail.samples.at(-1 - best).t - 1)
      )
        best = i;
    return g.alpha[at(0, best, 0)];
  };
  const reference = alphaAt(60);
  for (const fps of [12, 20, 30])
    assert.ok(
      Math.abs(alphaAt(fps) - reference) < 0.08,
      `${fps} fps ${alphaAt(fps).toFixed(2)} vs 60 fps ${reference.toFixed(2)}`,
    );
  // The trail holds the whole of TRAIL_LIFE at every frame rate a phone can have (at least 8).
  const slow = burst(11, 8, 8);
  assert.ok(slow.trail.samples.length < TRAIL_SAMPLES);
  assert.ok(
    slow.t - slow.trail.samples[0].t > TRAIL_LIFE - 0.3,
    "it keeps the whole life, so it is not cut short",
  );
});

test("in a hard turn the arms fade out instead of drawing closed loops, and the wash stays inside the turn", () => {
  assert.equal(armKeep(0, 0), 1, "straight: the arms are whole");
  assert.equal(
    armKeep(1.3, 0),
    0,
    "once the boat has swung about a radian: gone",
  );
  assert.equal(
    armKeep(0, 1.6),
    0,
    "turning at a radian a second or more: none",
  );
  assert.ok(armKeep(0.2, 0.3) > 0.8, "a gentle turn keeps them");
  // A tight circle (radius 7 m at 10 m/s, about 1.4 rad/s): the old arms sat 1.3 + 4.6 age metres
  // from the path and, past 7 m, crossed the middle of the circle and drew loops.
  const { trail, t } = sail(10, 6, 1.43);
  const g = lay(trail, t);
  const n = trail.samples.length;
  let arms = 0;
  for (let i = 0; i < n; i++)
    arms += g.alpha[at(1, i, 0)] + g.alpha[at(2, i, 0)];
  assert.ok(arms < 0.5, `almost no arm in a tight turn: ${arms.toFixed(2)}`);
  // The wash is never wider than the turn holds: a strip wider than the radius folds over itself.
  for (let i = 0; i < n; i++) {
    const sample = trail.samples.at(-1 - i);
    const radius = sample.speed / Math.max(Math.abs(sample.yaw), 0.05);
    const half = width(g, 0, i) / 2;
    assert.ok(
      half <= Math.max(1.3, 0.7 * radius) + 1e-3,
      `half width ${half.toFixed(2)} m at radius ${radius.toFixed(1)} m`,
    );
  }
  assert.equal(
    washHalfWidth(3, 100),
    1.2 + 0.85 * 3,
    "straight: it widens freely",
  );
  assert.ok(
    washHalfWidth(3.5, 5) <= 3.5 + 1e-9,
    "tight: held at most 0.7 of the radius",
  );
  // And a gentle turn keeps both arms, bending with the path.
  const gentle = sail(11, 5, 0.3);
  const h = lay(gentle.trail, gentle.t);
  let kept = 0;
  for (let i = 0; i < gentle.trail.samples.length; i++)
    kept += h.alpha[at(1, i, 0)] + h.alpha[at(2, i, 0)];
  assert.ok(kept > 3, `a gentle turn keeps the arms: ${kept.toFixed(1)}`);
});

test("the arms are broad soft bands, not hairlines", () => {
  const { trail, t } = sail(12, 5);
  const g = lay(trail, t);
  for (const i of [5, 15, 30])
    assert.ok(width(g, 1, i) > 0.8, `arm width at ${i}`);
});

test("the white water behind a boat is no longer a mesh of strips: the mesh keeps the bow wave and the foam material's soft cut", () => {
  const mesh = readFileSync(
    new URL("../src/ocean/wake-mesh.ts", import.meta.url),
    "utf8",
  );
  // The strips (one mesh per boat, TRAIL_ACROSS vertices across, a vertex colour for the across
  // coordinate) are gone; the sea's shader draws the wake from the water simulation instead.
  assert.ok(!mesh.includes("TRAIL_ACROSS"));
  assert.ok(!mesh.includes("layTrail"));
  assert.ok(!mesh.includes("geometry.across"));
  assert.ok(mesh.includes("BowWaveMesh"), "the bow wave is still drawn here");
  const water = readFileSync(
    new URL("../src/ocean/water.ts", import.meta.url),
    "utf8",
  );
  assert.ok(water.includes("float density = stirred.w;"));
  assert.ok(!water.includes("foamMap"));
  // The bow crest shares the foam material: two taps of the texture at different sizes (no
  // lattice or tile shows) and a wide soft cut.
  assert.equal(mesh.match(/texture2D\(foam,/g).length, 2);
  assert.ok(
    /coverage = smoothstep\(0\.35, 0\.75,/.test(mesh),
    "a wide, soft cut",
  );
  assert.ok(!mesh.includes("cut - 0.05"), "the old narrow threshold is gone");
});
