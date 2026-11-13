import assert from "node:assert/strict";
import test from "node:test";
import { readGlb } from "./support/glb.mjs";

const {
  BOAT_FILE,
  BOAT_ROOT,
  BOAT_PARTS,
  BOAT_YAW,
  BOAT_ROLES,
  paintBoat,
  countRoles,
  rgb,
} = await import("../src/ocean/boat-paint.ts");
const { boatPalettes } = await import("../src/ocean/palette.ts");
const { ROD_BASE } = await import("../src/ocean/rod.ts");
const { PAL } = await import("../src/ocean/art/colors.ts");

// The player's boat from Blender (public/models/boat.glb, tools/blender/boat.py). The file is read as
// data, so a bad export is caught without a browser. The roles are the two colours the game
// replaces per player (BoatPalette.hull and .trim).
const { gltf, accessor } = readGlb(`public/models/${BOAT_FILE}`);
const nodeByName = (name) => gltf.nodes.find((n) => n.name === name);

/** Every primitive of a node: positions (in the node's own frame), indices and colours. */
function primitives(node) {
  return gltf.meshes[node.mesh].primitives.map((p) => ({
    position: accessor(p.attributes.POSITION),
    colour: accessor(p.attributes.COLOR_0),
    triangles: gltf.accessors[p.indices].count / 3,
  }));
}
const trianglesOf = (node) =>
  primitives(node).reduce((sum, p) => sum + p.triangles, 0);
/** Colours of a node as RGBA floats (0..1), vertex after vertex. */
const coloursOf = (node) => {
  const out = [];
  for (const p of primitives(node))
    for (let i = 0; i < p.colour.count; i++)
      out.push(
        p.colour.data[i * p.colour.comps],
        p.colour.data[i * p.colour.comps + 1],
        p.colour.data[i * p.colour.comps + 2],
        1,
      );
  return out;
};
const near = (a, b, e = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < e);

test("the file has the root and its six parts, each with its pivot, and the right vertex data", () => {
  const root = nodeByName(BOAT_ROOT);
  assert.ok(root, "root node `boat`");
  assert.deepEqual(gltf.scenes[0].nodes, [gltf.nodes.indexOf(root)]);
  assert.deepEqual(
    root.children.map((i) => gltf.nodes[i].name).sort(),
    [...BOAT_PARTS].sort(),
  );
  assert.equal(
    root.translation,
    undefined,
    "the root is at the waterline, midship",
  );
  for (const node of gltf.nodes) {
    assert.equal(node.rotation, undefined, `${node.name} has no rotation`);
    assert.equal(node.scale, undefined, `${node.name} has no scale`);
  }
  for (const name of BOAT_PARTS)
    for (const p of primitives(nodeByName(name))) {
      assert.equal(
        p.colour.accessor.componentType,
        5123,
        `${name}: COLOR_0 is unsigned short`,
      );
      assert.equal(
        p.colour.accessor.normalized,
        true,
        `${name}: COLOR_0 is normalised`,
      );
    }
});

test("a boat fits the triangle budget (one boat plus its rod stays under about 6,000)", () => {
  const total = BOAT_PARTS.reduce(
    (sum, n) => sum + trianglesOf(nodeByName(n)),
    0,
  );
  assert.ok(total > 3000 && total < 4500, `${total} triangles`);
});

