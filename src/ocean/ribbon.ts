import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { ribbonPositions, type Point3 } from "./rope.ts";
import { glowMaterial } from "./art/materials.ts";

/** Width of the line (m): per metre of distance from the eye, at least, at most; the halo is wider by `halo`. */
export const LINE_WIDTH = {
  perMetre: 0.0045,
  min: 0.02,
  max: 0.15,
  halo: 1.7,
} as const;
/** How dark the halo is, as a share of the line's own alpha. */
const HALO_ALPHA = 0.42;

/**
 * The fishing line as a flat strip that faces the camera: visible at any distance. With a
 * `halo` colour a second, wider and dimmer strip is drawn just behind it, so a white line shows
 * on bright water and foam as well as on dark water.
 */
export class Ribbon {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly positions: Float32Array;
  private readonly halo: { mesh: Mesh; material: StandardMaterial } | undefined;
  private readonly haloPositions: Float32Array;

  constructor(scene: Scene, name: string, count: number, halo?: Color3) {
    this.positions = new Float32Array(count * 6);
    this.haloPositions = new Float32Array(count * 6);
    const indices: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const strip = (meshName: string) => {
      const mesh = new Mesh(meshName, scene);
      const data = new VertexData();
      data.positions = Array.from(this.positions);
      data.indices = indices;
      data.applyToMesh(mesh, true);
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = false;
      return mesh;
    };
    this.mesh = strip(name);
    this.material = glowMaterial(scene, `${name}-material`);
    this.mesh.material = this.material;
    if (halo) {
      const mesh = strip(`${name}-halo`);
      const material = glowMaterial(scene, `${name}-halo-material`, {
        color: halo,
        alpha: HALO_ALPHA,
      });
      mesh.material = material;
      // Transparent meshes are drawn by index: the halo first, the line over it.
      mesh.alphaIndex = 1;
      this.mesh.alphaIndex = 2;
      this.halo = { mesh, material };
    }
  }

  get isVisible() {
    return this.mesh.isVisible;
  }
  set isVisible(on: boolean) {
    this.mesh.isVisible = on;
    if (this.halo) this.halo.mesh.isVisible = on;
  }
  set color(color: Color3) {
    this.material.emissiveColor = color;
  }
  set alpha(alpha: number) {
    this.material.alpha = alpha;
    if (this.halo) this.halo.material.alpha = alpha * HALO_ALPHA;
  }

  /** Lays the strip along `points`, facing `eye`. */
  draw(points: readonly Point3[], eye: Point3) {
    // About two to three pixels wide on a phone at any distance (a thin line you can see, not a tape).
    ribbonPositions(
      points,
      eye,
      this.positions,
      LINE_WIDTH.perMetre,
      LINE_WIDTH.min,
      LINE_WIDTH.max,
    );
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.refreshBoundingInfo();
    if (this.halo) {
      const grow = LINE_WIDTH.halo;
      ribbonPositions(
        points,
        eye,
        this.haloPositions,
        LINE_WIDTH.perMetre * grow,
        LINE_WIDTH.min * grow,
        LINE_WIDTH.max * grow,
      );
      this.halo.mesh.updateVerticesData(
        VertexBuffer.PositionKind,
        this.haloPositions,
      );
      this.halo.mesh.refreshBoundingInfo();
    }
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.halo?.mesh.dispose();
    this.halo?.material.dispose();
  }
}
