import assert from "node:assert/strict";
import test from "node:test";

const {
  NPC_LOOKS,
  NPC_RIG,
  WAVE_ARM,
  WAVE_EVERY,
  WAVE_SECONDS,
  idlePose,
  walkPose,
  waveAmount,
  wavePose,
} = await import("../src/ocean/npc-look.ts");
const { MARKETS } = await import("../src/ocean/market.ts");
const { PAL } = await import("../src/ocean/art/colors.ts");

/** Every number in a palette role set, flattened. */
function paletteColours(node, out = new Set()) {
  if (typeof node === "number") out.add(node);
  else if (Array.isArray(node)) node.forEach((x) => paletteColours(x, out));
  else if (node && typeof node === "object")
    Object.values(node).forEach((x) => paletteColours(x, out));
  return out;
}

test("every look is dressed only in colours of the shared palette", () => {
  const known = paletteColours(PAL);
  const colourKeys = [
    "skin",
    "hair",
    "shirt",
    "pants",
    "shoes",
    "apron",
    "hatColor",
  ];
  for (const [id, look] of Object.entries(NPC_LOOKS)) {
    for (const key of colourKeys)
      if (look[key] !== undefined)
        assert.ok(known.has(look[key]), `${id}.${key} is not in the palette`);
    assert.ok(look.scale >= 1 && look.scale <= 1.8, `${id} scale`);
    assert.ok(["none", "non", "cap", "scarf"].includes(look.hat), `${id} hat`);
    if (look.hat !== "none")
      assert.ok(look.hatColor !== undefined, `${id} has a hat colour`);
  }
});

test("the looks are different from one another", () => {
  const seen = new Set(
    Object.values(NPC_LOOKS).map((look) =>
      [look.skin, look.shirt, look.hat, look.apron].join("/"),
    ),
  );
  assert.equal(seen.size, Object.keys(NPC_LOOKS).length);
});

test("every market's vendor has a look", () => {
  for (const market of MARKETS)
    assert.ok(market.vendor.look in NPC_LOOKS, market.id);
});

test("the joints sit inside the body, so the parts overlap rather than float apart", () => {
  // The shoulders are narrower than the torso plus the shoulder ball, the hips inside the
  // pelvis, and the head sits on the top of the torso (about 0.55 above the hips).
  assert.ok(NPC_RIG.shoulder.x < 0.19 + 0.01);
  assert.ok(NPC_RIG.hip.x < 0.1);
  assert.ok(NPC_RIG.shoulder.y < NPC_RIG.headY);
  assert.ok(NPC_RIG.hip.y < NPC_RIG.shoulder.y);
});

test("standing, the figure breathes a little and nothing swings", () => {
  for (let t = 0; t < 20; t += 0.37) {
    const pose = idlePose(t);
    assert.ok(Math.abs(pose.hipsY) <= 0.01, "a small bob");
    assert.deepEqual([...pose.legs], [0, 0]);
    for (const arm of pose.arms) assert.ok(Math.abs(arm.x) <= 0.031);
  }
});

test("arms hang a little away from the body: outward is positive at +x and negative at -x", () => {
  const pose = idlePose(0);
  assert.ok(pose.arms[0].z < 0, "the -x arm leans out");
  assert.ok(pose.arms[1].z > 0, "the +x arm leans out");
});

test("a wave lasts WAVE_SECONDS out of every WAVE_EVERY, peaks in the middle and uses one arm", () => {
  assert.equal(waveAmount(WAVE_SECONDS + 0.01), 0);
  assert.equal(waveAmount(WAVE_EVERY - 0.01), 0);
  assert.ok(Math.abs(waveAmount(WAVE_SECONDS / 2) - 1) < 1e-9);
  assert.equal(waveAmount(0), 0);
  assert.equal(
    waveAmount(WAVE_EVERY + WAVE_SECONDS / 2),
    waveAmount(WAVE_SECONDS / 2),
  );
  const resting = wavePose(WAVE_SECONDS + 1);
  assert.deepEqual(
    resting,
    idlePose(WAVE_SECONDS + 1),
    "outside a wave it just breathes",
  );
  const peak = wavePose(WAVE_SECONDS / 2);
  const other = 1 - WAVE_ARM;
  assert.ok(
    peak.arms[WAVE_ARM].z > 2,
    "the waving arm is lifted out and over the shoulder",
  );
  assert.ok(Math.abs(peak.arms[other].z) < 0.1, "the other arm stays down");
});

test("walking swings opposite arms and legs together and bobs twice a stride", () => {
  for (let phase = 0; phase < 6.4; phase += 0.3) {
    const pose = walkPose(phase);
    assert.ok(
      Math.abs(pose.legs[0] + pose.legs[1]) < 1e-9,
      "legs swing opposite",
    );
    assert.ok(
      Math.abs(pose.arms[0].x + pose.arms[1].x) < 1e-9,
      "arms swing opposite",
    );
    assert.ok(Math.abs(pose.legs[0]) <= 0.7 + 1e-9);
    assert.ok(pose.hipsY >= 0 && pose.hipsY <= 0.026);
    // The leg that goes forward is paired with the arm that goes back on the same side.
    assert.ok(pose.legs[0] * pose.arms[0].x <= 1e-9);
  }
  assert.ok(Math.abs(walkPose(0).hipsY - walkPose(Math.PI).hipsY) < 1e-9);
});
