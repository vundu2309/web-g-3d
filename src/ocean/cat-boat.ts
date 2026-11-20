import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { poleOf, solveArm, type V3 } from "./arm-ik.ts";
import {
  loadMergedModel,
  loadPartsModel,
  type PartsModel,
} from "./model-loader.ts";

/** Seconds for one full stroke. */
export const STROKE = 2.4;

/**
 * The pose of a rowing stroke at `phase` (turns, 0 to 1). `sweep`: how far the blade is toward the
 * bow (radians, positive toward the bow), `lift`: how far the blade is raised out of the water
 * (radians, negative in the drive, when it is in), `feather`: the roll of the blade about the oar
 * (0 square in the water, a quarter turn flat in the air), `lean`: the cats' lean toward the
 * stern (radians, forward positive). The catch is at phase 0 (blades forward, cats leaning);
 * the drive is the first half, the recovery the second.
 */
export function stroke(phase: number) {
  const a = (phase - Math.floor(phase)) * Math.PI * 2;
  const air = Math.min(1, Math.max(0, -Math.sin(a) * 3));
  return {
    sweep: 0.5 * Math.cos(a),
    lift: -0.14 * Math.sin(a),
    feather: (Math.PI / 2) * air,
    lean: 0.18 * Math.cos(a),
  };
}

/** The layout of the models (boat space: x starboard, y up, z toward the stern; the bow is -Z). Numbers from tools/blender/rowers.py. */
export const RIG = {
  seats: { ginger: [0.3, 0.02, -0.22], grey: [-0.3, 0.02, -0.22] },
  oarlocks: { starboard: [0.72, 0.398, 0.08], port: [-0.72, 0.398, 0.08] },
  /** How far inboard of the oarlock each paw grips the handle (m). */
  grip: { outboard: 0.24, inboard: 0.36 },
  /** The wrist is this far from the paw's centre, in the cat's frame. */
  wrist: [0, -0.006, -0.05],
  /** The boat is carried this high so its floor clears the sea (the sea is opaque and covers anything lower). */
  lift: 0.3,
} as const;

const PARTS = [
  "body",
  "head",
  "tail",
  "arm-left",
  "arm-right",
  "fore-left",
  "fore-right",
] as const;
type Part = (typeof PARTS)[number];

const v = (a: readonly number[]) => new Vector3(a[0]!, a[1]!, a[2]!);
const tuple = (p: Vector3): V3 => [p.x, p.y, p.z];

/** The quaternion that applies the roll about X first, then the pitch about Z, then the yaw about Y. */
export function oarQuaternion(yaw: number, pitch: number, roll: number) {
  return Quaternion.RotationAxis(Axis.Y, yaw)
    .multiply(Quaternion.RotationAxis(Axis.Z, pitch))
    .multiply(Quaternion.RotationAxis(Axis.X, roll));
}

interface Hand {
  shoulder: Vector3;
  elbow: Vector3;
  upper: number;
  fore: number;
  pole: V3;
  /** Along the oar from the oarlock (m, inboard). */
  grip: number;
  arm: TransformNode;
  forearm: TransformNode;
  restUpper: Vector3;
  restFore: Vector3;
}

interface Rower {
  model: PartsModel<Part>;
  seat: Vector3;
  /** +1 starboard, -1 port: which oar this cat rows. */
  side: 1 | -1;
  hands: Hand[];
  oar: TransformNode;
}

export interface RowerAssets {
  cats: { ginger: PartsModel<Part>; grey: PartsModel<Part> };
  oars: { starboard: Mesh; port: Mesh };
  hull: Mesh;
}

/** Loads the Blender models (public/models/rower-*.glb, rowboat.glb). */
export async function loadRowerAssets(scene: Scene): Promise<RowerAssets> {
  const [ginger, grey, starboard, port, hull] = await Promise.all([
    loadPartsModel(scene, "rower-ginger.glb", PARTS),
    loadPartsModel(scene, "rower-grey.glb", PARTS),
    loadMergedModel(scene, "rower-oar-starboard.glb"),
    loadMergedModel(scene, "rower-oar-port.glb"),
    loadMergedModel(scene, "rowboat.glb"),
  ]);
  // Named as a boat's hull, so the see-through sea draws what is under the water.
  hull.name = "boat-model-rowboat";
  return { cats: { ginger, grey }, oars: { starboard, port }, hull };
}

/**
 * One rowing boat with two cats, one on each oar (a trial, `?cats=1`; one boat only: the loaded
 * models are used themselves, not copied). The cats face the stern, as rowers do. The oars sweep,
 * lift and feather by `stroke`; each arm is solved with arm-ik.ts so the paws stay on the handle.
 */
