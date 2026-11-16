import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  COLLAR,
  COLLAR_SIDE_MAX,
  CREST_FOAM,
  EDGE_PER_METRE,
  FOAM_REACH,
  HULL_REACH,
  HULL_WATER,
  RING_FADE,
  collarFoam,
  collarWidth,
  glslCollarWidth,
  glslHullEdge,
  hullDistance,
  hullEdge,
  hullHalfWidth,
  ringFade,
} = await import("../src/ocean/hull-water.ts");
const { SHADOW, shadowKeeps } = await import("../src/ocean/boat-shadow.ts");
const water = readFileSync(
  new URL("../src/ocean/water.ts", import.meta.url),
  "utf8",
);
const L = HULL_WATER.halfLength;

test("the distance from the hull is in metres, the same along the keel as across it", () => {
  assert.equal(hullDistance(0, 0), 0);
  assert.equal(
    hullDistance(0, HULL_WATER.beam * 0.9),
    0,
    "inside the waterline",
  );
  // Across, amidships: the distance past the half width.
  assert.ok(Math.abs(hullDistance(0, HULL_WATER.beam + 1) - 1) < 1e-9);
  assert.ok(Math.abs(hullDistance(0, HULL_WATER.beam + 3) - 3) < 1e-9);
  // Behind the stern and ahead of the bow: the metres past the ends.
  assert.ok(Math.abs(hullDistance(-L - 2, 0) - 2) < 1e-9);
  assert.ok(Math.abs(hullDistance(L + 5, 0) - 5) < 1e-9);
  // The edge unit is the distance times a constant, so rings are as thick along as across.
  assert.ok(Math.abs(hullEdge(-L - 2, 0) - 2 * EDGE_PER_METRE) < 1e-9);
  assert.ok(
    Math.abs(hullEdge(0, HULL_WATER.beam + 2) - 2 * EDGE_PER_METRE) < 1e-9,
  );
  // The outline is rounded at the ends and narrower at the stern than amidships.
  assert.equal(hullHalfWidth(L), 0);
  assert.equal(hullHalfWidth(-L), 0);
  assert.ok(hullHalfWidth(0) > hullHalfWidth(-L * 0.9));
});

test("there is no band of 'near' water ahead of the thin bow (a stretched ellipse left one)", () => {
  // A point 6 m beyond the tip and 2 m to the side is more than 6 m from the hull, not 2.
  assert.ok(hullDistance(L + 6, 2) > 6);
  assert.ok(hullDistance(L + 6, 2) > hullDistance(L + 1, 2));
  // And the distance only grows as you move away from the hull in any direction.
  for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
    let last = -1;
    for (let r = 4.5; r < 20; r += 0.5) {
      const d = hullDistance(Math.cos(angle) * r, Math.sin(angle) * r);
      assert.ok(d >= last - 1e-9, `angle ${angle.toFixed(1)} r ${r}`);
      last = d;
    }
  }
});

test("the ripples and the foam fade out well inside the shader's reach, so no circle is ever cut", () => {
  // Every point where the rings still have slope or the crests still have foam must be inside
  // HULL_REACH of the hull's middle (the shader skips the hull beyond it).
  let farthest = 0;
  for (let u = -30; u <= 30; u += 0.25)
    for (let v = -30; v <= 30; v += 0.25) {
      const edge = hullEdge(u, v);
      if (ringFade(edge) > 1e-4 || edge < FOAM_REACH)
        farthest = Math.max(farthest, Math.hypot(u - HULL_WATER.shift, v));
    }
  assert.ok(
    farthest < HULL_REACH - 0.5,
    `still drawn ${farthest.toFixed(1)} m from the hull, reach ${HULL_REACH} m`,
  );
  // The collar's own reach: the widest it can be anywhere, past the stern or the bow too.
  let reach = 0;
  for (let u = -L - 3; u <= L + 3; u += 0.1)
    for (let v = -4; v <= 4; v += 0.1)
      if (collarFoam(u, v, 1, 1) > 1e-3)
        reach = Math.max(reach, Math.hypot(u - HULL_WATER.shift, v));
  assert.ok(reach < HULL_REACH - 0.5, `collar reaches ${reach.toFixed(1)} m`);
  assert.equal(ringFade(RING_FADE.to), 0);
  assert.ok(ringFade(1) > 0.4, "the first rings are strong");
});

