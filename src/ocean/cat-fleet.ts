import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import {
  CatBoat,
  createRowerKit,
  type RowerAssets,
  type RowerKit,
} from "./cat-boat.ts";
import { createLampCast, type LampCast } from "./cat-lantern.ts";
import { beaconLevel } from "./atmosphere.ts";
import { SEA } from "./sea-atmosphere.ts";
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
  private readonly cast: LampCast;
  private readonly lamp = new Vector3();
  private poses: CatBoatPose[] = [];
  private drawn: CatBoatPose[] = [];

  constructor(scene: Scene, assets: RowerAssets, options: FleetOptions) {
    this.scene = scene;
    this.options = options;
    this.kit = createRowerKit(scene, assets);
    this.plans = makePlans();
    this.cast = createLampCast(scene, this.kit.lit);
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
    let nearest: CatBoat | undefined;
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
      if (index === order[0]?.index) nearest = made;
    });
    // The lantern of the nearest boat lights that boat (its cats, oars and hull) at night.
    if (nearest) {
      nearest.lampPosition(this.lamp);
      this.cast.place(
        this.lamp,
        beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z),
      );
    } else this.cast.place(this.lamp, 0);
  }

  dispose() {
    for (const boat of this.boats.values()) boat.dispose();
    this.boats.clear();
    this.cast.dispose();
    this.kit.dispose();
  }
}
