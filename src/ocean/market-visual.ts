import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { glowMaterial, useSolid } from "./art/materials.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import { GANGWAY_REACH, type Market } from "./market.ts";
import { createVendor } from "./market-vendor.ts";

/**
 * One fish market: a floating wooden pier on rope-wrapped pylons with a stall under a
 * scalloped striped awning, a sign painted with the market's name, ice boxes of fish, fish
 * drying on a pole, nets, barrels, a life ring, lanterns and a rowboat moored alongside, built
 * from coloured primitives into ONE mesh (see art/shapes.ts) plus one flat sign. Local axes:
 * the pier faces -Z (out to sea) like a boat's bow; the mesh is turned to `market.facing`.
 */
const DECK = 0.8;

/** A little fish lying along X: a plump body and a tail (silver, blue or orange). */
function fish(
  parts: Parts,
  x: number,
  y: number,
  z: number,
  color: number,
  size = 1,
) {
  parts.sphere(
    0.5 * size,
    color,
    [x, y, z],
    [0, 0, 0],
    [1.5, 0.55, 0.62],
    SIDES.small,
  );
  parts.tube(
    { top: 0, bottom: 0.3 * size, height: 0.28 * size, sides: 3 },
    color,
    [x - 0.36 * size, y, z],
    [0, 0, Math.PI / 2],
  );
}

function pier(parts: Parts) {
  const wood = PAL.wood;
  // Pylons with a rope wrapped round the top and a cap, one at each corner and the middle.
  for (const x of [-3.2, 0, 3.2])
    for (const z of [-2.2, 2.2]) {
      parts.tube({ top: 0.38, bottom: 0.46, height: 2.8 }, wood.dark, [
        x,
        -0.5,
        z,
      ]);
      parts.tube(
        { top: 0.5, bottom: 0.5, height: 0.1, sides: SIDES.round },
        wood.trim,
        [x, DECK - 0.02, z],
      );
      parts.torus(
        0.5,
        0.09,
        PAL.fit.rope,
        [x, DECK - 0.3, z],
        undefined,
        SIDES.small,
      );
    }
  // The deck: alternating light and dark planks, bound by a beam all round.
  const planks = PAL.wood.deck;
  for (let i = 0; i < 12; i++)
    parts.box([0.62, 0.16, 5.2], planks[i % 2]!, [-3.4 + i * 0.62, DECK, 0]);
  for (const z of [-2.62, 2.62])
    parts.box([7.6, 0.2, 0.18], wood.trim, [0, DECK + 0.02, z]);
  for (const x of [-3.8, 3.8])
    parts.box([0.18, 0.2, 5.4], wood.trim, [x, DECK + 0.02, 0]);
  // The gangway to the island, with a rail of posts and rope; it ends GANGWAY_REACH from the
  // pier's centre, on the sand (market.ts places the pier so).
  parts.box([1.8, 0.14, 8.4], wood.mid, [0, DECK - 0.04, GANGWAY_REACH - 4.2]);
  for (let i = 0; i < 9; i++)
    parts.box([1.8, 0.04, 0.05], wood.dark, [0, DECK + 0.04, 3.2 + i]);
  for (const x of [-0.9, 0.9])
    for (let i = 0; i < 5; i++)
      parts.box([0.1, 0.6, 0.1], wood.trim, [x, DECK + 0.32, 3.4 + i * 2]);
  for (const x of [-0.9, 0.9])
    parts.box([0.05, 0.05, 8.2], PAL.fit.rope, [
      x,
      DECK + 0.58,
      GANGWAY_REACH - 4.2,
    ]);
  // Sea-side rail: posts and two rails, with a gap for the boats' side.
  for (const x of [-3.7, -2.4, -1.2, 0, 1.2, 2.4, 3.7])
    parts.box([0.13, 0.7, 0.13], wood.trim, [x, DECK + 0.42, -2.6]);
  for (const y of [0.55, 0.85])
    parts.box([7.6, 0.07, 0.09], wood.trim, [0, DECK + y, -2.6]);
}

