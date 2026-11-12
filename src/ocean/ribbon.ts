import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { ribbonPositions, type Point3 } from "./rope.ts";
import { glowMaterial } from "./art/materials.ts";

/** The fishing line as a flat strip that faces the camera: visible at any distance. */
export class Ribbon {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly positions: Float32Array;

  constructor(scene: Scene, name: string, count: number) {
    this.positions = new Float32Array(count * 6);
    const indices: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = Array.from(this.positions);
    data.indices = indices;
    data.applyToMesh(this.mesh, true);
    this.material = glowMaterial(scene, `${name}-material`);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.isVisible = false;
  }

  get isVisible() {
    return this.mesh.isVisible;
  }
  set isVisible(on: boolean) {
    this.mesh.isVisible = on;
  }
  set color(color: Color3) {
    this.material.emissiveColor = color;
  }
  set alpha(alpha: number) {
    this.material.alpha = alpha;
  }

  /** Lays the strip along `points`, facing `eye`. */
  draw(points: readonly Point3[], eye: Point3) {
    // About two pixels wide on a phone at any distance (a fishing line, not a tape).
    ribbonPositions(points, eye, this.positions, 0.0035, 0.012, 0.12);
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.refreshBoundingInfo();
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
  }
}
