import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { poleOf, solveArm, type V3 } from "./arm-ik.ts";
import {
  LANTERN,
  LANTERN_PARTS,
  createLantern,
  createLanternKit,
  type Lantern,
  type LanternKit,
  type LanternModel,
} from "./cat-lantern.ts";
import { CAT_SCALE } from "./cat-pose.ts";
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

/** The crew is drawn this much larger than its model (1 = life size for a small cat): the market cats are drawn at `CAT_SCALE`, and cats of 0.93 m next to the 7.4 m fishing boat looked tiny. */
export const CREW_SCALE = CAT_SCALE;

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

export interface RowerAssets {
  cats: { ginger: PartsModel<Part>; grey: PartsModel<Part> };
  oars: { starboard: Mesh; port: Mesh };
  hull: Mesh;
  lantern: LanternModel;
}

/** Loads the Blender models (public/models/rower-*.glb, rowboat.glb). */
export async function loadRowerAssets(scene: Scene): Promise<RowerAssets> {
  const [ginger, grey, starboard, port, hull, lantern] = await Promise.all([
    loadPartsModel(scene, "rower-ginger.glb", PARTS),
    loadPartsModel(scene, "rower-grey.glb", PARTS),
    loadMergedModel(scene, "rower-oar-starboard.glb"),
    loadMergedModel(scene, "rower-oar-port.glb"),
    loadMergedModel(scene, "rowboat.glb"),
    loadPartsModel(scene, "rower-lantern.glb", LANTERN_PARTS),
  ]);
  // Named as a boat's hull, so the see-through sea draws what is under the water.
  hull.name = "boat-model-rowboat";
  return { cats: { ginger, grey }, oars: { starboard, port }, hull, lantern };
}

/** The loaded models as templates (hidden): each boat is made of instances of these, so many boats cost no more geometry. */
export interface RowerKit {
  assets: RowerAssets;
  lantern: LanternKit;
  /** The meshes the lantern's light falls on (the hidden templates the boats instance). */
  lit: Mesh[];
  /** Once a frame. */
  update(): void;
  dispose(): void;
}

export function createRowerKit(scene: Scene, assets: RowerAssets): RowerKit {
  const lantern = createLanternKit(scene, assets.lantern);
  const templates: Mesh[] = [
    assets.hull,
    assets.oars.starboard,
    assets.oars.port,
  ];
  for (const model of [assets.cats.ginger, assets.cats.grey]) {
    model.root.setEnabled(true);
    templates.push(...model.meshes);
  }
  // The parts stay under their pivots (each boat reads them from there); only hidden.
  for (const mesh of templates) mesh.isVisible = false;
  return {
    assets,
    lantern,
    lit: [...templates, ...lantern.post],
    update: () => lantern.update(),
    dispose() {
      lantern.dispose();
      for (const mesh of templates) mesh.dispose();
      assets.cats.ginger.root.dispose();
      assets.cats.grey.root.dispose();
    },
  };
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
  root: TransformNode;
  parts: Record<Part, TransformNode>;
  seat: Vector3;
  /** +1 starboard, -1 port: which oar this cat rows. */
  side: 1 | -1;
  hands: Hand[];
  oar: TransformNode;
}

/** What a boat is doing at a moment (see cat-routes.ts `boatPose`). */
export interface CatBoatState {
  x: number;
  z: number;
  /** The game's heading: 0 is -Z, a quarter turn is +X. */
  heading: number;
  /** 0 at rest .. 1 rowing at full effort. */
  effort: number;
}

/**
 * One rowing boat with two cats, one on each oar, made of instances of the kit's models. The cats
 * face the stern, as rowers do. The oars sweep, lift and feather by `stroke` (scaled by the
 * effort); each arm is solved with arm-ik.ts so the paws stay on the handle.
 */
export class CatBoat {
  readonly root: TransformNode;
  private readonly rowers: Rower[] = [];
  private readonly lantern: Lantern;

