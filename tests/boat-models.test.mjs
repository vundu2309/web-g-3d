import assert from "node:assert/strict";
import test from "node:test";
import { readGlb } from "./support/glb.mjs";

const { BOAT_ROOT, BOAT_PARTS, BOAT_ROLES, paintBoat, countRoles, rgb } =
  await import("../src/ocean/boat-paint.ts");
const { boatPalettes } = await import("../src/ocean/palette.ts");
const { PAL } = await import("../src/ocean/art/colors.ts");

// The four boat tiers (tools/blender/upgrade_boats.py, exported by boat.export_parts_glb) and the
// shipyard, read as data. Tier 1 is the player's own boat (public/models/boat.glb, also covered by
// tests/boat-model.test.mjs); tiers 2 to 4 are the upgrade shop's bigger boats. Every boat keeps
// exactly the contract boat-paint.ts reads: the root `boat`, its six parts, and the two role
// colours of palette 0 (hull 0x2A6FB8, trim 0xFFD35A), so `paintBoat` works on all of them.
const TIERS = [
  { tier: 1, file: "boat.glb", hullLength: 7.4, triangles: 3721 },
  { tier: 2, file: "boat-2.glb", hullLength: 8.4, triangles: 5443 },
  { tier: 3, file: "boat-3.glb", hullLength: 9.6, triangles: 5757 },
  { tier: 4, file: "boat-4.glb", hullLength: 10.8, triangles: 7991 },
];
// Triangle budgets: the numbers MEASURED on the exported files (Blender 5.3, 2026-11-19), as the
// concept predicted them (tier 1 3,721, tier 2 5,443, tier 3 5,757, tier 4 7,991, shipyard 7,537),
// with a small margin up (2 %) for a deliberate refinement and a margin down (3 %) so a part that
// silently disappears is noticed. A bigger boat needs a new measurement and a recorded reason.
const MARGIN_UP = 1.02;
const MARGIN_DOWN = 0.97;
const SHIPYARD_TRIANGLES = 7537;

const files = new Map();
function load(file) {
  if (!files.has(file)) {
    const { gltf, accessor } = readGlb(`public/models/${file}`);
    const byName = (name) => gltf.nodes.find((n) => n.name === name);
    /** Every primitive of a node: positions (the node's own frame), indices, colours. */
    const primitives = (node) =>
      gltf.meshes[node.mesh].primitives.map((p) => ({
        position: accessor(p.attributes.POSITION),
        colour: accessor(p.attributes.COLOR_0),
        triangles: gltf.accessors[p.indices].count / 3,
      }));
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
    const trianglesOf = (node) =>
      primitives(node).reduce((sum, p) => sum + p.triangles, 0);
    /** Vertices of a node in the file's frame (the node's pivot added). */
    const worldOf = (node) => {
      const t = node.translation ?? [0, 0, 0];
      const out = [];
      for (const p of primitives(node))
        for (let i = 0; i < p.position.count; i++)
          out.push({
            x: p.position.data[i * 3] + t[0],
            y: p.position.data[i * 3 + 1] + t[1],
            z: p.position.data[i * 3 + 2] + t[2],
            colour: [0, 1, 2].map((k) => p.colour.data[i * p.colour.comps + k]),
          });
      return out;
    };
    files.set(file, {
      gltf,
      byName,
      primitives,
      coloursOf,
      trianglesOf,
      worldOf,
    });
  }
  return files.get(file);
}
const extent = (vs, axis) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vs) {
    lo = Math.min(lo, v[axis]);
    hi = Math.max(hi, v[axis]);
  }
  return [lo, hi];
};
const near = (a, b, e = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < e);
const bytes = (c) => c.map((v) => Math.round(v * 255));
const hex = (c) => bytes(c).reduce((a, v) => a * 256 + v, 0);
const inBudget = (total, measured) =>
  total <= Math.ceil(measured * MARGIN_UP) &&
  total >= Math.floor(measured * MARGIN_DOWN);

