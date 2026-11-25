import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { rodCreature } = await import("../src/ocean/rod-geometry.ts");
const { rodColour } = await import("../src/ocean/rod-colours.ts");
const { ROD_COLOUR_NAMES, ROD_PLANS } = await import(
  "../src/ocean/rod-plan.ts"
);
const { PAL } = await import("../src/ocean/art/colors.ts");
const { projectCreature } = await import("../src/ocean/creature-thumb.ts");
const { paintCreature, rodThumb, baitThumb, showItemThumb, THUMB_RATIO } =
  await import("../src/app/item-thumb.ts");
const { boatPalettes } = await import("../src/ocean/palette.ts");

// The pictures of the market's rods and baits (src/ocean/rod-geometry.ts, src/app/item-thumb.ts):
// a rod drawn from its own plan, so the picture is the rod the boat holds.
const TRIM = boatPalettes[0].trim;

/** Every colour of the palette as a byte string, to check a vertex colour is a role of it. */
function paletteColours() {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === "number")
      out.add(`${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`);
    else if (v && typeof v === "object")
      for (const x of Object.values(v)) walk(x);
  };
  walk(PAL);
  return out;
}

test("every colour name of a plan is in the shared table and maps to a palette colour", () => {
  const used = new Set(
    ROD_PLANS.flatMap((p) => [
      ...p.rings.map((r) => r.colour),
      p.guideColour,
      ...(p.stud ? [p.stud.colour] : []),
      ...p.reel.map((x) => x.colour),
    ]),
  );
  for (const name of used)
    assert.ok(ROD_COLOUR_NAMES.includes(name), `${name} is listed`);
  assert.equal(
    new Set(ROD_COLOUR_NAMES).size,
    ROD_COLOUR_NAMES.length,
    "no name twice",
  );
  const allowed = paletteColours();
  for (const name of ROD_COLOUR_NAMES) {
    const value = rodColour(name, TRIM);
    assert.ok(Number.isInteger(value), name);
    assert.ok(
      allowed.has(
        `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`,
      ),
      `${name} is a palette colour`,
    );
  }
  assert.equal(
    rodColour("wrap", 0x123456),
    0x123456,
    "the thread wrap is the boat's own colour",
  );
  assert.notEqual(rodColour("culm", 1), 1, "everything else ignores it");
});

for (let tier = 0; tier < 4; tier++) {
  test(`rod ${tier}: a sound triangle soup in palette colours, long and slim with the reel below`, () => {
    const creature = rodCreature(tier, TRIM);
    const { positions, normals, indices, colors } = creature.main;
    const count = positions.length / 3;
    assert.equal(normals.length, positions.length);
    assert.equal(colors.length, count * 4);
    assert.ok(
      indices.length % 3 === 0 && indices.length / 3 > 300,
      `${indices.length / 3} triangles`,
    );
    for (const i of indices)
      assert.ok(Number.isInteger(i) && i >= 0 && i < count);
    const allowed = paletteColours();
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const key = [0, 1, 2]
        .map((k) => Math.round(colors[i * 4 + k] * 255))
        .join(",");
      seen.add(key);
      assert.ok(allowed.has(key), `${key} is not in the palette`);
    }
    assert.ok(seen.size >= 5, `${seen.size} colours`);
    // 4 m of rod leaned up 0.6 rad: about 3.3 m across and over 2 m high with the reel.
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], positions[i * 3 + k]);
        max[k] = Math.max(max[k], positions[i * 3 + k]);
      }
    assert.ok(
      max[0] - min[0] > 3 && max[0] - min[0] < 4.2,
      `width ${max[0] - min[0]}`,
    );
    assert.ok(
      max[1] - min[1] > 2 && max[1] - min[1] < 3.2,
      `height ${max[1] - min[1]}`,
    );
    assert.ok(
      Math.abs(
        creature.size -
          Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
      ) < 1e-9,
    );
    // it projects to a picture the painter can draw, with every triangle inside the box it reports
    const thumb = projectCreature(creature, -0.3, 0.12);
    assert.equal(thumb.triangles.length, indices.length / 3);
    assert.ok(thumb.maxX - thumb.minX > 0 && thumb.maxY - thumb.minY > 0);
  });
}

test("the rarer the rod the more triangles its picture has, and the wrap is the only colour the boat changes", () => {
  const sizes = [0, 1, 2, 3].map(
    (t) => rodCreature(t, TRIM).main.indices.length / 3,
  );
  for (let i = 1; i < 4; i++)
    assert.ok(sizes[i] >= sizes[i - 1] * 0.95, `${sizes}`);
  const a = rodCreature(0, 0xff0000).main.colors;
  const b = rodCreature(0, 0x0000ff).main.colors;
  let different = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different++;
  assert.ok(
    different > 0 && different < a.length * 0.15,
    `${different} of ${a.length} differ`,
  );
  for (const tier of [1, 2, 3])
    assert.deepEqual(
      rodCreature(tier, 0xff0000).main.colors,
      rodCreature(tier, 0x0000ff).main.colors,
      `rod ${tier} has no boat colour`,
    );
});

