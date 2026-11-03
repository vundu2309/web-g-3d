import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

// A projected grid spends geometry on visible water instead of a huge world
// plane. The vertex shader intersects camera rays with sea level then displaces.
export function createOceanSurface(scene: Scene): Mesh {
  const columns = 320,
    rows = 220;
  const positions: number[] = [],
    indices: number[] = [];
  for (let z = 0; z <= rows; z++)
    for (let x = 0; x <= columns; x++)
      positions.push((x / columns) * 2.6 - 1.3, 0, -1.3 + (z / rows) * 2.6);
  for (let z = 0; z < rows; z++)
    for (let x = 0; x < columns; x++) {
      const i = z * (columns + 1) + x;
      indices.push(
        i,
        i + 1,
        i + columns + 1,
        i + 1,
        i + columns + 2,
        i + columns + 1,
      );
    }
  const mesh = new Mesh("projected-ocean", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}