function stall(parts: Parts) {
  const wood = PAL.wood;
  const F = PAL.fit;
  // Back wall of planks with a painted fish, shelves and two end posts.
  parts.box([6.6, 2.6, 0.2], wood.mid, [0, DECK + 1.4, 2.3]);
  for (let i = 0; i < 6; i++)
    parts.box([0.04, 2.6, 0.22], wood.dark, [-2.75 + i * 1.1, DECK + 1.4, 2.3]);
  // A blue fish painted on a cream panel.
  parts.box([3.2, 1.3, 0.06], PAL.paint.cream, [0, DECK + 1.75, 2.17]);
  parts.sphere(
    1.4,
    PAL.market.board,
    [0.1, DECK + 1.75, 2.12],
    [0, 0, 0],
    [1.3, 0.62, 0.05],
    SIDES.round,
  );
  parts.tube(
    { top: 0, bottom: 0.7, height: 0.55, sides: 3 },
    PAL.market.board,
    [-1.1, DECK + 1.75, 2.12],
    [0, 0, Math.PI / 2],
  );
  parts.sphere(
    0.16,
    PAL.paint.cream,
    [0.75, DECK + 1.85, 2.08],
    undefined,
    [1, 1, 0.5],
  );
  for (const x of [-3.3, 3.3])
    parts.box([0.22, 4.0, 0.22], PAL.market.post, [x, DECK + 2.05, 2.3]);
  for (const x of [-3.3, 3.3])
    parts.box([0.22, 3.6, 0.22], PAL.market.post, [x, DECK + 1.85, -0.55]);
  // The counter: a planked front, a top that overhangs, and a lower shelf.
  parts.box([6.4, 1.0, 1.3], wood.light, [0, DECK + 0.6, 0.75]);
  for (let i = 0; i < 8; i++)
    parts.box([0.03, 1.0, 1.32], wood.dark, [-2.8 + i * 0.8, DECK + 0.6, 0.75]);
  parts.box([6.7, 0.12, 1.6], wood.trim, [0, DECK + 1.16, 0.75]);
  // Two posts that carry the sign above the awning.
  for (const x of [-2.2, 2.2])
    parts.box([0.14, 1.5, 0.14], PAL.market.post, [x, DECK + 4.15, 1.2]);
  // The awning: a striped roof sloping to the sea with a scalloped fringe.
  const stripe = [PAL.paint.coral, PAL.paint.cream];
  for (let i = 0; i < 9; i++)
    parts.box(
      [0.78, 0.1, 3.6],
      stripe[i % 2]!,
      [-3.1 + i * 0.78, DECK + 3.6, 0.85],
      [-0.3, 0, 0],
    );
  for (let i = 0; i < 17; i++)
    parts.box(
      [0.4, 0.4, 0.06],
      stripe[i % 2]!,
      [-3.2 + i * 0.4, DECK + 3.15, -0.98],
      [0, 0, Math.PI / 4],
    );
  // Fish drying on a pole under the awning, and a hanging lantern.
  parts.box([6.0, 0.07, 0.07], F.rope, [0, DECK + 2.5, -0.1]);
  for (let i = 0; i < 7; i++) {
    const c = [PAL.market.silver, PAL.paint.coral, PAL.market.silver, F.barrel][
      i % 4
    ]!;
    parts.tube(
      { top: 0.02, bottom: 0.02, height: 0.3, sides: SIDES.thin },
      F.rope,
      [-2.4 + i * 0.8, DECK + 2.34, -0.1],
    );
    parts.sphere(
      0.5,
      c,
      [-2.4 + i * 0.8, DECK + 1.95, -0.1],
      [0, 0, Math.PI / 2],
      [1.5, 0.55, 0.62],
      SIDES.small,
    );
  }
  // Ice boxes of fish on the counter, a scale and a basket.
  for (const [x, a, b] of [
    [-2.1, PAL.market.silver, PAL.paint.coral],
    [-0.5, F.barrel, PAL.market.silver],
    [1.1, PAL.paint.coral, PAL.market.silver],
  ] as const) {
    parts.box([1.3, 0.42, 0.9], PAL.paint.cream, [x, DECK + 1.43, 0.75]);
    parts.box([1.34, 0.08, 0.94], F.glass, [x, DECK + 1.66, 0.75]);
    fish(parts, x - 0.25, DECK + 1.78, 0.62, a);
    fish(parts, x + 0.25, DECK + 1.8, 0.88, b);
  }
  parts.tube(
    { top: 0.7, bottom: 0.5, height: 0.38, sides: SIDES.round },
    wood.mid,
    [2.65, DECK + 1.4, 0.75],
  );
  fish(parts, 2.65, DECK + 1.66, 0.75, PAL.paint.coral, 0.8);
  parts.tube(
    { top: 0.06, bottom: 0.1, height: 0.5, sides: SIDES.thin },
    PAL.metal.steel,
    [-3.0, DECK + 1.45, 0.75],
  );
  parts.box([0.8, 0.05, 0.4], PAL.metal.steel, [-3.0, DECK + 1.72, 0.75]);
}