// ---------------------------------------------------------------------------------------------
// The painter and the holder (a canvas and a document stand in)
// ---------------------------------------------------------------------------------------------
function fakeDom() {
  const drawn = [];
  const document = {
    createElement(tag) {
      if (tag === "canvas")
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            beginPath() {},
            moveTo() {},
            lineTo() {},
            closePath() {},
            fill() {
              drawn.push("fill");
            },
            stroke() {},
          }),
          toDataURL: () => "data:image/png;base64,FAKE",
        };
      return { tag, alt: "", src: "", draggable: true, width: 0, height: 0 };
    },
  };
  globalThis.document = document;
  return { drawn, restore: () => delete globalThis.document };
}

test("a rod is painted once and kept; a bait has no picture before its model has loaded", () => {
  const dom = fakeDom();
  try {
    const url = rodThumb(1, 72);
    assert.equal(url, "data:image/png;base64,FAKE");
    const triangles = dom.drawn.length;
    assert.ok(triangles > 300, `${triangles} triangles painted`);
    assert.equal(rodThumb(1, 72), url);
    assert.equal(dom.drawn.length, triangles, "the second call paints nothing");
    assert.equal(baitThumb(2, 72), "", "no model loaded yet");
    assert.equal(
      paintCreature(rodCreature(0, TRIM), 60, -0.3, 0.12),
      "data:image/png;base64,FAKE",
    );
  } finally {
    dom.restore();
  }
});

test("showItemThumb puts a rod's picture in its holder at once and leaves the glyph when there is no canvas", () => {
  const dom = fakeDom();
  try {
    const holder = {
      children: ["glyph"],
      replaceChildren(...n) {
        this.children = n;
      },
    };
    showItemThumb(holder, "rod", 2, 72);
    assert.equal(holder.children.length, 1);
    const picture = holder.children[0];
    assert.equal(picture.src, "data:image/png;base64,FAKE");
    assert.equal(picture.alt, "");
    assert.equal(picture.width, 72);
    assert.equal(picture.height, Math.round(72 * THUMB_RATIO));
  } finally {
    dom.restore();
  }
  // no canvas at all: the glyph stays
  globalThis.document = {
    createElement: () => ({ getContext: () => null }),
  };
  try {
    const holder = {
      children: ["glyph"],
      replaceChildren(...n) {
        this.children = n;
      },
    };
    showItemThumb(holder, "rod", 3, 72 + 1);
    assert.deepEqual(holder.children, ["glyph"]);
  } finally {
    delete globalThis.document;
  }
});

test("a bait's picture is drawn from its model file once it is loaded", async (t) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const file = String(url).split("/").pop();
    const bytes = readFileSync(
      new URL(`../public/models/${file}`, import.meta.url),
    );
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  const dom = fakeDom();
  try {
    const holder = {
      children: ["glyph"],
      replaceChildren(...n) {
        this.children = n;
      },
    };
    showItemThumb(holder, "bait", 1, 72);
    assert.deepEqual(
      holder.children,
      ["glyph"],
      "the glyph stays until the file is there",
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(holder.children.length, 1);
    assert.equal(holder.children[0].src, "data:image/png;base64,FAKE");
    assert.ok(baitThumb(1, 72).startsWith("data:image/png"));
  } finally {
    dom.restore();
  }
});

test("a boat is drawn from its own file turned bow to +X, and its card picture loads like a bait's", async (t) => {
  const { boatCreature } = await import("../src/ocean/boat-picture.ts");
  const { parseMeshesGlb } = await import("../src/ocean/glb-parts.ts");
  const { boatThumb } = await import("../src/app/item-thumb.ts");
  const file = new URL("../public/models/boat-2.glb", import.meta.url);
  const parsed = parseMeshesGlb(readFileSync(file));
  const creature = boatCreature(parsed.main, parsed.size);
  // the file's bow is +Z: in the picture it is +X, and the keel stays down
  const xs = creature.main.positions.filter((_, i) => i % 3 === 0);
  const ys = creature.main.positions.filter((_, i) => i % 3 === 1);
  const zs = creature.main.positions.filter((_, i) => i % 3 === 2);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 8, "the boat is long along x");
  assert.ok(Math.max(...zs) - Math.min(...zs) < 4.5, "and not along z");
  assert.ok(
    Math.abs(Math.max(...xs) - parsed.max[2]) < 1e-9,
    "the bow (+Z) is now +X",
  );
  assert.deepEqual(
    [Math.min(...ys), Math.max(...ys)],
    [parsed.min[1], parsed.max[1]],
  );
  assert.equal(creature.main.indices.length, parsed.main.indices.length);

  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url).split("/").pop());
    const bytes = readFileSync(file);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  const dom = fakeDom();
  try {
    assert.equal(boatThumb(1, 72), "", "no picture before the model is there");
    const holder = {
      children: ["glyph"],
      replaceChildren(...n) {
        this.children = n;
      },
    };
    showItemThumb(holder, "boat", 1, 72);
    assert.deepEqual(
      holder.children,
      ["glyph"],
      "the glyph stays until the file is there",
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(asked, ["boat-2.glb"], "tier 1 is boat-2.glb");
    assert.equal(holder.children[0].src, "data:image/png;base64,FAKE");
    assert.ok(dom.drawn.length > 3000, `${dom.drawn.length} triangles painted`);
  } finally {
    dom.restore();
  }
});
