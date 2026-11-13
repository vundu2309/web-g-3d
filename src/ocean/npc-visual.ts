import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { useSolid } from "./art/materials.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import { NPC_RIG, type NpcLook, type NpcPose } from "./npc-look.ts";

/**
 * A person of the sea (npc-look.ts says how they look): a small cartoon figure of six meshes,
 * one per moving part (the body, the head, two arms, two legs), each hung from a joint node so
 * it can swing. Every part starts inside a ball at its joint and the joints sit inside the body,
 * so the pieces overlap and nothing floats apart. Colours come from the palette, the look is the
 * sea's shared "satin" solid, and one figure is six draw calls.
 *
 * The figure faces +Z with its feet on y = 0; place it by moving `root`.
 */
export interface Npc {
  root: TransformNode;
  /** Poses the joints; call it every frame while the figure moves. */
  setPose(pose: NpcPose): void;
  dispose(): void;
}

type V3 = readonly [number, number, number];

const FACE = PAL.people.face;
/**
 * Babylon's sphere with `segments` n has (n + 2) x 2(n + 2) quads, so a ball is dear: the
 * figure is rounded only where it shows (the skull, the hair and the hats), and the small
 * balls (joints, hands, shoes, the dots of the face) are coarse.
 */
const FINE = 8;
const COARSE = 4;
const TINY = 3;
const SKULL = 0.27;

/** A capsule of `radius` whose straight middle is `length` long. */
const capsule = (scene: Scene, radius: number, length: number) =>
  MeshBuilder.CreateCapsule(
    "part",
    {
      radius,
      height: length + 2 * radius,
      tessellation: SIDES.small,
      subdivisions: 1,
      capSubdivisions: 2,
    },
    scene,
  );

/** A dome: the top `slice` of a sphere of `diameter`. */
const dome = (scene: Scene, diameter: number, slice: number) =>
  MeshBuilder.CreateSphere("part", { diameter, slice, segments: FINE }, scene);

/** The pelvis, the torso and the apron: everything that does not move on its own. */
function bodyMesh(scene: Scene, look: NpcLook): Mesh {
  const parts = new Parts(scene);
  parts.sphere(
    0.34,
    look.pants,
    [0, 0.04, 0],
    undefined,
    [1, 0.7, 0.8],
    COARSE,
  );
  parts.add(
    capsule(scene, 0.175, 0.16),
    look.shirt,
    [0, 0.3, 0],
    undefined,
    [1.05, 1, 0.86],
  );
  if (look.apron !== undefined) {
    // A band that wraps the whole body, so it hugs the torso from every side, and a bib in front.
    parts.add(
      MeshBuilder.CreateCylinder(
        "part",
        {
          diameterTop: 0.38,
          diameterBottom: 0.396,
          height: 0.3,
          tessellation: SIDES.smooth,
          cap: Mesh.NO_CAP,
        },
        scene,
      ),
      look.apron,
      [0, 0.22, 0],
      undefined,
      [1.07, 1, 0.9],
    );
    // The bib: a small panel at the front that rises to the chest.
    parts.box([0.22, 0.17, 0.05], look.apron, [0, 0.45, 0.14], [-0.08, 0, 0]);
  }
  return parts.merge("npc-body");
}

