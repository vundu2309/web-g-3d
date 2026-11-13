import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Vendor } from "./market.ts";
import { createNpc } from "./npc-visual.ts";
import { NPC_LOOKS, wavePose } from "./npc-look.ts";

/**
 * The person behind a fish stall: one of the sea's people (npc-look.ts), placed on the pier deck
 * in front of the counter, facing the sea. They breathe slowly and wave now and then.
 */
const DECK = 0.8;
/**
 * Where the vendor stands: out in front of the counter at its right-hand end, on the open deck
 * facing the sea, so the player sees them from the boat (behind the counter the ice boxes and
 * hanging fish hide all but the head).
 */
const SPOT = { x: 1.75, y: DECK, z: -0.75 } as const;

/**
 * Puts the vendor on the pier (a child of `parent`, the market's mesh) and animates them: a slow
 * breath and, about two seconds out of every eight, a wave. The phase differs per market so they
 * are not in step. They are decoration only: no gameplay effect, no server state.
 */
export function createVendor(
  scene: Scene,
  parent: Mesh,
  vendor: Vendor,
  phase: number,
): void {
  const npc = createNpc(scene, NPC_LOOKS[vendor.look]);
  npc.root.parent = parent;
  npc.root.position.set(SPOT.x, SPOT.y, SPOT.z);
  // The figure faces +Z, which is the counter; half a turn makes the vendor face the sea and the
  // player's boat.
  npc.root.rotation.y = Math.PI;
  const observer: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    npc.setPose(wavePose(performance.now() / 1000 + phase));
  });
  parent.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(observer);
    npc.dispose();
  });
}
