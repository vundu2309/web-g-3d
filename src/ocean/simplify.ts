import type { Part } from "./creature-geometry.ts";

/**
 * A coarser copy of a mesh, for drawing an animal that is far away (wildlife.ts keeps the whole
 * model for when it is near). Vertex clustering: the model's box is cut into cubes, every vertex
 * of a cube becomes one vertex (the average of them) and the triangles that collapse are dropped.
 * It keeps the outline and the colours and is cheap and exact in its count, which is why it is used
 * instead of a smarter simplifier: the copy is only seen from far away. The original is never
 * changed. Pure maths with no Babylon.
 */
function cluster(part: Part, cell: number, origin: readonly number[]) {
  const vertices = part.positions.length / 3;
  const span = 1 << 20;
  const sums = new Map<number, number>();
  const owner = new Int32Array(vertices);
  const sum: number[] = [];
  const count: number[] = [];
  for (let v = 0; v < vertices; v++) {
    const ix = Math.floor((part.positions[v * 3]! - origin[0]!) / cell);
    const iy = Math.floor((part.positions[v * 3 + 1]! - origin[1]!) / cell);
    const iz = Math.floor((part.positions[v * 3 + 2]! - origin[2]!) / cell);
    const key = (ix * 4096 + iy) * 4096 + iz;
    let id = sums.get(key);
    if (id === undefined) {
      id = count.length;
      sums.set(key, id);
      count.push(0);
      for (let k = 0; k < 9; k++) sum.push(0);
    }
    owner[v] = id;
    count[id]! += 1;
    const at = id * 9;
    sum[at]! += part.positions[v * 3]!;
    sum[at + 1]! += part.positions[v * 3 + 1]!;
    sum[at + 2]! += part.positions[v * 3 + 2]!;
    sum[at + 3]! += part.normals?.[v * 3] ?? 0;
    sum[at + 4]! += part.normals?.[v * 3 + 1] ?? 0;
    sum[at + 5]! += part.normals?.[v * 3 + 2] ?? 0;
    sum[at + 6]! += part.colors[v * 4]!;
    sum[at + 7]! += part.colors[v * 4 + 1]!;
    sum[at + 8]! += part.colors[v * 4 + 2]!;
  }
  void span;
  const n = count.length;
  const seen = new Set<number>();
  const indices: number[] = [];
  for (let t = 0; t < part.indices.length; t += 3) {
    const a = owner[part.indices[t]!]!;
    const b = owner[part.indices[t + 1]!]!;
    const c = owner[part.indices[t + 2]!]!;
    if (a === b || b === c || a === c) continue;
    // The same triangle can come out twice (a thin fold): keep one.
    const lo = Math.min(a, b, c);
    const hi = Math.max(a, b, c);
    const key = (lo * n + (a + b + c - lo - hi)) * n + hi;
    if (seen.has(key)) continue;
    seen.add(key);
    indices.push(a, b, c);
  }
  return { n, count, sum, indices };
}

/**
 * The part with at most `target` triangles (or the original if it already has that few). Finds the
 * finest cube size that gets under the target. Normals, if the part has them, are re-averaged;
 * colours are averaged and kept opaque.
 */
export function simplifyPart(part: Part, target: number): Part {
  if (part.indices.length / 3 <= target) return part;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < part.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, part.positions[i + k]!);
      max[k] = Math.max(max[k]!, part.positions[i + k]!);
    }
  const size = Math.max(
    max[0]! - min[0]!,
    max[1]! - min[1]!,
    max[2]! - min[2]!,
  );
  // 4096 cubes along the longest side is the most the cluster keys can tell apart.
  let low = size / 4000;
  let high = size / 2;
  let best = cluster(part, high, min);
  for (let step = 0; step < 14; step++) {
    const mid = (low + high) / 2;
    const tried = cluster(part, mid, min);
    if (tried.indices.length / 3 <= target) {
      best = tried;
      high = mid;
    } else low = mid;
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  for (let id = 0; id < best.n; id++) {
    const at = id * 9;
    const k = best.count[id]!;
    positions.push(
      best.sum[at]! / k,
      best.sum[at + 1]! / k,
      best.sum[at + 2]! / k,
    );
    const nx = best.sum[at + 3]!;
    const ny = best.sum[at + 4]!;
    const nz = best.sum[at + 5]!;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / length, ny / length, nz / length);
    colors.push(
      best.sum[at + 6]! / k,
      best.sum[at + 7]! / k,
      best.sum[at + 8]! / k,
      1,
    );
  }
  return {
    positions,
    normals: part.normals ? normals : undefined,
    colors,
    indices: best.indices,
  };
}
