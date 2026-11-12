import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { useSolid } from "./art/materials.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import type { Market } from "./market.ts";

/**
 * One fish market: a floating wooden pier on pylons with a striped awning over a counter
 * of fish crates, a blue sign with a gold coin, a flag and lanterns, a gangway toward the
 * island, built from coloured primitives into ONE mesh (see art/shapes.ts). Local axes:
 * the pier faces -Z (out to sea) like a boat's bow; the mesh is turned to `market.facing`.
 */
export function createMarket(scene: Scene, market: Market): Mesh {
  const parts = new Parts(scene);
  const DECK = 0.75;
  const wood = PAL.wood;
  // Pylons down into the water, with a lantern on the two seaward ones.
  for (const x of [-2.5, 2.5])
    for (const z of [-1.9, 1.9]) {
      parts.tube({ top: 0.34, bottom: 0.4, height: 2.6 }, wood.dark, [
        x,
        -0.5,
        z,
      ]);
    }
  for (const x of [-2.5, 2.5]) {
    parts.tube(
      { top: 0.1, bottom: 0.1, height: 0.7, sides: SIDES.thin },
      PAL.metal.steel,
      [x, DECK + 0.45, -1.9],
    );
    parts.sphere(0.3, PAL.light.lamp, [x, DECK + 0.9, -1.9]);
  }
  // The deck: planks with a darker line between, and a rail along the sea edge.
  parts.box([6.6, 0.18, 4.8], wood.light, [0, DECK, 0]);
  for (const x of [-2.2, -1.1, 0, 1.1, 2.2])
    parts.box([0.05, 0.2, 4.8], wood.dark, [x, DECK + 0.01, 0]);
  parts.box([6.6, 0.12, 0.14], wood.trim, [0, DECK + 0.62, -2.35]);
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2])
    parts.box([0.12, 0.62, 0.12], wood.trim, [x, DECK + 0.33, -2.35]);
  // The gangway to the island.
  parts.box([1.7, 0.14, 8], wood.mid, [0, DECK - 0.04, 6.4]);
  for (const x of [-0.85, 0.85])
    parts.box([0.1, 0.5, 8], wood.trim, [x, DECK + 0.25, 6.4]);
  // The stall: a counter at the back, two posts and a striped awning sloping toward the sea.
  parts.box([4.6, 0.95, 1.1], wood.mid, [0, DECK + 0.55, 1.2]);
  parts.box([4.8, 0.1, 1.3], wood.trim, [0, DECK + 1.07, 1.2]);
  for (const x of [-2.3, 2.3])
    parts.box([0.18, 2.5, 0.18], PAL.market.post, [x, DECK + 1.3, -0.35]);
  const stripes = [PAL.paint.red, PAL.paint.cream];
  for (let i = 0; i < 6; i++)
    parts.box(
      [0.8, 0.1, 2.9],
      stripes[i % 2]!,
      [-2.0 + i * 0.8, DECK + 2.72, 0.05],
      [0.32, 0, 0],
    );
  // The sign above the awning: a blue board with a gold coin.
  parts.box([3.4, 0.75, 0.12], PAL.market.board, [0, DECK + 3.5, 0.8]);
  parts.tube(
    { top: 0.58, bottom: 0.58, height: 0.1, sides: SIDES.round },
    PAL.market.coin,
    [0, DECK + 3.5, 0.72],
    [Math.PI / 2, 0, 0],
  );
  for (const x of [-1.5, 1.5])
    parts.box([0.12, 1.1, 0.12], PAL.market.post, [x, DECK + 3.1, 0.8]);
  // Crates of fish on the counter, and a barrel on the deck.
  for (const [x, y] of [
    [-1.4, 0],
    [0, 0],
    [1.4, 0],
  ] as const) {
    parts.box([1, 0.34, 0.7], PAL.paint.crate, [x, DECK + 1.28, 1.2 + y]);
    for (const dx of [-0.25, 0.1, 0.4])
      parts.sphere(
        0.36,
        PAL.market.silver,
        [x + dx, DECK + 1.52, 1.2],
        [0, 0, 0],
        [1.5, 0.55, 0.7],
      );
  }
  parts.tube(
    { top: 0.55, bottom: 0.55, height: 0.7, sides: SIDES.round },
    PAL.fit.barrel,
    [-2.5, DECK + 0.45, -1.1],
  );
  // A flag on a tall pole at the island-side corner.
  parts.tube(
    { top: 0.08, bottom: 0.12, height: 4.6, sides: SIDES.thin },
    wood.deep,
    [2.8, DECK + 2.3, 2.1],
  );
  parts.box([0.9, 0.5, 0.04], PAL.paint.coral, [3.25, DECK + 4.2, 2.1]);
  const mesh = useSolid(parts.merge(`market-${market.id}`), "satin");
  mesh.position.set(market.x, 0, market.z);
  mesh.rotation.y = -market.facing;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}