/** The neck, the head with its face, the hair and whatever is worn on it. */
function headMesh(scene: Scene, look: NpcLook): Mesh {
  const parts = new Parts(scene);
  parts.tube(
    { top: 0.16, bottom: 0.18, height: 0.18, sides: SIDES.round },
    look.skin,
    [0, 0, 0],
  );
  parts.sphere(
    SKULL * 2,
    look.skin,
    [0, 0.2, 0],
    undefined,
    [1, 0.96, 0.96],
    FINE,
  );
  for (const side of [-1, 1]) {
    parts.sphere(
      0.06,
      FACE.iris,
      [side * 0.1, 0.2, 0.245],
      undefined,
      [0.9, 1.25, 0.6],
      TINY,
    );
    parts.sphere(
      0.08,
      FACE.lip,
      [side * 0.16, 0.12, 0.2],
      undefined,
      [1, 0.6, 0.4],
      TINY,
    );
    parts.sphere(
      0.09,
      look.skin,
      [side * 0.262, 0.19, 0],
      undefined,
      undefined,
      TINY,
    );
  }
  parts.sphere(
    0.05,
    FACE.lipDeep,
    [0, 0.095, 0.255],
    undefined,
    [1.6, 0.5, 0.5],
    TINY,
  );
  if (look.hat === "cap")
    // Under a cap the hair shows only as a band at the back and sides of the head, tucked inside the cap.
    parts.tube(
      { top: 0.56, bottom: 0.56, height: 0.1, sides: SIDES.round },
      look.hair,
      [0, 0.21, -0.05],
    );
  else if (look.hat !== "scarf")
    parts.add(
      dome(scene, 0.57, 0.52),
      look.hair,
      [0, 0.235, -0.02],
      [-0.32, 0, 0],
    );
  if (look.longHair)
    parts.add(
      capsule(scene, 0.16, 0.2),
      look.hair,
      [0, 0.08, -0.2],
      undefined,
      [1.35, 1, 0.55],
    );
  const hatColor = look.hatColor ?? look.hair;
  if (look.hat === "non") {
    parts.tube(
      { top: 0, bottom: 0.94, height: 0.22, sides: SIDES.smooth },
      hatColor,
      [0, 0.52, 0],
    );
    parts.sphere(0.06, hatColor, [0, 0.64, 0], undefined, undefined, COARSE);
  } else if (look.hat === "cap") {
    parts.add(dome(scene, 0.58, 0.5), hatColor, [0, 0.26, 0]);
    parts.tube(
      { top: 0.58, bottom: 0.58, height: 0.03, sides: SIDES.round },
      hatColor,
      [0, 0.26, 0],
      undefined,
      [1, 1, 1.05],
    );
  } else if (look.hat === "scarf") {
    parts.add(
      dome(scene, 0.57, 0.55),
      hatColor,
      [0, 0.235, -0.01],
      [-0.12, 0, 0],
    );
    parts.sphere(
      0.14,
      hatColor,
      [0.18, 0.4, -0.12],
      undefined,
      undefined,
      COARSE,
    );
  }
  return parts.merge("npc-head");
}

/** A shoulder ball, the arm and the hand, hanging down from the joint. */
function armMesh(scene: Scene, look: NpcLook): Mesh {
  const parts = new Parts(scene);
  parts.sphere(0.15, look.shirt, [0, 0, 0], undefined, undefined, COARSE);
  parts.add(capsule(scene, 0.062, 0.19), look.shirt, [0, -0.125, 0]);
  parts.sphere(0.136, look.skin, [0, -0.31, 0], undefined, undefined, COARSE);
  return parts.merge("npc-arm");
}

/** A hip ball, the leg and the shoe, hanging down from the joint. */
function legMesh(scene: Scene, look: NpcLook): Mesh {
  const parts = new Parts(scene);
  parts.sphere(0.17, look.pants, [0, 0, 0], undefined, undefined, COARSE);
  parts.add(capsule(scene, 0.078, 0.2), look.pants, [0, -0.12, 0]);
  parts.sphere(
    0.18,
    look.shoes,
    [0, -0.33, 0.04],
    undefined,
    [0.95, 0.62, 1.5],
    COARSE,
  );
  return parts.merge("npc-leg");
}

export function createNpc(scene: Scene, look: NpcLook): Npc {
  const root = new TransformNode("npc", scene);
  root.scaling.setAll(look.scale);
  const hips = new TransformNode("npc-hips", scene);
  hips.parent = root;
  hips.position.y = NPC_RIG.hipsY;

  const hang = (name: string, mesh: Mesh, at: V3) => {
    const joint = new TransformNode(name, scene);
    joint.parent = hips;
    joint.position.set(...at);
    mesh.parent = joint;
    return joint;
  };
  const place = (mesh: Mesh) => {
    mesh.isPickable = false;
    return useSolid(mesh, "satin");
  };

  place(bodyMesh(scene, look)).parent = hips;
  const head = hang("npc-head", place(headMesh(scene, look)), [
    0,
    NPC_RIG.headY,
    0,
  ]);
  const arms = [-1, 1].map((side) =>
    hang(`npc-arm${side}`, place(armMesh(scene, look)), [
      side * NPC_RIG.shoulder.x,
      NPC_RIG.shoulder.y,
      0,
    ]),
  );
  const legs = [-1, 1].map((side) =>
    hang(`npc-leg${side}`, place(legMesh(scene, look)), [
      side * NPC_RIG.hip.x,
      NPC_RIG.hip.y,
      0,
    ]),
  );

  return {
    root,
    setPose(pose) {
      hips.position.y = NPC_RIG.hipsY + pose.hipsY;
      head.rotation.z = pose.headZ;
      legs[0]!.rotation.x = pose.legs[0];
      legs[1]!.rotation.x = pose.legs[1];
      arms[0]!.rotation.set(pose.arms[0].x, 0, pose.arms[0].z);
      arms[1]!.rotation.set(pose.arms[1].x, 0, pose.arms[1].z);
    },
    dispose() {
      root.dispose();
    },
  };
}
