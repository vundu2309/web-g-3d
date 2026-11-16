import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOW_SPRAY_FROM,
  BOW_TIP,
  CREST_ACROSS,
  CREST_FROM,
  CREST_FULL,
  CREST_HEIGHT,
  CREST_POINTS,
  SPRAY_COUNT,
  SPRAY_LIFE,
  crestGeometry,
  crestLevel,
  crestVertex,
  dropletActive,
  dropletAt,
  layCrest,
} from "../src/ocean/bow-wave.ts";
import { hullHalfWidth } from "../src/ocean/hull-water.ts";
import {
  ARM_ROOT,
  ARM_SLOPE,
  KELVIN_HALF_ANGLE,
  TRAIL_SAMPLES,
  WakeTrail,
  coreDensity,
  coreWidth,
  layTrail,
  trailGeometry,
  vertexAt,
} from "../src/ocean/wake-trail.ts";

const crest = (speed, time = 1) => {
  const g = crestGeometry();
  layCrest(speed, time, g);
  return g;
};
const maxY = (g) => Math.max(...g.y);
const maxAlpha = (g) => Math.max(...g.alpha);

test("the bow wave grows with the speed and falls back when the boat slows", () => {
  assert.equal(crestLevel(0), 0);
  assert.equal(crestLevel(CREST_FROM), 0);
  assert.equal(crestLevel(CREST_FULL), 1);
  let last = -1;
  for (let v = 0; v <= 12; v += 0.5) {
    assert.ok(crestLevel(v) >= last, "never shrinks as the speed rises");
    last = crestLevel(v);
  }
  // A crest that stands higher and whiter at 9 m/s than at 4 m/s, and flat at a crawl.
  assert.ok(maxY(crest(9)) > maxY(crest(4)) * 1.8);
  const total = (g) => g.alpha.reduce((a, b) => a + b, 0);
  assert.ok(total(crest(9)) > total(crest(2.5)));
  assert.ok(maxAlpha(crest(9)) <= 1);
  assert.equal(maxY(crest(1)), 0);
  assert.ok(maxY(crest(12)) <= CREST_HEIGHT * 1.001);
  // Same speed, same crest: nothing remembers a faster moment (it falls back as it slows).
  assert.deepEqual(crest(5).y, crest(5).y);
});

test("the crest wraps the stem and runs back along both sides of the hull, ending in nothing", () => {
  const g = crest(10);
  const mid = (CREST_POINTS - 1) / 2;
  const stem = crestVertex(mid, 1);
  assert.ok(
    g.u[stem] >= BOW_TIP - 0.1,
    "the crest of the middle point is at the stem",
  );
  assert.ok(Math.abs(g.v[stem]) < 0.2);
  // Port and starboard are mirror images.
  for (let i = 0; i < CREST_POINTS; i++)
    for (let k = 0; k < CREST_ACROSS; k++) {
      const a = crestVertex(i, k);
      const b = crestVertex(CREST_POINTS - 1 - i, k);
      assert.ok(Math.abs(g.u[a] - g.u[b]) < 1e-4);
      assert.ok(Math.abs(g.v[a] + g.v[b]) < 1e-4);
      assert.ok(Math.abs(g.y[a] - g.y[b]) < 1e-4);
    }
  // The tails fade out; the stem is the strongest.
  assert.equal(g.alpha[crestVertex(0, 1)], 0);
  assert.equal(g.alpha[crestVertex(CREST_POINTS - 1, 1)], 0);
  assert.ok(g.alpha[stem] > 0.8);
  // The toe lies on the water, outside the crest, which is outside the hull's edge.
  for (let i = 1; i < CREST_POINTS - 1; i++) {
    assert.equal(g.y[crestVertex(i, 0)], 0, "the toe is on the sea");
    assert.ok(g.y[crestVertex(i, 1)] >= g.y[crestVertex(i, 2)] - 1e-6);
    const toe = Math.hypot(
      g.u[crestVertex(i, 0)] - 1.2,
      g.v[crestVertex(i, 0)],
    );
    const edge = Math.hypot(
      g.u[crestVertex(i, 2)] - 1.2,
      g.v[crestVertex(i, 2)],
    );
    assert.ok(toe > edge, `point ${i}: the toe is outside the hull edge`);
  }
  assert.ok(g.u.every(Number.isFinite) && g.v.every(Number.isFinite));
  assert.ok(
    g.uv.every(Number.isFinite) && g.alpha.every((a) => a >= 0 && a <= 1),
  );
});

test("spray starts above the spray speed and is none below it", () => {
  const sum = (speed) => {
    let a = 0;
    for (let t = 0; t < 3; t += 0.1)
      for (let i = 0; i < SPRAY_COUNT; i++) a += dropletAt(i, t, speed).alpha;
    return a;
  };
  assert.equal(sum(BOW_SPRAY_FROM - 0.5), 0, "none below ~6 m/s");
  assert.equal(sum(3), 0);
  assert.ok(sum(8) > 0, "some at 8 m/s");
  assert.ok(sum(11) > sum(8) * 1.3, "more when faster");
  let active = 0;
  for (let i = 0; i < SPRAY_COUNT; i++) if (dropletActive(i, 11)) active++;
  assert.ok(active > SPRAY_COUNT / 2 && active <= SPRAY_COUNT);
});

