import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import type { CatModels } from "./cats.ts";
import { CAT_SCALE, catPose } from "./cat-pose.ts";
import type { Market } from "./market.ts";

/**
 * The cat behind each fish stall (cat-pose.ts names them, cats.ts loads them): placed on the pier
 * deck in front of the counter, facing the sea. They breathe, nod, sway their tails and wave now
 * and then, all from the sea clock, so the same time always gives the same pose.
 */
const DECK = 0.8;
/**
 * Where the vendor stands: out in front of the counter at its right-hand end, on the open deck
 * facing the sea, so the player sees them from the boat (behind the counter the ice boxes and
 * hanging fish hide all but the head).
 */
const SPOT = { x: 1.75, y: DECK, z: -0.75 } as const;

/**
 * Puts each market's cat on its pier (a child of the market's mesh) and animates it from `time`
 * (the sea clock, in seconds). The phase differs per market so they are not in step. Decoration
 * only: no gameplay effect, no server state. Does nothing for a market already given its cat.
 */
export function placeVendors(
  scene: Scene,
  markets: readonly { market: Market; mesh: Mesh }[],
  cats: CatModels,
  time: () => number,
): void {
  for (const { market, mesh } of markets) {
    const model = cats[market.vendor.look];
    if (model.root.parent) continue;
    const { root, parts } = model;
    root.setEnabled(true);
    root.parent = mesh;
    root.position.set(SPOT.x, SPOT.y, SPOT.z);
    // The model faces +Z, which is the counter; half a turn makes the vendor face the sea and the
    // player's boat.
    root.rotation.y = Math.PI;
    root.scaling.setAll(CAT_SCALE);
    const phase = market.x * 0.37;
    const rest = (name: keyof typeof parts) => parts[name].position.y;
    const y = {
      head: rest("head"),
      armLeft: rest("arm-left"),
      armRight: rest("arm-right"),
      tail: rest("tail"),
    };
    const observer: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
      const pose = catPose(market.vendor.look, time(), phase);
      parts.body.scaling.y = pose.bodyScaleY;
      parts.head.position.y = y.head + pose.lift;
      parts.head.rotation.set(pose.head.x, 0, pose.head.z);
      parts["arm-left"].position.y = y.armLeft + pose.lift;
      parts["arm-left"].rotation.set(pose.armLeft.x, 0, pose.armLeft.z);
      parts["arm-right"].position.y = y.armRight + pose.lift;
      parts["arm-right"].rotation.set(pose.armRight.x, 0, pose.armRight.z);
      parts.tail.position.y = y.tail + pose.lift;
      parts.tail.rotation.set(0, pose.tail.y, pose.tail.z);
    });
    mesh.onDisposeObservable.addOnce(() => {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
    });
  }
}
