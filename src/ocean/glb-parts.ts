import type { Creature, Part, V3 } from "./creature-geometry.ts";

/**
 * The sea animals (public/models/fish-<species id>.glb, one file per species, made from models of
 * the Blender community by tools/blender/sea_import.py) as plain arrays, with no WebGL and no
 * Babylon: the 3D scene (creature-kit.ts) and the fish store's 2D thumbnails (app/fish-thumb.ts)
 * read the same data, and tests read the real files.
 *
 * A file has a root `fish` with two children: `body` (a mesh) and `hook` (an empty node, its
 * translation is where a hook goes). The nose points to +X, up is +Y, the longest side is 1 and the
 * animal is centred on its origin. The scene is right-handed, so no axis is flipped: the file's
 * (x, y, z) is the game's (x, y, z). Every vertex colour is final (an sRGB byte triple written as
 * byte * 257 in an unsigned-short COLOR_0, baked from the model's textures): nothing is recoloured
 * per species. The mesh keeps the triangle count of the model it came from. A file may also hold a
 * `tail` mesh (its node translation is its pivot, its vertices relative to it) that the game swings;
 * the present models are single meshes and have none.
 */
/** The file of a species: one per species id. */
export const fishFile = (id: string): string => `fish-${id}.glb`;

/** Every file of the given species, for preloading. */
export const allFishFiles = (ids: readonly string[]): string[] =>
  ids.map(fishFile);

/** One mesh as read from a file: model-space positions, normals and final vertex colours. */
export interface FishPart {
  /** Model space (a tail's own pivot is added in, so it can be drawn or measured as it is). */
  positions: number[];
  normals: number[];
  indices: number[];
  /** RGBA 0..1 as in the file. */
  colors: number[];
}

export interface FishTemplate {
  main: FishPart;
  tail?: { part: FishPart; pivot: V3 };
  hook: V3;
  /** Longest side of the whole animal. */
  size: number;
  /** Axis-aligned bounds of body and tail together. */
  min: V3;
  max: V3;
}

interface GltfJson {
  scenes?: { nodes?: number[] }[];
  nodes: {
    name?: string;
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      mode?: number;
    }[];
  }[];
  accessors: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    normalized?: boolean;
    type: string;
  }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
}

const COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

/** Reads a binary glTF: its JSON and the first binary chunk. Throws on anything malformed. */
function readContainer(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67)
    throw new Error("not a GLB file");
  if (view.getUint32(8, true) !== bytes.byteLength)
    throw new Error("GLB length does not match the file");
  let json: GltfJson | undefined;
  let bin: DataView | undefined;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const start = at + 8;
    if (start + length > bytes.byteLength)
      throw new Error("GLB chunk overruns");
    if (type === 0x4e4f534a)
      json = JSON.parse(
        new TextDecoder().decode(bytes.subarray(start, start + length)),
      ) as GltfJson;
    else if (type === 0x004e4942 && !bin)
      bin = new DataView(bytes.buffer, bytes.byteOffset + start, length);
    at = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) throw new Error("GLB has no JSON or no binary chunk");
  return { json, bin };
}

