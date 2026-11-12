import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import type { Vendor } from "./market.ts";
import { loadModel } from "./model-loader.ts";

/**
 * The person behind a fish stall: one of the people built in Blender (tools/blender/people.py,
 * public/models/people-*.glb), placed on the pier deck in front of the counter, facing the sea.
 * They breathe slowly and wave their right arm now and then (the model's `arm_wave` pivot).
 */
const DECK = 0.8;
/**
 * Where the vendor stands: out in front of the counter at its right-hand end, on the open deck
 * facing the sea, so the player sees them from the boat (behind the counter the ice boxes and
 * hanging fish hide all but the head).
 */
const SPOT = { x: 1.9, y: DECK, z: -0.75 } as const;
/** The people stand 1.6-1.8 m; this makes them about as tall as the stall's posts suggest. */
const MODEL_SCALE = 1.2;

/**
 * Loads the vendor's model into `parent` (the market's mesh) and animates it: a slow breath and,
 * about two seconds out of every eight, a wave. The phase differs per market so they are not in
 * step. If the file fails to load the stall simply has no vendor (they are decoration only).
 */
export function createVendor(
  scene: Scene,
  parent: Mesh,
  vendor: Vendor,
  phase: number,
): void {
  loadModel(scene, vendor.model)
    .then((model) => {
      if (scene.isDisposed) return;
      const { root } = model;
      root.parent = parent;
      root.position.set(SPOT.x, SPOT.y, SPOT.z);
      // The sea scene is right-handed, so the loaded model faces +Z: the counter. Half a turn
      // makes the vendor face the sea and the player's boat (checked in the game).
      root.rotationQuaternion = Quaternion.RotationAxis(Axis.Y, Math.PI);
      // A little larger than life, so the face and the wave read from the boat.
      root.scaling.scaleInPlace(MODEL_SCALE);
      const pivot = model.node("arm_wave");
      const rest = pivot?.rotationQuaternion?.clone() ?? Quaternion.Identity();
      scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() / 1000 + phase;
        root.position.y = SPOT.y + Math.sin(t * 1.6) * 0.01;
        if (!pivot) return;
        const cycle = t % 8;
        const raised = cycle < 2.2 ? Math.sin((cycle / 2.2) * Math.PI) : 0;
        // In the model's (glTF) frame the arm hangs along -Y and the person faces +Z: turning
        // about -Z lifts the right arm out to the side and up, the small turn about -X brings
        // the hand a little forward, and the fast swing about Z is the wave itself.
        const lift = raised * (2.45 + Math.sin(t * 9) * 0.3);
        const wave = Quaternion.RotationAxis(Axis.Z, -lift).multiply(
          Quaternion.RotationAxis(Axis.X, -raised * 0.35),
        );
        pivot.rotationQuaternion = wave.multiply(rest);
      });
    })
    .catch(() => {
      // No model, no vendor: the market works the same without one.
    });
}