for (const { tier, file, triangles } of TIERS) {
  const m = () => load(file);

  test(`tier ${tier} (${file}): the root and the six parts, each with its pivot, no textures`, () => {
    const { gltf, byName, primitives } = m();
    const root = byName(BOAT_ROOT);
    assert.ok(root, "root node `boat`");
    assert.deepEqual(gltf.scenes[0].nodes, [gltf.nodes.indexOf(root)]);
    assert.deepEqual(
      root.children.map((i) => gltf.nodes[i].name).sort(),
      [...BOAT_PARTS].sort(),
    );
    assert.equal(gltf.nodes.length, BOAT_PARTS.length + 1, "no other node");
    assert.equal(root.translation, undefined, "the root is at the waterline");
    for (const node of gltf.nodes) {
      assert.equal(node.rotation, undefined, `${node.name}: no rotation`);
      assert.equal(node.scale, undefined, `${node.name}: no scale`);
    }
    assert.equal(gltf.images, undefined, "no textures");
    assert.equal(gltf.textures, undefined, "no textures");
    for (const name of BOAT_PARTS)
      for (const p of primitives(byName(name))) {
        assert.equal(p.colour.accessor.componentType, 5123, `${name}: COLOR_0`);
        assert.equal(p.colour.accessor.normalized, true, `${name}: COLOR_0`);
      }
    // the pivots the game turns the parts about (tier 1's are in tests/boat-model.test.mjs)
    for (const name of ["canopy", "engine", "flag", "lantern"])
      assert.ok(byName(name).translation, `${name} has its pivot`);
    for (const name of ["hull", "deck"])
      assert.equal(byName(name).translation, undefined, `${name} at the root`);
  });

  test(`tier ${tier}: the triangle count is the measured ${triangles} (budget +2 % / -3 %)`, () => {
    const { byName, trianglesOf } = m();
    const total = BOAT_PARTS.reduce(
      (sum, n) => sum + trianglesOf(byName(n)),
      0,
    );
    assert.ok(
      inBudget(total, triangles),
      `${total} triangles, measured ${triangles}`,
    );
  });

  test(`tier ${tier}: both role colours are there (hull 0x2A6FB8, trim 0xFFD35A) and the flag is neither`, () => {
    const { byName, coloursOf } = m();
    assert.equal(BOAT_ROLES.hull, 0x2a6fb8);
    assert.equal(BOAT_ROLES.trim, 0xffd35a);
    assert.deepEqual(BOAT_ROLES, boatPalettes[0]);
    const hull = countRoles(coloursOf(byName("hull")));
    const canopy = countRoles(coloursOf(byName("canopy")));
    assert.ok(hull.hull > 100, `the hull paint (${hull.hull})`);
    assert.ok(hull.trim > 100, `the rubbing strip (${hull.trim})`);
    assert.ok(canopy.hull > 30, `the roof dome (${canopy.hull})`);
    assert.ok(canopy.trim > 10, `the roof rim (${canopy.trim})`);
    // the lantern is the lamp's glass, never a role
    assert.deepEqual(countRoles(coloursOf(byName("lantern"))), {
      hull: 0,
      trim: 0,
    });
  });

  test(`tier ${tier}: the flag is the flag of Vietnam (red and yellow, no role colour)`, () => {
    const { byName, coloursOf } = m();
    const flag = coloursOf(byName("flag"));
    assert.deepEqual(countRoles(flag), { hull: 0, trim: 0 });
    const seen = new Map();
    for (let i = 0; i < flag.length; i += 4) {
      const h = hex(flag.slice(i, i + 3));
      seen.set(h, (seen.get(h) ?? 0) + 1);
    }
    // the cloth, the star, and the halyard sleeve on the mast (wood, the mast's own colour)
    const allowed = new Set([PAL.flag.red, PAL.flag.star, PAL.wood.mid]);
    for (const h of seen.keys())
      assert.ok(allowed.has(h), `flag colour 0x${h.toString(16)} is allowed`);
    assert.ok(seen.get(PAL.flag.red) > 30, "the red field");
    assert.ok(seen.get(PAL.flag.star) > 30, "the yellow star");
    assert.notEqual(PAL.flag.red, BOAT_ROLES.hull);
    assert.notEqual(PAL.flag.red, BOAT_ROLES.trim);
    assert.notEqual(PAL.flag.star, BOAT_ROLES.hull);
    assert.notEqual(PAL.flag.star, BOAT_ROLES.trim);
  });

  test(`tier ${tier}: painting replaces the two roles and leaves the flag alone`, () => {
    const { byName, coloursOf } = m();
    const all = BOAT_PARTS.flatMap((n) => coloursOf(byName(n)));
    const base = countRoles(all);
    assert.deepEqual(
      Array.from(paintBoat(all, boatPalettes[0])),
      Array.from(Float32Array.from(all)),
      "palette 0 changes nothing",
    );
    for (const palette of boatPalettes.slice(1)) {
      const painted = paintBoat(all, palette);
      let changed = 0;
      for (let i = 0; i < all.length; i += 4)
        if (
          !near(all.slice(i, i + 3), Array.from(painted.slice(i, i + 3)), 1e-6)
        )
          changed++;
      // a palette that keeps a role's colour (palette 2 keeps the yellow trim) changes only the other
      const expected =
        (palette.hull === BOAT_ROLES.hull ? 0 : base.hull) +
        (palette.trim === BOAT_ROLES.trim ? 0 : base.trim);
      assert.equal(changed, expected, "only the roles change");
      const flag = coloursOf(byName("flag"));
      const flagAfter = paintBoat(flag, palette);
      assert.deepEqual(
        Array.from(flagAfter),
        Array.from(Float32Array.from(flag)),
        "the flag keeps its colours",
      );
    }
  });

  test(`tier ${tier}: the bow is at +Z (the engine at the stern, the green light forward to starboard)`, () => {
    const { byName, worldOf } = m();
    const hull = worldOf(byName("hull"));
    const [zLo, zHi] = extent(hull, "z");
    assert.ok(byName("engine").translation[2] < -3, "engine at the stern (-Z)");
    assert.ok(zHi > 3.5 && zLo < -3.5);
    const turned = (v) => ({ x: -v.x, y: v.y, z: -v.z }); // the game's frame
    const green = rgb(PAL.paint.green);
    const lights = worldOf(byName("deck")).filter((v) =>
      near(v.colour, green, 0.003),
    );
    assert.ok(lights.length > 0, "a green bow light");
    for (const v of lights) {
      const w = turned(v);
      assert.ok(
        w.x > 0.5 && w.z < -2.5,
        `starboard and forward (${w.x}, ${w.z})`,
      );
    }
  });

  test(`tier ${tier}: every vertex colour is a palette colour`, () => {
    const { byName, coloursOf } = m();
    const palette = new Set();
    (function walk(v) {
      if (typeof v === "number") palette.add(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    })(PAL);
    for (const p of boatPalettes) {
      palette.add(p.hull);
      palette.add(p.trim);
    }
    const stray = new Set();
    for (const n of BOAT_PARTS) {
      const c = coloursOf(byName(n));
      for (let i = 0; i < c.length; i += 4) {
        const h = hex(c.slice(i, i + 3));
        if (!palette.has(h)) stray.add(`${n} 0x${h.toString(16)}`);
      }
    }
    assert.deepEqual([...stray], [], "colours outside the palette");
  });
}

test("each tier is longer than the one before (hull and whole model)", () => {
  const hullLengths = [];
  const modelLengths = [];
  for (const { file, hullLength } of TIERS) {
    const { byName, worldOf } = load(file);
    const [lo, hi] = extent(worldOf(byName("hull")), "z");
    const length = hi - lo;
    // the hull is its designed length plus the stem's overhang (the rake and the bumper)
    assert.ok(
      length > hullLength && length < hullLength + 0.8,
      `${file}: hull ${length.toFixed(2)} m for a ${hullLength} m design`,
    );
    hullLengths.push(length);
    const all = BOAT_PARTS.flatMap((n) => worldOf(byName(n)));
    const [a, b] = extent(all, "z");
    modelLengths.push(b - a);
  }
  for (const lengths of [hullLengths, modelLengths])
    for (let i = 1; i < lengths.length; i++)
      assert.ok(
        lengths[i] > lengths[i - 1] + 0.5,
        `tier ${i + 1} is longer than tier ${i}: ${lengths.map((l) => l.toFixed(2))}`,
      );
});

test("each tier's triangle count grows with the tier", () => {
  const totals = TIERS.map(({ file }) => {
    const { byName, trianglesOf } = load(file);
    return BOAT_PARTS.reduce((sum, n) => sum + trianglesOf(byName(n)), 0);
  });
  for (let i = 1; i < totals.length; i++)
    assert.ok(totals[i] > totals[i - 1], `${totals}`);
});

test("tier 2's two outboards are the single `engine` part, pivot on the centre line", () => {
  const one = load("boat.glb");
  const two = load("boat-2.glb");
  const engine = two.byName("engine");
  assert.equal(engine.translation[0], 0, "the pivot is between the two motors");
  assert.equal(
    two.trianglesOf(engine),
    2 * one.trianglesOf(one.byName("engine")),
    "two copies of tier 1's outboard",
  );
  const xs = two.worldOf(engine).map((v) => v.x);
  assert.ok(
    Math.min(...xs) < -0.4 && Math.max(...xs) > 0.4,
    "one motor each side",
  );
  // two cowls in the hull's trim band (a motor's cowl carries one)
  assert.equal(
    countRoles(two.coloursOf(engine)).trim,
    2 * countRoles(one.coloursOf(one.byName("engine"))).trim,
  );
});

test("tier 4 carries its outriggers: it is the widest boat, tier 3 and 4 have an inboard", () => {
  const widths = TIERS.map(({ file }) => {
    const { byName, worldOf } = load(file);
    const all = BOAT_PARTS.flatMap((n) => worldOf(byName(n)));
    const [a, b] = extent(all, "x");
    return b - a;
  });
  assert.ok(widths[3] > 7 && widths[3] < 7.6, `tier 4 is ${widths[3]} m wide`);
  for (let i = 1; i < widths.length; i++)
    assert.ok(widths[i] > widths[i - 1], `${widths}`);
  // the inboard of tiers 3 and 4 (a propeller, a rudder, a skeg) hangs under the keel
  for (const file of ["boat-3.glb", "boat-4.glb"]) {
    const { byName, worldOf } = load(file);
    const ys = worldOf(byName("engine")).map((v) => v.y);
    assert.ok(
      Math.min(...ys) < -0.5,
      `${file}: the propeller is under the keel`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// The shipyard (public/models/shipyard.glb)
// ---------------------------------------------------------------------------------------------
const YARD_PARTS = ["pier", "slipway", "hull", "workshop", "crane", "props"];

test("the shipyard: the root `shipyard`, one mesh per part, flat palette colours, no textures", () => {
  const { gltf, byName, primitives, coloursOf, trianglesOf } =
    load("shipyard.glb");
  const root = byName("shipyard");
  assert.ok(root, "root node `shipyard`");
  assert.deepEqual(gltf.scenes[0].nodes, [gltf.nodes.indexOf(root)]);
  assert.deepEqual(
    root.children.map((i) => gltf.nodes[i].name).sort(),
    [...YARD_PARTS].sort(),
  );
  assert.equal(gltf.nodes.length, YARD_PARTS.length + 1);
  for (const node of gltf.nodes) {
    assert.equal(
      node.translation,
      undefined,
      `${node.name}: origin at the water`,
    );
    assert.equal(node.rotation, undefined, `${node.name}: no rotation`);
    assert.equal(node.scale, undefined, `${node.name}: no scale`);
  }
  assert.equal(gltf.images, undefined, "no textures");
  assert.equal(gltf.textures, undefined, "no textures");
  const palette = new Set();
  (function walk(v) {
    if (typeof v === "number") palette.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  })(PAL);
  for (const name of YARD_PARTS) {
    const node = byName(name);
    for (const p of primitives(node)) {
      assert.equal(p.colour.accessor.componentType, 5123, `${name}: COLOR_0`);
      assert.equal(p.colour.accessor.normalized, true, `${name}: COLOR_0`);
    }
    const c = coloursOf(node);
    for (let i = 0; i < c.length; i += 4)
      assert.ok(palette.has(hex(c.slice(i, i + 3))), `${name}: palette colour`);
  }
  // the measured total of the exported file, +2 % / -3 %
  const total = YARD_PARTS.reduce((sum, n) => sum + trianglesOf(byName(n)), 0);
  assert.ok(
    inBudget(total, SHIPYARD_TRIANGLES),
    `${total} triangles, measured ${SHIPYARD_TRIANGLES}`,
  );
});

test("the shipyard is about 20 x 12.6 m, deck at 0.8 m, the sea side at +Z", () => {
  const { byName, worldOf } = load("shipyard.glb");
  const all = YARD_PARTS.flatMap((n) => worldOf(byName(n)));
  const [x0, x1] = extent(all, "x");
  const [z0, z1] = extent(all, "z");
  const [y0, y1] = extent(all, "y");
  assert.ok(x1 - x0 > 19.5 && x1 - x0 < 21, `${(x1 - x0).toFixed(2)} m wide`);
  assert.ok(z1 - z0 > 12 && z1 - z0 < 13.2, `${(z1 - z0).toFixed(2)} m deep`);
  assert.ok(Math.abs((x0 + x1) / 2) < 0.5, "centred on the pier");
  assert.ok(Math.abs((z0 + z1) / 2) < 0.5, "centred on the pier");
  assert.ok(y0 > -1.8 && y0 < -1, `piles reach ${y0} m under the water`);
  assert.ok(y1 > 6 && y1 < 9, `the crane is ${y1} m high`);
  // the planks of the pier lie at the market's deck height
  const pier = worldOf(byName("pier"));
  assert.ok(
    pier.filter((v) => Math.abs(v.y - 0.8) < 0.005).length > 300,
    "planks at 0.8 m",
  );
  // the slipway runs down to the sea at +Z and ends under the water; the workshop is on the land side
  const slip = worldOf(byName("slipway"));
  assert.ok(
    Math.max(...slip.map((v) => v.z)) > 5.5,
    "the slipway reaches the sea (+Z)",
  );
  assert.ok(
    Math.min(...slip.map((v) => v.y)) < -0.5,
    "and goes under the water",
  );
  assert.ok(
    Math.max(...worldOf(byName("workshop")).map((v) => v.z)) < 0,
    "the workshop is on the land side (-Z)",
  );
  assert.ok(
    Math.max(...pier.map((v) => v.z)) > 5.5,
    "the jetty reaches the sea side (+Z)",
  );
});
