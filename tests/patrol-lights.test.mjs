import { test } from "node:test";
import assert from "node:assert/strict";
import { readGlb } from "./support/glb.mjs";
import { rgb } from "../src/ocean/boat-paint.ts";
import { PAL } from "../src/ocean/art/colors.ts";
import { distanceAmount } from "../src/ocean/distance-fade.ts";
import {
  FLASH_PERIOD,
  LENS_DARK,
  LENS_DAY,
  HALO_ANGLE,
  HALO_BAND,
  HALO_RANGE,
  LIGHT_RANGE,
  PATROL_LIGHTS,
  WEDGE_BAND,
  haloScale,
  SEARCH,
  flash,
  lensGlow,
  searchAngle,
  searchWedge,
} from "../src/ocean/patrol-light-plan.ts";

// The patrol ships' lights (patrol-light-plan.ts): the lenses of the light bar flash one after the
// other, twice each; by day they are a steady glass; the searchlight swings; and the places the lights
// are drawn at are the places of the model's lenses, lantern and searchlights.
const samples = (from, to, step) => {
  const out = [];
  for (let t = from; t <= to + 1e-9; t += step) out.push([t, flash(t)]);
  return out;
};

test("the lenses flash twice each per round, one after the other, and never together", () => {
  const all = samples(0, FLASH_PERIOD, 0.002);
  for (const [, f] of all) {
    assert.ok(f.blue >= 0 && f.blue <= 1 && f.red >= 0 && f.red <= 1);
    assert.ok(
      Math.min(f.blue, f.red) < 0.05,
      "one is dark while the other flashes",
    );
  }
  const bursts = (key) => {
    let count = 0;
    let on = false;
    for (const [, f] of all) {
      if (!on && f[key] > 0.5) {
        count++;
        on = true;
      } else if (on && f[key] < 0.2) on = false;
    }
    return count;
  };
  assert.equal(bursts("blue"), 2);
  assert.equal(bursts("red"), 2);
  // Blue in the first half of the round, red in the second.
  const peak = (key, from, to) =>
    Math.max(
      ...all.filter(([t]) => t >= from && t < to).map(([, f]) => f[key]),
    );
  assert.ok(
    peak("blue", 0, FLASH_PERIOD / 2) > 0.95 &&
      peak("blue", FLASH_PERIOD / 2, FLASH_PERIOD) < 0.05,
  );
  assert.ok(
    peak("red", FLASH_PERIOD / 2, FLASH_PERIOD) > 0.95 &&
      peak("red", 0, FLASH_PERIOD / 2) < 0.05,
  );
  // A round repeats, and a lens flashes at most about 2.2 times a second (under the 3 a second of the photosensitivity guidance).
  for (const t of [0.13, 0.47, 3.3]) {
    const again = flash(t + 5 * FLASH_PERIOD);
    assert.ok(Math.abs(flash(t).blue - again.blue) < 1e-9);
    assert.ok(Math.abs(flash(t).red - again.red) < 1e-9);
  }
  assert.ok(2 / FLASH_PERIOD < 3);
});

test("a lens is a steady glass by day and flashes at night", () => {
  for (const f of [0, 0.3, 1])
    assert.equal(lensGlow(f, 0), LENS_DAY, "day: the flash is not seen");
  assert.equal(
    lensGlow(0, 1),
    LENS_DARK,
    "night, between flashes: nearly dark",
  );
  assert.equal(lensGlow(1, 1), 1, "night, flashing: full");
  // Dusk: in between, never below the darker of the two.
  const dusk = lensGlow(0, 0.5);
  assert.ok(dusk < LENS_DAY && dusk > LENS_DARK);
  assert.ok(LENS_DARK < LENS_DAY && LENS_DAY < 1);
  assert.equal(lensGlow(1, 7), 1, "the night level is clamped");
});

test("the searchlight swings within its limit, each ship at its own moment, and the wedge lies flat on the sea ahead", () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t < 60; t += 0.1) {
    const a = searchAngle(t, 0.2);
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
  }
  assert.ok(
    Math.abs(hi - SEARCH.sweep) < 0.02 && Math.abs(lo + SEARCH.sweep) < 0.02,
  );
  assert.notEqual(searchAngle(10, 0.1), searchAngle(10, 0.6));
  const { positions, uvs, indices } = searchWedge();
  assert.equal(positions.length, 12);
  assert.equal(uvs.length, 8);
  assert.equal(indices.length, 6);
  // Near edge at the ship, far edge SEARCH.length ahead (-z), widening, all at the same height.
  const p = (i) => positions.slice(i * 3, i * 3 + 3);
  assert.ok(Math.abs(p(0)[2]) === 0 && Math.abs(p(1)[2]) === 0);
  assert.deepEqual([p(2)[2], p(3)[2]], [-SEARCH.length, -SEARCH.length]);
  assert.equal(Math.abs(p(1)[0] - p(0)[0]), SEARCH.near);
  assert.equal(Math.abs(p(3)[0] - p(2)[0]), SEARCH.far);
  assert.ok([0, 1, 2, 3].every((i) => p(i)[1] === SEARCH.height));
  assert.ok(LIGHT_RANGE > 100);
});

