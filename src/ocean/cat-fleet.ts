import type { Scene } from "@babylonjs/core/scene";
import {
  CatBoat,
  createRowerKit,
  type RowerAssets,
  type RowerKit,
} from "./cat-boat.ts";
import {
  boatPose,
  makePlans,
  type CatBoatPlan,
  type CatBoatPose,
} from "./cat-routes.ts";

/**
 * The NPC rowing cats of the sea: the boats of cat-routes.ts, placed by the shared clock. Only the
 * few boats near the camera are drawn (the others are switched off: a boat costs about twenty draw
 * calls), the rest are only points for the minimap.
 */
export interface FleetOptions {
  /** Boats farther than this (m) from the camera are not drawn. */
  range: number;
  /** At most this many boats are drawn at once (the nearest). */
  limit: number;
}

export class CatFleet {
  private readonly kit: RowerKit;
  private readonly plans: CatBoatPlan[];
  private readonly boats = new Map<number, CatBoat>();
  private readonly scene: Scene;
  private readonly options: FleetOptions;
  private poses: CatBoatPose[] = [];
  private drawn: CatBoatPose[] = [];

  constructor(scene: Scene, assets: RowerAssets, options: FleetOptions) {
    this.scene = scene;
    this.options = options;
    this.kit = createRowerKit(scene, assets);
    this.plans = makePlans();
  }

  /** Where every boat is now (for the minimap). */
  all(): readonly CatBoatPose[] {
    return this.poses;
  }

  /** The boats that are drawn now (they push on the water). */
  near(): readonly CatBoatPose[] {
    return this.drawn;
  }

  /**
   * Each frame. `shared` is the shared clock in seconds (every player's boats are where it says),
   * `time` the sea's own clock (the stroke and the waves), `height` the sea's height.
   */
  update(
    shared: number,
    time: number,
    camera: { x: number; z: number },
    height: (x: number, z: number) => number,
  ) {
    this.kit.update();
    this.poses = this.plans.map((plan) => boatPose(plan, shared));
    const { range, limit } = this.options;
    const order = this.poses
      .map((pose, index) => ({
        index,
        d: Math.hypot(pose.x - camera.x, pose.z - camera.z),
      }))
      .filter((item) => item.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit);
    const show = new Set(order.map((item) => item.index));
    this.drawn = [];
    this.plans.forEach((_, index) => {
      const boat = this.boats.get(index);
      if (!show.has(index)) {
        boat?.setEnabled(false);
        return;
      }
      const pose = this.poses[index]!;
      const made =
        boat ??
        (this.boats.set(
          index,
          new CatBoat(this.scene, this.kit, `cat-boat-${index}`),
        ),
        this.boats.get(index)!);
      made.setEnabled(true);
      made.update(pose, time, height);
      this.drawn.push(pose);
    });
  }

  dispose() {
    for (const boat of this.boats.values()) boat.dispose();
    this.boats.clear();
    this.kit.dispose();
  }
}
