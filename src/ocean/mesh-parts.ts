import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Small helpers for scenery built from many parts that end up as ONE mesh with
 * per-vertex colours: one draw call and one material, whatever the part count.
 */
export function paint(mesh: Mesh, color: Color3) {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++)
    colors.set([color.r, color.g, color.b, 1], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

/** A mesh from raw arrays, with computed normals and (empty) uvs so it can merge. */
export function meshFrom(
  name: string,
  scene: Scene,
  positions: number[],
  indices: number[],
  color: Color3 | number[],
) {
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.uvs = new Array((positions.length / 3) * 2).fill(0);
  if (Array.isArray(color)) data.colors = color;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh, false);
  if (!Array.isArray(color)) paint(mesh, color);
  return mesh;
}

export function mergeParts(name: string, parts: Mesh[]) {
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) throw new Error(`Could not merge ${name}`);
  merged.name = name;
  return merged;
}

export const hex = (value: number) =>
  Color3.FromHexString(`#${value.toString(16).padStart(6, "0")}`);