// ----- the places of the lights are the model's -----
const { gltf, accessor } = readGlb("public/models/boat-patrol.glb");
function vertices(colour) {
  const found = [];
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const t = node.translation ?? [0, 0, 0];
    for (const p of gltf.meshes[node.mesh].primitives) {
      const pos = accessor(p.attributes.POSITION);
      const col = accessor(p.attributes.COLOR_0);
      let all = true;
      const mine = [];
      for (let i = 0; i < pos.count; i++) {
        const c = [0, 1, 2].map((k) => col.data[i * col.comps + k]);
        const same = c.every((v, k) => Math.abs(v - colour[k]) < 0.5 / 255);
        if (!same) all = false;
        else
          mine.push({
            x: -(pos.data[i * 3] + t[0]),
            y: pos.data[i * 3 + 1] + t[1],
            z: -(pos.data[i * 3 + 2] + t[2]),
          });
      }
      found.push({ pure: all && mine.length > 0, mine });
    }
  }
  return found;
}
const centre = (pts) => ({
  x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
  y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
  z: pts.reduce((a, p) => a + p.z, 0) / pts.length,
});

test("each lens is a mesh of its own colour in the model (the game finds it by colour), where the lights are drawn", () => {
  for (const [name, colour, at] of [
    ["blue", rgb(PAL.paint.beacon), PATROL_LIGHTS.blue],
    ["red", rgb(PAL.paint.beaconRed), PATROL_LIGHTS.red],
  ]) {
    const prims = vertices(colour);
    assert.ok(
      prims.some((p) => p.pure),
      `${name}: a primitive of that colour alone`,
    );
    const c = centre(prims.flatMap((p) => p.mine));
    for (const k of ["x", "y", "z"])
      assert.ok(
        Math.abs(c[k] - at[k]) < 0.05,
        `${name} lens ${k}: model ${c[k].toFixed(2)}, lights ${at[k]}`,
      );
  }
});

test("the mast lantern and the searchlights are where their light is drawn", () => {
  const lamp = vertices(rgb(PAL.light.lamp)).flatMap((p) => p.mine);
  const near = (pt, at, r) =>
    Math.hypot(pt.x - at.x, pt.y - at.y, pt.z - at.z) < r;
  const mast = lamp.filter((p) => p.y > 4);
  assert.ok(mast.length > 10, "the lantern's glass is the highest lamp");
  const c = centre(mast);
  assert.ok(
    near(c, PATROL_LIGHTS.mast, 0.06),
    `lantern at ${JSON.stringify(c)}`,
  );
  // The two searchlight lenses, a metre and a bit apart, are either side of the light's x.
  const search = lamp.filter(
    (p) => Math.abs(p.z - PATROL_LIGHTS.search.z) < 0.2 && Math.abs(p.x) > 0.3,
  );
  assert.ok(search.length > 20, "two searchlight lenses");
  const right = centre(search.filter((p) => p.x > 0));
  const left = centre(search.filter((p) => p.x < 0));
  assert.ok(
    Math.abs(right.x + left.x) < 0.05 && Math.abs(right.x - 0.62) < 0.05,
  );
  assert.ok(
    Math.abs(right.y - PATROL_LIGHTS.search.y) < 0.06 &&
      Math.abs(right.z - PATROL_LIGHTS.search.z) < 0.06,
  );
});

// ----- the lights thin out with the distance, they are never cut in one frame -----
test("a ship's halos are seen from far, farther than its searchlight reaches, and thin out", () => {
  assert.ok(
    HALO_RANGE > LIGHT_RANGE * 2,
    "the lights are what a ship is seen by at night",
  );
  assert.ok(HALO_BAND > 100 && WEDGE_BAND > 50);
  // Whole well inside the range, nothing at it, and a smooth way between with no step to pop at.
  assert.equal(distanceAmount(100, HALO_RANGE, HALO_BAND), 1);
  assert.equal(distanceAmount(HALO_RANGE, HALO_RANGE, HALO_BAND), 0);
  let before = 1;
  for (let d = HALO_RANGE - HALO_BAND; d <= HALO_RANGE; d += 1) {
    const a = distanceAmount(d, HALO_RANGE, HALO_BAND);
    assert.ok(a <= before + 1e-12);
    assert.ok(before - a < 0.02, `a step of ${before - a} at ${d} m`);
    before = a;
  }
  // The wedge keeps its old reach: whole until the band, gone at LIGHT_RANGE.
  assert.equal(
    distanceAmount(LIGHT_RANGE - WEDGE_BAND, LIGHT_RANGE, WEDGE_BAND),
    1,
  );
  assert.equal(distanceAmount(LIGHT_RANGE, LIGHT_RANGE, WEDGE_BAND), 0);
});

test("a far halo is made larger so it stays a few pixels: never under its own size, growing with the distance", () => {
  // Near: its own size (a scale of 1). Far: the scale that keeps its radius at HALO_ANGLE radians.
  assert.equal(haloScale(2.4, 50, 1), 1);
  assert.ok(haloScale(2.4, 900, 1) > 5);
  for (const d of [500, 800, 1100]) {
    const size = 2.4 * haloScale(2.4, d, 1);
    assert.ok(
      Math.abs(size / 2 / d - HALO_ANGLE) < 1e-9 || size / 2 / d >= HALO_ANGLE,
    );
    assert.ok(
      size / 2 / d >= HALO_ANGLE - 1e-12,
      `at ${d} m the radius is ${size / 2 / d} rad`,
    );
  }
  assert.ok(haloScale(2.4, 1000, 1) > haloScale(2.4, 600, 1));
  // On a parent that is scaled up it never goes below that scale.
  assert.equal(haloScale(2.4, 10, 1.6), 1.6);
  // At 490 pixels to the radian a far halo is several pixels across.
  assert.ok(HALO_ANGLE * 490 * 2 >= 8);
});
