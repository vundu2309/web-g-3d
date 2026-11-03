import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

// One continuous grid avoids a visible seam between near and distant oceans.
// Exponential spacing concentrates triangles around the boat and camera.
export function createOceanSurface(scene: Scene): Mesh {
  const divisions = 320;
  const coordinate = (i: number) => {
    const t = (i / divisions) * 2 - 1;
    return (
      ((Math.sign(t) * Math.expm1(Math.abs(t) * 4.5)) / Math.expm1(4.5)) * 700
    );
  };
  const positions: number[] = [],
    indices: number[] = [];
  for (let z = 0; z <= divisions; z++)
    for (let x = 0; x <= divisions; x++)
      positions.push(coordinate(x), 0, coordinate(z));
  for (let z = 0; z < divisions; z++)
    for (let x = 0; x < divisions; x++) {
      const i = z * (divisions + 1) + x;
      indices.push(
        i,
        i + 1,
        i + divisions + 1,
        i + 1,
        i + divisions + 2,
        i + divisions + 1,
      );
    }
  const mesh = new Mesh("continuous-ocean", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}
