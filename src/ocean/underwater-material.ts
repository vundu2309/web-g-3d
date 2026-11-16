import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { LINE_WIDTH } from "./ribbon.ts";
import { ribbonPositions, type Point3 } from "./rope.ts";
import {
  DEEP_TEAL,
  DEEP_WATER,
  SHALLOW_WATER,
  SUN_DIRECTION,
} from "./sea-style.ts";
import {
  ALPHA,
  LINE_VISIBLE,
  UNDERWATER_FRAGMENT,
  UNDERWATER_MATERIAL,
  UNDERWATER_VERTEX,
} from "./underwater.ts";

/**
 * The GPU part of drawing things under the water (the rules and the shaders are in
 * underwater.ts): a material for the hooked fish and one for the bit of line below the surface,
 * and that bit of line as a camera-facing strip. The materials blend, write depth (so a fish
 * sorts itself) and draw both faces; the meshes that wear them are skipped by the sea's mirror
 * (reflection.ts) because they lie below the water.
 */
Effect.ShadersStore["underwaterVertexShader"] = UNDERWATER_VERTEX;
Effect.ShadersStore["underwaterFragmentShader"] = UNDERWATER_FRAGMENT;

/** What the fish fades into as it goes down: the deep blue of the open sea, or the turquoise of the shallows, a shade darker. */
const MURK_DEEP = DEEP_WATER.scale(0.9);
const MURK_SHALLOW = DEEP_TEAL.scale(0.5)
  .add(SHALLOW_WATER.scale(0.25))
  .scale(0.85);

export class UnderwaterSkin {
  readonly material: ShaderMaterial;
  private readonly murk = new Color3();

  /** `shade` is how much the sun shapes it (a fish) against an even glow (the line, which also stays easier to see). */
  constructor(scene: Scene, shade: number, line = false) {
    const material = new ShaderMaterial(
      UNDERWATER_MATERIAL,
      scene,
      { vertex: "underwater", fragment: "underwater" },
      {
        attributes: ["position", "normal", "color"],
        uniforms: [
          "world",
          "viewProjection",
          "cameraPosition",
          "surface",
          "time",
          "sunDirection",
          "murk",
          "tint",
          "shade",
          "cut",
          "fade",
          "floorKeep",
        ],
        needAlphaBlending: true,
      },
    );
    material.backFaceCulling = false;
    material.forceDepthWrite = true;
    material.setVector3("sunDirection", SUN_DIRECTION);
    material.setColor3("murk", MURK_DEEP);
    material.setColor3("tint", Color3.White());
    material.setFloat("shade", shade);
    material.setFloat("cut", 1);
    material.setFloat("fade", 1);
    material.setVector2(
      "floorKeep",
      line
        ? new Vector2(LINE_VISIBLE.alpha, LINE_VISIBLE.clarity)
        : new Vector2(ALPHA.deep, 0),
    );
    material.setFloat("surface", 0);
    material.setFloat("time", 0);
    this.material = material;
  }

  /** Each frame: the sea clock, the sea level under the fish (for the depth) and whether the part above water is cut. */
  update(
    time: number,
    surface: number,
    cut: boolean,
    fade = 1,
    /** 0 deep blue water, 1 turquoise shallows (`shoal`). */
    turquoise = 0,
  ) {
    Color3.LerpToRef(MURK_DEEP, MURK_SHALLOW, turquoise, this.murk);
    this.material.setColor3("murk", this.murk);
    this.material.setFloat("time", time);
    this.material.setFloat("surface", surface);
    this.material.setFloat("cut", cut ? 1 : 0);
    this.material.setFloat("fade", fade);
  }

  tint(color: Color3) {
    this.material.setColor3("tint", color);
  }

  dispose() {
    this.material.dispose();
  }
}

/** The line from where it enters the water to the fish's mouth: a strip facing the camera, drawn through the water. */
export class UnderLine {
  readonly mesh: Mesh;
  private readonly positions = new Float32Array(12);
  private readonly points: Point3[] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];

  constructor(scene: Scene, name: string, skin: UnderwaterSkin) {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = Array.from(this.positions);
    data.indices = [0, 1, 2, 1, 3, 2];
    data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    data.colors = new Array(16).fill(1);
    data.applyToMesh(mesh, true);
    mesh.material = skin.material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = false;
    this.mesh = mesh;
  }

  set isVisible(on: boolean) {
    this.mesh.isVisible = on;
  }

  /** `widen` thickens the strip (the clear-water layer is half the canvas, which would break a 2 px line into dashes). */
  draw(from: Point3, to: Point3, eye: Point3, widen = 1) {
    // (Babylon's vectors keep x, y, z behind accessors, so they are copied by name.)
    const [a, b] = this.points as [Point3, Point3];
    a.x = from.x;
    a.y = from.y;
    a.z = from.z;
    b.x = to.x;
    b.y = to.y;
    b.z = to.z;
    ribbonPositions(
      this.points,
      eye,
      this.positions,
      LINE_WIDTH.perMetre * widen,
      LINE_WIDTH.min * widen,
      LINE_WIDTH.max * widen,
    );
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.refreshBoundingInfo();
  }

  dispose() {
    this.mesh.dispose();
  }
}