test("the shader builds its hull maths from these numbers and cuts nothing off by a literal", () => {
  assert.ok(
    water.includes("glslHullEdge()"),
    "the shader's hullEdge is generated",
  );
  assert.ok(water.includes("hullEdge(u, v)"));
  assert.ok(
    water.includes("HULL_REACH * HULL_REACH"),
    "the reach is the constant, squared",
  );
  assert.ok(
    !water.includes("> 100.0)) continue"),
    "the old 10 m cut-off is gone",
  );
  assert.ok(
    !water.includes("float edge = max((length(vec2(v / hw"),
    "the stretched ellipse is gone",
  );
  const glsl = glslHullEdge();
  assert.ok(glsl.includes("float hullEdge(float u, float v)"));
  assert.ok(glsl.includes(EDGE_PER_METRE.toFixed(4)));
  // The collar and the rings are not made from a single value-noise lattice (boxy cells).
  assert.ok(water.includes("float softNoise(vec2 p)"));
  assert.ok(water.includes("float lap = softNoise("));
});

test("a boat's shadow is not black and has a soft edge", () => {
  // Sun is most of the light at sunset (about 70 %): the water must keep close to half of it.
  assert.ok(shadowKeeps(0.7) > 0.4, `keeps ${shadowKeeps(0.7).toFixed(2)}`);
  assert.ok(shadowKeeps(1) > 0.3);
  // The first version took 90 % of the sun and 45 % of the rest and kept a fifth of the light.
  assert.ok(SHADOW.sun < 0.8 && SHADOW.sky < 0.3 && SHADOW.mirror < 0.3);
  assert.ok(
    SHADOW.penumbra > 0,
    "the edge softens with the height of the caster",
  );
  assert.ok(water.includes("${SHADOW.sun.toFixed(2)} * shade"));
  assert.ok(water.includes("${SHADOW.penumbra.toFixed(2)} * h"));
  assert.ok(!water.includes("1.0 - 0.9 * shade"), "the black shadow is gone");
});

// The most foam anywhere on a grid of points round the hull, with the collar at its widest (the
// ragged width noise and the gap noise both at their highest): the worst case the shader can paint.
const worstFoam = (u, v) => collarFoam(u, v, 1, 1);

test("the collar is a thin lap along the sides: nothing past 1 m from the waterline (the planking flares out about 0.35 m over it, so about half a metre shows)", () => {
  assert.ok(COLLAR.side.max <= 1.0 && COLLAR_SIDE_MAX === COLLAR.side.max);
  // Amidships and along the sides (away from the bow splash and the stern wash).
  for (let u = -L + COLLAR.stern.span; u <= L - COLLAR.bow.span; u += 0.1) {
    const hw = hullHalfWidth(u);
    assert.ok(
      worstFoam(u, hw + 1.0) < 0.01,
      `foam ${worstFoam(u, hw + 1.0).toFixed(3)} 1 m off the side at u=${u.toFixed(1)}`,
    );
    assert.ok(worstFoam(u, -hw - 1.0) < 0.01);
    // And it does hug the waterline: strong right at it.
    assert.ok(worstFoam(u, hw + 0.03) > 0.5);
  }
  // Even with everything at its widest, no point farther than 1.3 m from the waterline has any foam,
  // anywhere in the bow splash or the stern wash either.
  for (let u = -L - 3; u <= L + 3; u += 0.1)
    for (let v = -4; v <= 4; v += 0.1)
      if (hullDistance(u, v) > 1.3)
        assert.ok(
          worstFoam(u, v) < 0.01,
          `foam ${worstFoam(u, v).toFixed(3)} at u=${u.toFixed(1)} v=${v.toFixed(1)}`,
        );
});

