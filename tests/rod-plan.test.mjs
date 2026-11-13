import assert from "node:assert/strict";
import test from "node:test";

const {
  GUIDES,
  GUIDE_INNER,
  GUIDE_OUTER,
  ROD_RINGS,
  ROD_SIDES,
  joined,
  radiusAt,
  rodTriangles,
} = await import("../src/ocean/rod-plan.ts");
const { LINE_WIDTH } = await import("../src/ocean/ribbon.ts");
const { PAL } = await import("../src/ocean/art/colors.ts");

// The rod's shape (src/ocean/rod-plan.ts): chunky, tapered, in two alternating colours, with a
// fat cork handle, line guides and a round bright tip. Read as numbers, so a phone-size look is
// pinned without a GPU.
test("rings run from the butt to the tip, never backwards, and the blank tapers", () => {
  for (let i = 1; i < ROD_RINGS.length; i++)
    assert.ok(
      ROD_RINGS[i].s >= ROD_RINGS[i - 1].s,
      `ring ${i} is not behind ring ${i - 1}`,
    );
  assert.equal(ROD_RINGS[0].s, 0);
  assert.ok(
    ROD_RINGS.at(-1).s > 1,
    "the tip's ball reaches a little past where the line starts",
  );
  assert.ok(ROD_RINGS.at(-1).s < 1.1);
  const bands = ROD_RINGS.filter(
    (r) => r.colour === "bandA" || r.colour === "bandB",
  );
  for (let i = 1; i < bands.length; i++)
    assert.ok(
      bands[i].radius <= bands[i - 1].radius + 1e-9,
      "the blank never gets thicker toward the tip",
    );
  const handle = Math.max(
    ...ROD_RINGS.filter((r) => r.colour === "cork").map((r) => r.radius),
  );
  assert.ok(handle >= 0.12, "a fat handle (chunky, readable from afar)");
  assert.ok(
    bands[0].radius >= 0.1 && bands.at(-1).radius <= 0.05,
    "tapers from a thick base to a thin top",
  );
});

test("the colours alternate in hard bands: cork, ferrule, two band colours twice, a bright tip", () => {
  const order = [];
  for (const ring of ROD_RINGS)
    if (order.at(-1) !== ring.colour) order.push(ring.colour);
  assert.deepEqual(order, [
    "cap",
    "cork",
    "ferrule",
    "bandA",
    "bandB",
    "bandA",
    "bandB",
    "tip",
  ]);
  // A hard edge is two rings at the same place; equal thickness draws nothing between them.
  const edges = ROD_RINGS.map(
    (r, i) =>
      i + 1 < ROD_RINGS.length &&
      r.s === ROD_RINGS[i + 1].s &&
      r.colour !== ROD_RINGS[i + 1].colour,
  );
  assert.ok(edges.filter(Boolean).length >= 6, "colour changes are hard edges");
  for (let i = 0; i + 1 < ROD_RINGS.length; i++)
    if (
      ROD_RINGS[i].colour !== ROD_RINGS[i + 1].colour &&
      ROD_RINGS[i].radius === ROD_RINGS[i + 1].radius &&
      ROD_RINGS[i].s === ROD_RINGS[i + 1].s
    )
      assert.equal(
        joined(i),
        false,
        "no surface where only the colour changes",
      );
  assert.ok(PAL.rod.tip, "the tip colour is a role of the shared palette");
});

test("the tip is a round ball thicker than the blank under it, and the guides sit on the blank", () => {
  const ball = Math.max(
    ...ROD_RINGS.filter((r) => r.colour === "tip").map((r) => r.radius),
  );
  assert.ok(ball > radiusAt(0.93) * 2, "a ball, not a taper");
  assert.ok(GUIDES.length >= 3);
  for (const s of GUIDES)
    assert.ok(s > 0.25 && s < 0.93, `guide at ${s} is on the blank`);
  for (let i = 1; i < GUIDES.length; i++) assert.ok(GUIDES[i] > GUIDES[i - 1]);
  assert.ok(GUIDE_OUTER > GUIDE_INNER * 1.4, "an eyelet with a hole");
});

test("one rod stays small (the whole boat plus rod stays under about 6,000 triangles)", () => {
  const triangles = rodTriangles();
  assert.ok(triangles > 150 && triangles < 600, `${triangles} triangles`);
  assert.equal(ROD_SIDES, 8);
});

test("the fishing line is a strip two to three pixels wide on a phone at any distance the game shows it", () => {
  // The game's cameras look with a vertical field of 0.9 (chase) or 0.75 (fishing) radians; a phone
  // in landscape is about 390 px high.
  for (const fov of [0.9, 0.75])
    for (const distance of [8, 12, 20, 30, 40, 50]) {
      const width = Math.min(
        LINE_WIDTH.max,
        Math.max(LINE_WIDTH.min, distance * LINE_WIDTH.perMetre),
      );
      const pixel = (2 * distance * Math.tan(fov / 2)) / 390;
      const pixels = width / pixel;
      assert.ok(
        pixels >= 1.1 && pixels <= 4,
        `${pixels.toFixed(2)} px at ${distance} m (fov ${fov})`,
      );
    }
  assert.ok(
    LINE_WIDTH.halo > 1.5,
    "a halo wider than the line, so it shows on bright water",
  );
});
