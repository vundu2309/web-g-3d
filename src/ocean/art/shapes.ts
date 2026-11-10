import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { hex, mergeParts, paint } from "../mesh-parts.ts";

/**
 * How round things are: the number of sides a round part gets. Every object picks a tier
 * instead of its own number, so the whole sea is rounded to the same degree and a phone
 * can be given fewer sides in one place.
 */
export const SIDES = {
  /** Thin things seen from afar: antennas, bristles. */
  thin: 5,
  /** Small round parts. */
  small: 8,
  /** Heads, bodies, rings, the fisherman. */
  round: 12,
  /** Big smooth discs and tori. */
  smooth: 18,
} as const;

export interface TubeShape {
  top: number;
  bottom: number;
  height: number;
  sides?: number;
}

/** A bare cylinder or cone mesh (not placed or painted) with the shared roundness. */
export function cylinderMesh(scene: Scene, shape: TubeShape, name = "part") {
  return MeshBuilder.CreateCylinder(
    name,
    {
      diameterTop: shape.top,
      diameterBottom: shape.bottom,
      height: shape.height,
      tessellation: shape.sides ?? SIDES.small,
    },
    scene,
  );
}

/** A bare sphere mesh with the shared roundness. */
export function sphereMesh(
  scene: Scene,
  diameter: number,
  sides: number = SIDES.small,
  name = "part",
) {
  return MeshBuilder.CreateSphere(name, { diameter, segments: sides }, scene);
}

type V3 = readonly [number, number, number];
const ZERO: V3 = [0, 0, 0];
const ONE: V3 = [1, 1, 1];

/**
 * Builds one object out of coloured primitives and merges it into ONE mesh (one draw call,
 * colours in the vertices). Every part is given its colour from the palette (a number from
 * `PAL`), a position, and optionally a rotation and a scale. All the primitive building of
 * the boat, the buoys, the island props and the rod holder goes through here, so shapes
 * follow the same rules (the same roundness tiers, the same way of placing a part).
 */
export class Parts {
  readonly meshes: Mesh[] = [];
  private readonly scene: Scene;
  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Puts a finished mesh (a hull, a tube) in, painted when a colour is given. */
  add(
    mesh: Mesh,
    color?: number,
    position: V3 = ZERO,
    rotation: V3 = ZERO,
    scale: V3 = ONE,
  ): Mesh {
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scaling.set(...scale);
    if (color !== undefined) paint(mesh, hex(color));
    this.meshes.push(mesh);
    return mesh;
  }

  box(size: V3, color: number, position: V3, rotation?: V3, scale?: V3): Mesh {
    return this.add(
      MeshBuilder.CreateBox(
        "part",
        { width: size[0], height: size[1], depth: size[2] },
        this.scene,
      ),
      color,
      position,
      rotation,
      scale,
    );
  }

  /** A cylinder or a cone (`top` 0 for a point), `sides` from SIDES. */
  tube(
    shape: TubeShape,
    color: number,
    position: V3,
    rotation?: V3,
    scale?: V3,
  ): Mesh {
    return this.add(
      cylinderMesh(this.scene, shape),
      color,
      position,
      rotation,
      scale,
    );
  }

  sphere(
    diameter: number,
    color: number,
    position: V3,
    rotation?: V3,
    scale?: V3,
    sides: number = SIDES.small,
  ): Mesh {
    return this.add(
      sphereMesh(this.scene, diameter, sides),
      color,
      position,
      rotation,
      scale,
    );
  }

  torus(
    diameter: number,
    thickness: number,
    color: number,
    position: V3,
    rotation?: V3,
    sides: number = SIDES.round,
  ): Mesh {
    return this.add(
      MeshBuilder.CreateTorus(
        "part",
        { diameter, thickness, tessellation: sides },
        this.scene,
      ),
      color,
      position,
      rotation,
    );
  }

  /** All the parts as one mesh (the parts are consumed). */
  merge(name: string): Mesh {
    return mergeParts(name, this.meshes);
  }
}