test("the bow is at the file's +Z; the turn bakes it to the game's -Z with the rod holder at starboard", () => {
  // World vertices of the whole model in the file's frame (part pivots added).
  const world = [];
  for (const name of BOAT_PARTS) {
    const node = nodeByName(name);
    const t = node.translation ?? [0, 0, 0];
    for (const p of primitives(node))
      for (let i = 0; i < p.position.count; i++)
        world.push({
          x: p.position.data[i * 3] + t[0],
          y: p.position.data[i * 3 + 1] + t[1],
          z: p.position.data[i * 3 + 2] + t[2],
          colour: [0, 1, 2].map((k) => p.colour.data[i * p.colour.comps + k]),
          part: name,
        });
  }
  // The outboard is at the stern, the stem at the other end: the bow is where the hull reaches the
  // farthest from the engine.
  const engine = nodeByName("engine").translation[2];
  const hull = world.filter((v) => v.part === "hull");
  const zs = hull.map((v) => v.z);
  const bowSign =
    Math.sign(Math.max(...zs) - 0) === Math.sign(-engine) ? 1 : -1;
  assert.equal(
    bowSign,
    1,
    "the engine (stern) is at -Z, so the bow is at +Z in the file",
  );
  assert.ok(
    Math.max(...zs) > 3.5 && Math.min(...zs) < -3.5,
    "about 7.4 m long",
  );
  assert.ok(
    Math.max(...hull.map((v) => Math.abs(v.x))) <= 1.55,
    "about 3 m wide",
  );
  assert.ok(
    Math.min(...hull.map((v) => v.y)) > -0.7 &&
      Math.max(...hull.map((v) => v.y)) < 1.8,
  );
  // After the turn (x -> -x, z -> -z): the green light (starboard) is at +X in the bow (-Z) half,
  // and the rod holder's collar sits at the game's ROD_BASE.
  assert.ok(
    Math.abs(Math.abs(Math.cos(BOAT_YAW)) - 1) < 1e-9 &&
      Math.abs(Math.sin(BOAT_YAW)) < 1e-9,
  );
  const turned = (v) => ({ x: -v.x, y: v.y, z: -v.z });
  const green = rgb(PAL.paint.green);
  const lights = world.filter(
    (v) => v.part === "deck" && near(v.colour, green, 0.003),
  );
  assert.ok(lights.length > 0, "a green bow light");
  for (const v of lights) {
    const w = turned(v);
    assert.ok(
      w.x > 0.5 && w.z < -2.5,
      `the green light is starboard, forward (${w.x}, ${w.z})`,
    );
  }
  const rubber = rgb(PAL.fit.rubber);
  const holder = world
    .filter((v) => v.part === "deck" && near(v.colour, rubber, 0.003))
    .map(turned)
    .filter(
      (w) =>
        Math.hypot(w.x - ROD_BASE.x, w.y - ROD_BASE.y, w.z - ROD_BASE.z) < 0.2,
    );
  assert.ok(
    holder.length > 4,
    "the rod holder's collar is at ROD_BASE (keep rod.ts and boat.py FIT in sync)",
  );
  // The deck is the player's deck: its planks (wood.deck) lie at the deck height.
  assert.ok(
    world.some((v) => v.part === "deck" && Math.abs(v.y - 0.78) < 0.01),
    "deck at 0.78 m",
  );
});

test("both role colours are in the file, where the brief says they are", () => {
  const hull = coloursOf(nodeByName("hull"));
  const canopy = coloursOf(nodeByName("canopy"));
  const engine = coloursOf(nodeByName("engine"));
  const flag = coloursOf(nodeByName("flag"));
  assert.ok(countRoles(hull).hull > 100, "the hull paint");
  assert.ok(countRoles(hull).trim > 100, "the rubbing strip");
  assert.ok(countRoles(canopy).hull > 30, "the dome roof is hull paint");
  assert.ok(countRoles(canopy).trim > 10, "the roof rim");
  assert.ok(countRoles(engine).trim > 10, "the cowl band");
  assert.ok(countRoles(flag).trim > 10, "the pennant");
  assert.equal(countRoles(coloursOf(nodeByName("lantern"))).hull, 0);
  // The model carries the first palette's roles exactly (whole bytes).
  assert.deepEqual(BOAT_ROLES, boatPalettes[0]);
  const bytes = (c) => [c.r, c.g, c.b].map((v) => Math.round(v * 255));
  assert.deepEqual(
    bytes({
      r: rgb(BOAT_ROLES.hull)[0],
      g: rgb(BOAT_ROLES.hull)[1],
      b: rgb(BOAT_ROLES.hull)[2],
    }),
    [42, 111, 184],
  );
  // The lantern's glass is the lamp colour (it glows in the game).
  const lamp = rgb(PAL.light.lamp);
  assert.ok(
    coloursOf(nodeByName("lantern")).some(
      (_, i, a) => i % 4 === 0 && near(a.slice(i, i + 3), lamp, 0.003),
    ),
    "a lamp-coloured lantern",
  );
});

test("painting replaces the two roles and nothing else", () => {
  const all = BOAT_PARTS.flatMap((n) => coloursOf(nodeByName(n)));
  const base = countRoles(all);
  const same = paintBoat(all, boatPalettes[0]);
  assert.deepEqual(
    Array.from(same),
    Array.from(Float32Array.from(all)),
    "palette 0 changes nothing",
  );
  for (const palette of boatPalettes.slice(1)) {
    const painted = paintBoat(all, palette);
    let changed = 0;
    const want = { hull: rgb(palette.hull), trim: rgb(palette.trim) };
    let gotHull = 0;
    let gotTrim = 0;
    for (let i = 0; i < all.length; i += 4) {
      const before = all.slice(i, i + 3);
      const after = Array.from(painted.slice(i, i + 3));
      if (!near(before, after, 1e-6)) changed++;
      if (near(before, rgb(BOAT_ROLES.hull), 0.003)) {
        gotHull++;
        assert.ok(
          near(after, want.hull, 1e-6),
          "a hull vertex takes the hull colour",
        );
      } else if (near(before, rgb(BOAT_ROLES.trim), 0.003)) {
        gotTrim++;
        assert.ok(
          near(after, want.trim, 1e-6),
          "a trim vertex takes the trim colour",
        );
      } else assert.ok(near(before, after, 1e-6), "any other colour stays");
    }
    assert.equal(gotHull, base.hull);
    assert.equal(gotTrim, base.trim);
    assert.ok(changed > 0 && changed <= base.hull + base.trim);
    assert.equal(painted.length, all.length);
  }
});