/** An accessor's values as plain numbers; normalised integers are divided by their range. */
function readAccessor(json: GltfJson, bin: DataView, index: number) {
  const accessor = json.accessors[index];
  if (!accessor) throw new Error(`no accessor ${index}`);
  const viewInfo = json.bufferViews[accessor.bufferView];
  if (!viewInfo) throw new Error(`no buffer view ${accessor.bufferView}`);
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[accessor.componentType];
  const components = COMPONENTS[accessor.type];
  if (!size || !components) throw new Error("unsupported accessor");
  const stride = viewInfo.byteStride ?? size * components;
  const base = (viewInfo.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const range = accessor.normalized
    ? accessor.componentType === 5123
      ? 65535
      : 255
    : 1;
  const out = new Array<number>(accessor.count * components);
  for (let i = 0; i < accessor.count; i++)
    for (let k = 0; k < components; k++) {
      const at = base + i * stride + k * size;
      if (at + size > bin.byteLength) throw new Error("accessor overruns");
      const value =
        accessor.componentType === 5126
          ? bin.getFloat32(at, true)
          : accessor.componentType === 5125
            ? bin.getUint32(at, true)
            : accessor.componentType === 5123
              ? bin.getUint16(at, true)
              : bin.getUint8(at);
      out[i * components + k] = value / range;
    }
  return { values: out, components };
}

/** All primitives of a mesh as one part, `shift` added to every position. */
function readMesh(
  json: GltfJson,
  bin: DataView,
  meshIndex: number,
  shift: V3,
): FishPart {
  const mesh = json.meshes[meshIndex];
  if (!mesh) throw new Error(`no mesh ${meshIndex}`);
  const part: FishPart = {
    positions: [],
    normals: [],
    indices: [],
    colors: [],
  };
  for (const primitive of mesh.primitives) {
    if (primitive.mode !== undefined && primitive.mode !== 4)
      throw new Error("only triangle lists are supported");
    const offset = part.positions.length / 3;
    const position = readAccessor(json, bin, primitive.attributes.POSITION!);
    const normal = readAccessor(json, bin, primitive.attributes.NORMAL!);
    const colour = readAccessor(json, bin, primitive.attributes.COLOR_0!);
    if (primitive.indices === undefined) throw new Error("no triangle indices");
    const index = readAccessor(json, bin, primitive.indices);
    for (let i = 0; i < position.values.length; i += 3)
      part.positions.push(
        position.values[i]! + shift[0],
        position.values[i + 1]! + shift[1],
        position.values[i + 2]! + shift[2],
      );
    part.normals.push(...normal.values);
    const count = position.values.length / 3;
    for (let i = 0; i < count; i++) {
      const r = colour.values[i * colour.components]!;
      const g = colour.values[i * colour.components + 1]!;
      const b = colour.values[i * colour.components + 2]!;
      part.colors.push(r, g, b, 1);
    }
    for (const value of index.values) part.indices.push(offset + value);
  }
  return part;
}

const vec3 = (value: number[] | undefined, fallback: V3): V3 =>
  value && value.length === 3 ? [value[0]!, value[1]!, value[2]!] : fallback;

/** Reads one animal file (`body`, optional `tail`, `hook` under a root). Throws if it is not one. */
export function parseFishGlb(data: ArrayBuffer | Uint8Array): FishTemplate {
  const { json, bin } = readContainer(data);
  const named = (name: string) => json.nodes.find((n) => n.name === name);
  const body = named("body");
  const tail = named("tail");
  const hook = named("hook");
  if (body?.mesh === undefined) throw new Error("no `body` mesh node");
  if (!hook) throw new Error("no `hook` node");
  const zero: V3 = [0, 0, 0];
  const main = readMesh(json, bin, body.mesh, vec3(body.translation, zero));
  let tailPart: FishTemplate["tail"];
  if (tail?.mesh !== undefined) {
    const pivot = vec3(tail.translation, zero);
    tailPart = { part: readMesh(json, bin, tail.mesh, pivot), pivot };
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of [main, tailPart?.part])
    if (part)
      for (let i = 0; i < part.positions.length; i++) {
        const k = i % 3;
        min[k] = Math.min(min[k]!, part.positions[i]!);
        max[k] = Math.max(max[k]!, part.positions[i]!);
      }
  return {
    main,
    tail: tailPart,
    hook: vec3(hook.translation, zero),
    size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
    min,
    max,
  };
}

/**
 * Every mesh node of a GLB as ONE part (a node's translation added in, no rotation or scale: the
 * files of boats and the shipyard bake those into their vertices), with the final vertex colours.
 * For models that are drawn as a whole or shown as a still picture (the shipyard, the boats of the
 * shipyard's cards); `skip` leaves out nodes by name (a boat's lantern glass, say). Throws if
 * there is no mesh at all.
 */
export function parseMeshesGlb(
  data: ArrayBuffer | Uint8Array,
  skip: readonly string[] = [],
): { main: FishPart; min: V3; max: V3; size: number } {
  const { json, bin } = readContainer(data);
  const main: FishPart = {
    positions: [],
    normals: [],
    indices: [],
    colors: [],
  };
  const zero: V3 = [0, 0, 0];
  for (const node of json.nodes) {
    if (node.mesh === undefined || skip.includes(node.name ?? "")) continue;
    const part = readMesh(json, bin, node.mesh, vec3(node.translation, zero));
    const offset = main.positions.length / 3;
    for (const key of ["positions", "normals", "colors"] as const)
      for (const value of part[key]) main[key].push(value);
    for (const index of part.indices) main.indices.push(offset + index);
  }
  if (!main.indices.length) throw new Error("GLB has no mesh");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < main.positions.length; i++) {
    const k = i % 3;
    min[k] = Math.min(min[k]!, main.positions[i]!);
    max[k] = Math.max(max[k]!, main.positions[i]!);
  }
  return {
    main,
    min,
    max,
    size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
  };
}

/**
 * The model as the game's `Creature`. Positions, normals, colours and indices are the template's
 * (shared, read-only): every animal of a species draws from the same arrays.
 */
export function creatureOf(template: FishTemplate): Creature {
  const part = (p: FishPart): Part => ({
    positions: p.positions,
    normals: p.normals,
    indices: p.indices,
    colors: p.colors,
  });
  return {
    main: part(template.main),
    tail: template.tail
      ? { part: part(template.tail.part), pivot: template.tail.pivot }
      : undefined,
    size: template.size,
    hook: template.hook,
  };
}