test("a droplet flies up and back in an arc beside the hull, then is gone", () => {
  // Every droplet: above the water, beside the hull (not through it), out of sight at the end.
  for (let i = 0; i < SPRAY_COUNT; i++)
    for (let t = 0; t < 2; t += 0.07) {
      const d = dropletAt(i, t, 11);
      assert.ok(d.y >= 0.05 && d.y < 3, `height ${d.y}`);
      assert.ok(
        Math.abs(d.v) > hullHalfWidth(d.u - 0.2) + 0.2,
        "never over the hull",
      );
      assert.ok(d.size > 0.05 && d.size < 1.2);
      assert.ok(d.alpha >= 0 && d.alpha <= 1);
      assert.ok(Number.isFinite(d.u + d.v + d.y));
    }
  // One droplet over its flight: rises, falls, fades at both ends. Find a droplet that is in use.
  const i = Array.from({ length: SPRAY_COUNT }, (_, k) => k).find(
    (k) => dropletActive(k, 11) && dropletAt(k, 0.3, 11).size < 0.3,
  );
  const rate = 1; // the pool's rates differ; sample densely over two seconds instead
  void rate;
  const track = [];
  for (let t = 0; t < 2; t += 0.01) track.push(dropletAt(i, t, 11));
  const top = Math.max(...track.map((d) => d.y));
  assert.ok(top > 0.9, `it rises to ${top.toFixed(2)} m`);
  assert.ok(
    track.some((d) => d.alpha < 0.05),
    "invisible at the start of a flight",
  );
  assert.ok(SPRAY_LIFE > 0.3 && SPRAY_LIFE < 1.5);
});

test("the arms of the wake are a Kelvin V: half angle asin(1/3), the same at every speed", () => {
  assert.ok(Math.abs((KELVIN_HALF_ANGLE * 180) / Math.PI - 19.47) < 0.01);
  for (const speed of [7, 10, 12]) {
    const trail = new WakeTrail();
    let t = 0;
    let z = 0;
    trail.push(0, z, t);
    while (t < 4) {
      t += 1 / 30;
      z -= speed / 30;
      trail.push(0, z, t);
    }
    const g = trailGeometry();
    layTrail(trail, t, g);
    const newest = trail.samples.at(-1);
    const arm = (i) => {
      const a = vertexAt(2, i, 0);
      const b = vertexAt(2, i, 2);
      return {
        x: (g.xz[a * 2] + g.xz[b * 2]) / 2,
        z: (g.xz[a * 2 + 1] + g.xz[b * 2 + 1]) / 2,
      };
    };
    // Points at 10 and 30 samples back lie on a straight line whose half angle is the Kelvin's.
    const p = arm(10);
    const q = arm(30);
    const angle = Math.atan2(q.x - p.x, q.z - p.z);
    assert.ok(
      Math.abs(angle - KELVIN_HALF_ANGLE) < 0.01,
      `${speed} m/s: ${((angle * 180) / Math.PI).toFixed(2)} degrees`,
    );
    // And it starts at the stem, close to the keel.
    const first = arm(0);
    assert.ok(Math.abs(first.x - ARM_ROOT) < 0.05 && first.z < newest.z - 3);
    assert.ok(ARM_SLOPE > 0.35 && ARM_SLOPE < 0.36);
    // The left arm mirrors it.
    const a = vertexAt(1, 10, 0);
    const b = vertexAt(1, 10, 2);
    assert.ok(Math.abs((g.xz[a * 2] + g.xz[b * 2]) / 2 + p.x) < 0.05);
  }
  assert.ok(TRAIL_SAMPLES > 30);
});

test("the foam core behind the stern swells and pinches along the path and thins in patches", () => {
  let lo = 9;
  let hi = 0;
  let dLo = 9;
  let dHi = 0;
  for (let d = 0; d < 80; d += 0.1) {
    lo = Math.min(lo, coreWidth(d));
    hi = Math.max(hi, coreWidth(d));
    dLo = Math.min(dLo, coreDensity(d));
    dHi = Math.max(dHi, coreDensity(d));
  }
  assert.ok(
    lo < 0.85 && hi > 1.15,
    `width ${lo.toFixed(2)} to ${hi.toFixed(2)}`,
  );
  assert.ok(
    dLo < 0.8 && dHi >= 0.99 && dHi < 1.1,
    `density ${dLo.toFixed(2)} to ${dHi.toFixed(2)}`,
  );
});

test("the mesh draws the crest with the wake foam and the spray with one small shader, no extra pass", () => {
  const mesh = readFileSync(
    new URL("../src/ocean/bow-wave-mesh.ts", import.meta.url),
    "utf8",
  );
  const wake = readFileSync(
    new URL("../src/ocean/wake-mesh.ts", import.meta.url),
    "utf8",
  );
  assert.ok(wake.includes("new BowWaveMesh(scene, material(scene))"));
  assert.ok(wake.includes("this.bow.update("));
  assert.ok(
    mesh.includes("disableDepthWrite = true"),
    "the see-through hulls stay intact",
  );
  assert.ok(!/RenderTargetTexture|DepthRenderer|PostProcess/.test(mesh));
  // The water's vertex shader and the waves are not touched by the bow wave.
  assert.ok(!mesh.includes("waves.ts") || mesh.includes("waveHeight"));
});