function props(parts: Parts) {
  const wood = PAL.wood;
  const F = PAL.fit;
  // Barrels and stacked crates at the left, a life ring on the sea rail, lanterns on posts.
  for (const [x, z] of [
    [-3.0, -1.6],
    [-2.2, -1.9],
  ] as const) {
    parts.tube(
      { top: 0.55, bottom: 0.55, height: 0.75, sides: SIDES.round },
      F.barrel,
      [x, DECK + 0.5, z],
    );
    parts.tube(
      { top: 0.57, bottom: 0.57, height: 0.07, sides: SIDES.round },
      PAL.paint.cream,
      [x, DECK + 0.55, z],
    );
  }
  parts.box([0.9, 0.4, 0.7], PAL.paint.crate, [2.7, DECK + 0.28, -1.7]);
  parts.box([0.9, 0.4, 0.7], PAL.paint.crate, [2.7, DECK + 0.68, -1.7]);
  parts.box([0.94, 0.06, 0.74], PAL.paint.crateLid, [2.7, DECK + 0.9, -1.7]);
  parts.torus(
    0.7,
    0.18,
    PAL.paint.red,
    [1.6, DECK + 0.78, -2.64],
    [Math.PI / 2, 0, 0],
  );
  parts.torus(
    0.7,
    0.07,
    PAL.paint.cream,
    [1.6, DECK + 0.78, -2.64],
    [Math.PI / 2, 0, 0],
  );
  for (const x of [-3.7, 3.7]) {
    parts.tube(
      { top: 0.08, bottom: 0.1, height: 1.7, sides: SIDES.thin },
      PAL.metal.steel,
      [x, DECK + 1.0, -2.6],
    );
    parts.sphere(
      0.4,
      PAL.light.lamp,
      [x, DECK + 1.95, -2.6],
      undefined,
      undefined,
      SIDES.round,
    );
    parts.tube(
      { top: 0, bottom: 0.5, height: 0.3, sides: SIDES.small },
      PAL.paint.red,
      [x, DECK + 2.3, -2.6],
    );
  }
  // A net draped over the right-hand rail with its floats, and a coil of rope.
  parts.sphere(
    1,
    PAL.paint.net,
    [3.72, DECK + 0.62, 0.5],
    undefined,
    [0.1, 0.45, 0.9],
    SIDES.small,
  );
  for (let i = 0; i < 4; i++)
    parts.sphere(
      0.22,
      PAL.paint.red,
      [3.8, DECK + 1.0, -0.2 + i * 0.5],
      undefined,
      undefined,
      SIDES.thin,
    );
  parts.torus(
    0.6,
    0.12,
    F.rope,
    [-3.3, DECK + 0.14, 1.3],
    undefined,
    SIDES.small,
  );
  // A flag on a tall pole at the island-side corner.
  parts.tube(
    { top: 0.08, bottom: 0.14, height: 5.6, sides: SIDES.thin },
    wood.deep,
    [3.6, DECK + 2.8, 2.6],
  );
  parts.box([1.2, 0.7, 0.05], PAL.paint.coral, [4.25, DECK + 5.1, 2.6]);
  parts.tube(
    { top: 0, bottom: 0.7, height: 0.5, sides: 3 },
    PAL.paint.cream,
    [4.95, DECK + 5.1, 2.6],
    [0, 0, -Math.PI / 2],
  );
  // A rowboat moored alongside, with its oars.
  parts.sphere(
    1,
    PAL.hut.rowboat,
    [5.4, 0.15, 0.2],
    undefined,
    [0.95, 0.5, 2.2],
    SIDES.round,
  );
  parts.sphere(
    1,
    PAL.paint.cream,
    [5.4, 0.36, 0.2],
    undefined,
    [0.82, 0.12, 2.04],
    SIDES.round,
  );
  for (const z of [-0.4, 0.8])
    parts.box([0.05, 0.05, 1.1], wood.mid, [5.4, 0.42, z], [0, 0.6, 0]);
}

/** The painted sign: the market's name on a blue board with a gold coin and a white fish. */
function signTexture(scene: Scene, name: string) {
  const texture = new DynamicTexture(
    `sign-${name}`,
    { width: 1024, height: 256 },
    scene,
    true,
  );
  const c = texture.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#1f4f8f";
  c.fillRect(0, 0, 1024, 256);
  c.strokeStyle = "#ffd35a";
  c.lineWidth = 14;
  c.strokeRect(10, 10, 1004, 236);
  // The coin.
  c.fillStyle = "#ffd35a";
  c.beginPath();
  c.arc(128, 128, 78, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#153b80";
  c.lineWidth = 10;
  c.stroke();
  c.fillStyle = "#153b80";
  c.beginPath();
  c.ellipse(120, 128, 38, 22, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(152, 128);
  c.lineTo(182, 104);
  c.lineTo(182, 152);
  c.closePath();
  c.fill();
  // The name.
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = '800 92px "Baloo 2", sans-serif';
  c.fillText(name.toUpperCase(), 600, 136);
  texture.update();
  return texture;
}

export function createMarket(scene: Scene, market: Market): Mesh {
  const parts = new Parts(scene);
  pier(parts);
  stall(parts);
  props(parts);
  const mesh = useSolid(parts.merge(`market-${market.id}`), "satin");
  // The sign: a flat board over the awning, readable from the sea.
  const sign = MeshBuilder.CreatePlane(
    `market-sign-${market.id}`,
    { width: 4.8, height: 1.2 },
    scene,
  );
  sign.material = glowMaterial(scene, `market-sign-${market.id}-material`, {
    texture: signTexture(scene, market.name),
    textureAlpha: false,
  });
  sign.parent = mesh;
  sign.position.set(0, DECK + 4.75, 1.2);
  sign.rotation.y = Math.PI;
  sign.isPickable = false;
  mesh.position.set(market.x, 0, market.z);
  mesh.rotation.y = -market.facing;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  // The vendor is a child of the (frozen) pier, so it follows it but is free to animate.
  createVendor(scene, mesh, market.vendor, market.x * 0.37);
  return mesh;
}