test("the bow splash stays at the stem: no foam ahead of the tip", () => {
  for (let ahead = 0.5; ahead <= 3; ahead += 0.1)
    for (let v = -2; v <= 2; v += 0.1)
      assert.equal(
        worstFoam(L + ahead, v) < 0.01,
        true,
        `foam ${ahead.toFixed(1)} m ahead of the bow at v=${v.toFixed(1)}`,
      );
  // A fat halo reached 1.5 m and more ahead: none beyond the stem's own short splash.
  assert.ok(COLLAR.bow.past <= 0.3);
  assert.equal(collarWidth(L + COLLAR.bow.past, 1), 0);
  // The splash is bigger than the side lap but still small.
  assert.ok(collarWidth(L - 0.6, 1) > collarWidth(0, 1));
  assert.ok(collarWidth(L - 0.6, 1) < 1.3);
});

test("the wash behind the transom stops at the transom (no U of foam round a stopped boat's stern) (the wake strips take it on)", () => {
  assert.ok(COLLAR.stern.past <= 0.2);
  assert.equal(collarWidth(-L - COLLAR.stern.past, 1), 0);
  for (let behind = 0.3; behind <= 4; behind += 0.1)
    for (let v = -2; v <= 2; v += 0.1)
      assert.ok(
        worstFoam(-L - behind, v) < 0.01,
        `${behind.toFixed(1)} m behind`,
      );
  assert.ok(collarWidth(-L + 0.2, 1) < 1.3);
});

test("the collar is broken up and soft, never a closed loop of white", () => {
  // Where the gap noise is low there is no foam at all along the sides, so it is in pieces; with
  // the noise a little over its first step it is partial (a smooth step, never a hard cut).
  const hw = hullHalfWidth(0);
  assert.equal(collarFoam(0, hw + 0.05, 1, 0), 0, "a gap in the lap");
  assert.ok(collarFoam(0, hw + 0.05, 1, 1) > 0.5, "a piece of the lap");
  let steps = 0;
  let last = collarFoam(0, hw + 0.05, 1, 0);
  for (let g = 0.01; g <= 1; g += 0.01) {
    const now = collarFoam(0, hw + 0.05, 1, g);
    assert.ok(Math.abs(now - last) < 0.1, `a hard step at gap noise ${g}`);
    if (now > 0 && last === 0) steps++;
    last = now;
  }
  assert.equal(steps, 1);
  // Across the lap the foam falls off smoothly: no step above a tenth for a centimetre.
  let prev = collarFoam(0, hw, 1, 1);
  for (let m = 0.01; m < 1.0; m += 0.01) {
    const now = collarFoam(0, hw + m, 1, 1);
    assert.ok(now <= prev + 1e-9 && prev - now < 0.12, `ragged edge at ${m}`);
    prev = now;
  }
  // The ring crests catch only a faint, short-reaching foam.
  assert.ok(CREST_FOAM <= 0.4);
  assert.ok(FOAM_REACH / EDGE_PER_METRE < 1.8);
});

test("the shader's collar is the one generated from these numbers", () => {
  assert.ok(water.includes("glslCollarWidth()"));
  assert.ok(water.includes("collarWidth(u, lap)"));
  assert.ok(water.includes("CREST_FOAM.toFixed(2)"));
  const glsl = glslCollarWidth();
  assert.ok(glsl.includes("float collarWidth(float u, float lap)"));
  assert.ok(glsl.includes(COLLAR.side.max.toFixed(4)));
  assert.ok(
    glsl.includes(
      COLLAR.bow.boost - 1 > 0 ? (COLLAR.bow.boost - 1).toFixed(4) : "x",
    ),
  );
  // GLSL leaves smoothstep undefined when the first edge is not below the second.
  for (const m of glsl.matchAll(/smoothstep\((-?[\d.]+), (-?[\d.]+),/g))
    assert.ok(Number(m[1]) < Number(m[2]), m[0]);
  assert.ok(
    !water.includes("float push ="),
    "the fat 'push' at the bow is gone",
  );
  assert.ok(!water.includes("(0.8 + 1.4 * lap)"));
});