export class CatBoat {
  private readonly root: TransformNode;
  private readonly rowers: Rower[] = [];
  private readonly at: { x: number; z: number };
  private readonly yaw: number;

  constructor(
    scene: Scene,
    assets: RowerAssets,
    at: { x: number; z: number },
    yaw = 0,
  ) {
    this.at = at;
    this.yaw = yaw;
    this.root = new TransformNode("cat-boat", scene);
    assets.hull.parent = this.root;
    const make = (
      model: PartsModel<Part>,
      seat: readonly number[],
      side: 1 | -1,
      oarMesh: Mesh,
    ) => {
      model.root.setEnabled(true);
      model.root.parent = this.root;
      model.root.position = v(seat);
      model.root.rotationQuaternion = Quaternion.Identity();
      const lock = v(side === 1 ? RIG.oarlocks.starboard : RIG.oarlocks.port);
      const oar = new TransformNode("cat-oar", scene);
      oar.parent = this.root;
      oar.position = lock;
      oar.rotationQuaternion = Quaternion.Identity();
      oarMesh.parent = oar;
      const seatV = v(seat);
      const hands = (["left", "right"] as const).map((hand): Hand => {
        const arm = model.parts[`arm-${hand}`];
        const forearm = model.parts[`fore-${hand}`];
        const shoulder = arm.position.clone();
        const elbow = forearm.position.clone();
        // The cat's left is +X; the arm on the oar's side reaches the outer grip.
        const outboard = (hand === "left" ? 1 : -1) === side;
        const grip = outboard ? RIG.grip.outboard : RIG.grip.inboard;
        const wrist = lock
          .subtract(seatV)
          .add(new Vector3(-side * grip, 0, 0))
          .add(v(RIG.wrist));
        return {
          shoulder,
          elbow,
          upper: Vector3.Distance(shoulder, elbow),
          fore: Vector3.Distance(elbow, wrist),
          pole: poleOf(tuple(shoulder), tuple(elbow), tuple(wrist)),
          grip,
          arm,
          forearm,
          restUpper: elbow.subtract(shoulder).normalize(),
          restFore: wrist.subtract(elbow).normalize(),
        };
      });
      this.rowers.push({ model, seat: seatV, side, hands, oar });
    };
    make(assets.cats.ginger, RIG.seats.ginger, 1, assets.oars.starboard);
    make(assets.cats.grey, RIG.seats.grey, -1, assets.oars.port);
  }

  /** Each frame: `height(x, z)` is the sea's height there (m). */
  update(time: number, height: (x: number, z: number) => number) {
    const { x, z } = this.at;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fore = height(x - sin * 1.8, z - cos * 1.8);
    const aft = height(x + sin * 1.8, z + cos * 1.8);
    this.root.position.set(x, height(x, z) + RIG.lift, z);
    this.root.rotation.y = this.yaw;
    // The bow is -Z: a rise at the bow tilts the boat about X.
    this.root.rotation.x = Math.atan2(aft - fore, 3.6) * -1;
    this.root.rotation.z = 0.03 * Math.sin(time * 0.8);
    const pose = stroke(time / STROKE);
    const lean = Quaternion.RotationAxis(Axis.X, pose.lean);
    const unlean = Quaternion.Inverse(lean);
    for (const rower of this.rowers) {
      const { side } = rower;
      rower.model.root.rotationQuaternion = lean;
      const oarQ = oarQuaternion(
        side * pose.sweep,
        side * pose.lift,
        pose.feather,
      );
      rower.oar.rotationQuaternion = oarQ;
      rower.model.parts.head.rotation.x = -0.4 * pose.lean;
      rower.model.parts.tail.rotation.y = 0.2 * Math.sin(time * 1.3 + side);
      for (const hand of rower.hands) {
        // Where the paw is now, in the cat's own frame (the cat leans, the oar swings).
        const grip = new Vector3(-side * hand.grip, 0, 0);
        grip.rotateByQuaternionToRef(oarQ, grip);
        const lock = rower.oar.position;
        const target = grip
          .add(lock)
          .subtract(rower.seat)
          .applyRotationQuaternion(unlean)
          .add(v(RIG.wrist));
        const { elbow, wrist } = solveArm(
          tuple(hand.shoulder),
          hand.upper,
          hand.fore,
          hand.pole,
          tuple(target),
        );
        const e = v(elbow);
        hand.arm.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
          hand.restUpper,
          e.subtract(hand.shoulder).normalize(),
          new Quaternion(),
        );
        hand.forearm.position.copyFrom(e);
        hand.forearm.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
          hand.restFore,
          v(wrist).subtract(e).normalize(),
          new Quaternion(),
        );
      }
    }
  }

  dispose() {
    this.root.dispose();
  }
}
