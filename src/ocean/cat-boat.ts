import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { createCatParts, ROWBOAT, type CatParts } from "./cat-model.ts";

/** Seconds for one full stroke. */
export const STROKE = 2.4;

/**
 * The pose of a rowing stroke at `phase` (turns, 0 to 1): how far the oars sweep (radians, positive
 * toward the bow), how far the blades dip (radians about the oar, 0 in the air), and how far the
 * cats lean (radians, forward positive). Pure, so a test reads it. The drive (blade in the water)
 * sweeps from bow to stern, the recovery brings the blade back over the water.
 */
export function stroke(phase: number) {
  const a = (phase - Math.floor(phase)) * Math.PI * 2;
  return {
    sweep: 0.5 * Math.cos(a),
    dip: Math.max(0, Math.sin(a)) * 0.45,
    lean: -0.18 * Math.cos(a),
  };
}

/**
 * One rowing boat with two cats, one on each oar: a demo of the model (`?cats=1`), still to be
 * given a route. The cats face the stern, as rowers do; the oars follow the stroke.
 */
export class CatBoat {
  private readonly root: TransformNode;
  private readonly parts: CatParts;
  private readonly cats: TransformNode[] = [];
  private readonly locks: { node: TransformNode; side: 1 | -1 }[] = [];

  private readonly at: { x: number; z: number };
  private readonly yaw: number;

  constructor(scene: Scene, at: { x: number; z: number }, yaw = 0) {
    this.at = at;
    this.yaw = yaw;
    this.parts = createCatParts(scene);
    this.root = new TransformNode("cat-boat", scene);
    this.parts.boat.createInstance("cat-boat-hull").parent = this.root;
    ([1, -1] as const).forEach((side, i) => {
      const cat = new TransformNode(`cat-boat-cat-${i}`, scene);
      cat.parent = this.root;
      cat.position.set(side * ROWBOAT.seatX, ROWBOAT.seat, ROWBOAT.seatZ);
      // The cat's front is +Z; rowers face the stern.
      cat.rotation.y = Math.PI;
      this.parts.cats[i]!.createInstance(`cat-boat-cat-body-${i}`).parent = cat;
      this.cats.push(cat);
      const lock = new TransformNode(`cat-boat-lock-${i}`, scene);
      lock.parent = this.root;
      lock.position.set(
        side * ROWBOAT.lockX,
        ROWBOAT.lockY,
        ROWBOAT.seatZ - 0.12,
      );
      const oars =
        side === 1 ? this.parts.oars.starboard : this.parts.oars.port;
      oars[i]!.createInstance(`cat-boat-oar-${i}`).parent = lock;
      this.locks.push({ node: lock, side });
    });
  }

  /** Each frame: `height(x, z)` is the sea's height there (m). */
  update(time: number, height: (x: number, z: number) => number) {
    const { x, z } = this.at;
    const bob = height(x, z);
    const fore = height(
      x + Math.sin(this.yaw) * 1.5,
      z + Math.cos(this.yaw) * 1.5,
    );
    const aft = height(
      x - Math.sin(this.yaw) * 1.5,
      z - Math.cos(this.yaw) * 1.5,
    );
    this.root.position.set(x, bob + 0.05, z);
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = Math.atan2(aft - fore, 3);
    this.root.rotation.z = 0.04 * Math.sin(time * 0.8);
    const pose = stroke(time / STROKE);
    this.cats.forEach((cat) => (cat.rotation.x = pose.lean));
    for (const { node, side } of this.locks) {
      // Port and starboard sweep the same way along the boat: mirrored about the boat's axis.
      node.rotation.y = -side * pose.sweep;
      node.rotation.x = pose.dip * side * -1;
    }
  }

  dispose() {
    this.root.dispose();
    for (const mesh of [
      ...this.parts.cats,
      ...this.parts.oars.starboard,
      ...this.parts.oars.port,
      this.parts.boat,
    ])
      mesh.dispose();
  }
}
