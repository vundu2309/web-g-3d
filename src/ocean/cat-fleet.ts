import { DitheredTileFadeMaterialPlugin } from "@babylonjs/core/Materials/ditheredTileFadeMaterialPlugin";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import {
  CatBoat,
  createRowerKit,
  type RowerAssets,
  type RowerKit,
} from "./cat-boat.ts";
import { createLampCast, type LampCast } from "./cat-lantern.ts";
import { FADE_IN, FADE_OUT, approach, fadeAmount } from "./distance-fade.ts";
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
 * calls), the rest are only points for the minimap. A boat comes into view and leaves it by
 * dithered fade (distance-fade.ts), never in one frame: a distance taper over the last `band`
 * metres of the range, and a time fade when the set of drawn boats changes.
 */
export interface FleetOptions {
  /** Boats farther than this (m) from the camera are not drawn. */
  range: number;
  /** At most this many boats are drawn at once (the nearest). */
  limit: number;
  /** The boat thins out over the last this many metres of the range. */
  band: number;
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
  /** How whole each boat is drawn by the time fade (1 whole, 0 not at all). */
  private readonly amounts: number[];
  /** How whole each boat was drawn in the last frame (0: not drawn). */
  private readonly drawnAmounts: number[];
  private last: number | undefined;
  private primed = false;

  constructor(scene: Scene, assets: RowerAssets, options: FleetOptions) {
    this.scene = scene;
    this.options = options;
    this.kit = createRowerKit(scene, assets);
    this.plans = makePlans();
    this.amounts = this.plans.map(() => 0);
    this.drawnAmounts = this.plans.map(() => 0);
    // The fade plugin goes on the boats' materials now, not when the first boat is drawn: adding it
    // recompiles the material's shader, which should not happen in a frame the player sees.
    for (const mesh of this.kit.lit)
      if (mesh.material)
        try {
          DitheredTileFadeMaterialPlugin.GetOrCreate(
            mesh.material as Parameters<
              typeof DitheredTileFadeMaterialPlugin.GetOrCreate
            >[0],
          );
        } catch {
          /* a material the plugin cannot take (a shader of its own): that part is not faded */
        }
    this.cast = createLampCast(scene, this.kit.lit);
  }

  /** Where every boat is now (for the minimap). */
  all(): readonly CatBoatPose[] {
    return this.poses;
  }

  /** How whole boat `index` was drawn in the last frame, 0 to 1 (0: not drawn). */
  amountOf(index: number): number {
    return this.drawnAmounts[index] ?? 0;
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
    const dt = this.last === undefined ? 0 : Math.min(time - this.last, 0.25);
    this.last = time;
    this.kit.update();
    this.poses = this.plans.map((plan) => boatPose(plan, shared));
    const { range, limit, band } = this.options;
    const order = this.poses
      .map((pose, index) => ({
        index,
        d: Math.hypot(pose.x - camera.x, pose.z - camera.z),
      }))
      .filter((item) => item.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit);
    const show = new Set(order.map((item) => item.index));
    // Boats already in view when the sea opens start whole, not fading in.
    const first = !this.primed;
    this.primed = true;
    this.drawn = [];
    let nearest: CatBoat | undefined;
    let nearestAmount = 0;
    this.plans.forEach((_, index) => {
      const pose = this.poses[index]!;
      const wanted = show.has(index);
      let fade = this.amounts[index]!;
      if (first && wanted) fade = 1;
      fade = approach(fade, wanted ? 1 : 0, dt, wanted ? FADE_IN : FADE_OUT);
      this.amounts[index] = fade;
      const distance = Math.hypot(pose.x - camera.x, pose.z - camera.z);
      const amount = fadeAmount(fade, distance, range, band);
      this.drawnAmounts[index] = amount;
      const boat = this.boats.get(index);
      if (amount <= 0) {
        boat?.setEnabled(false);
        return;
      }
      const made =
        boat ??
        (this.boats.set(
          index,
          new CatBoat(this.scene, this.kit, `cat-boat-${index}`),
        ),
        this.boats.get(index)!);
      made.setEnabled(true);
      made.setFade(amount);
      made.update(pose, time, height, amount);
      this.drawn.push(pose);
      if (index === order[0]?.index) {
        nearest = made;
        nearestAmount = amount;
      }
    });
    // The lantern of the nearest boat lights that boat (its cats, oars and hull) at night, and goes
    // out with it as it fades.
    if (nearest) {
      (nearest as CatBoat).lampPosition(this.lamp);
      this.cast.place(
        this.lamp,
        beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z) * nearestAmount,
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