  constructor(scene: Scene, kit: RowerKit, name: string) {
    const { assets } = kit;
    this.root = new TransformNode(name, scene);
    this.root.scaling.setAll(CREW_SCALE);
    const hull = assets.hull.createInstance(`${name}-hull`);
    hull.parent = this.root;
    hull.isPickable = false;
    this.lantern = createLantern(
      scene,
      this.root,
      kit.lantern,
      `${name}-lantern`,
    );
    const make = (
      id: string,
      model: PartsModel<Part>,
      seat: readonly number[],
      side: 1 | -1,
      oarMesh: Mesh,
    ) => {
      const root = new TransformNode(`${name}-${id}`, scene);
      root.parent = this.root;
      root.position = v(seat);
      root.rotationQuaternion = Quaternion.Identity();
      // Each part: a pivot of its own, placed as in the model, holding an instance of its mesh.
      const parts = {} as Record<Part, TransformNode>;
      for (const part of PARTS) {
        const template = model.parts[part];
        const pivot = new TransformNode(`${name}-${id}-${part}`, scene);
        pivot.parent = root;
        pivot.position.copyFrom(template.position);
        pivot.rotationQuaternion = Quaternion.Identity();
        for (const mesh of template.getChildMeshes()) {
          const copy = (mesh as Mesh).createInstance(
            `${name}-${id}-${part}-mesh`,
          );
          copy.parent = pivot;
          copy.isPickable = false;
        }
        parts[part] = pivot;
      }
      const lock = v(side === 1 ? RIG.oarlocks.starboard : RIG.oarlocks.port);
      const oar = new TransformNode(`${name}-${id}-oar`, scene);
      oar.parent = this.root;
      oar.position = lock;
      oar.rotationQuaternion = Quaternion.Identity();
      const blade = oarMesh.createInstance(`${name}-${id}-oar-mesh`);
      blade.parent = oar;
      blade.isPickable = false;
      const seatV = v(seat);
      const hands = (["left", "right"] as const).map((hand): Hand => {
        const arm = parts[`arm-${hand}`];
        const forearm = parts[`fore-${hand}`];
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
      this.rowers.push({ root, parts, seat: seatV, side, hands, oar });
    };
    make(
      "ginger",
      assets.cats.ginger,
      RIG.seats.ginger,
      1,
      assets.oars.starboard,
    );
    make("grey", assets.cats.grey, RIG.seats.grey, -1, assets.oars.port);
  }

  setEnabled(on: boolean) {
    this.root.setEnabled(on);
    if (!on) this.lantern.hide();
  }

  /** Writes the world position of a point just under the lantern's glass into `out`. */
  lampPosition(out: Vector3) {
    this.root.computeWorldMatrix(true);
    return Vector3.TransformCoordinatesFromFloatsToRef(
      LANTERN.at.x,
      LANTERN.at.y - 0.1,
      LANTERN.at.z,
      this.root.getWorldMatrix(),
      out,
    );
  }

  /** Each frame while the boat is near: `height(x, z)` is the sea's height there (m). */
  update(
    state: CatBoatState,
    time: number,
    height: (x: number, z: number) => number,
  ) {
    const { x, z, heading, effort } = state;
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const reach = 1.8 * CREW_SCALE;
    const fore = height(x + fx * reach, z + fz * reach);
    const aft = height(x - fx * reach, z - fz * reach);
    this.root.position.set(x, height(x, z) + RIG.lift * CREW_SCALE, z);
    this.root.rotation.y = -heading;
    this.root.rotation.x = Math.atan2(fore - aft, 2 * reach);
    this.root.rotation.z = 0.03 * Math.sin(time * 0.8);
    this.lantern.update(time);
    const pose = stroke(time / STROKE);
    const sweep = pose.sweep * effort;
    const lift = pose.lift * effort;
    const feather = pose.feather * effort;
    const lean = Quaternion.RotationAxis(Axis.X, pose.lean * effort);
    const unlean = Quaternion.Inverse(lean);
    for (const rower of this.rowers) {
      const { side } = rower;
      rower.root.rotationQuaternion = lean;
      const oarQ = oarQuaternion(side * sweep, side * lift, feather);
      rower.oar.rotationQuaternion = oarQ;
      rower.parts.head.rotation.x = -0.4 * pose.lean * effort;
      rower.parts.tail.rotation.y = 0.2 * Math.sin(time * 1.3 + side);
      for (const hand of rower.hands) {
        // Where the paw is now, in the cat's own frame (the cat leans, the oar swings).
        const grip = new Vector3(-side * hand.grip, 0, 0);
        grip.rotateByQuaternionToRef(oarQ, grip);
        const target = grip
          .add(rower.oar.position)
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
    this.lantern.dispose();
    this.root.dispose();
  }
}
