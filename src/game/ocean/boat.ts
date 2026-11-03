import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

export function createBoat(scene: Scene): TransformNode {
  const boat = new TransformNode("sailboat", scene);
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.set(0.15, 0.15, 0.15);
    return m;
  };
  const wood = material("teak", "#965737");
  const hullPaint = material("ivory-hull", "#e5e4d0");
  const sailMaterial = material("linen", "#fff1d1");
  sailMaterial.backFaceCulling = false;
  const hull = MeshBuilder.CreateSphere(
    "hull",
    { segments: 16, diameter: 2 },
    scene,
  );
  hull.scaling.set(0.85, 0.5, 2.2);
  hull.position.y = 0.2;
  hull.material = hullPaint;
  hull.parent = boat;
  const deck = MeshBuilder.CreateBox(
    "deck",
    { width: 1.4, height: 0.13, depth: 3.5 },
    scene,
  );
  deck.position.y = 0.5;
  deck.material = wood;
  deck.parent = boat;
  const mast = MeshBuilder.CreateCylinder(
    "mast",
    { height: 5.8, diameter: 0.075, tessellation: 8 },
    scene,
  );
  mast.position.set(0, 3.35, 0);
  mast.material = wood;
  mast.parent = boat;
  const boom = MeshBuilder.CreateBox(
    "boom",
    { width: 0.07, height: 0.07, depth: 2.2 },
    scene,
  );
  boom.position.set(0, 1.35, -1);
  boom.material = wood;
  boom.parent = boat;
  const sail = (name: string, positions: number[]) => {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = [0, 1, 2, 0, 2, 3];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, data.indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = sailMaterial;
    mesh.parent = boat;
  };
  sail("mainsail", [0, 6.1, 0, 0.28, 3.4, -1.15, 0, 1.45, -2.05, 0, 1.45, 0]);
  sail("jib", [0, 5.6, 0.1, 0, 1.05, 1.8, 0.18, 1.3, 0.9, 0, 1.4, 0.1]);
  return boat;
}
