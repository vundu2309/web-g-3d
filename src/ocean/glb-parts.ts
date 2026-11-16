import {
  darker,
  lighter,
  rgb,
  type Creature,
  type Part,
  type RGB,
  type V3,
} from "./creature-geometry.ts";
import { lookOf, type CreatureKind, type Look } from "./creatures.ts";

/**
 * The sea animals from Blender (public/models/fish-*.glb, built by tools/blender/fish.py) as plain
 * arrays, with no WebGL and no Babylon: the 3D scene (creature-kit.ts) and the fish store's 2D
 * thumbnails (app/fish-thumb.ts) read the same data, and tests read the real files.
 *
 * A file has a root `fish` with three children: `body` (a mesh; the fins and eyes are part of it),
 * `tail` (a mesh whose node translation IS its pivot, its vertices are relative to it; absent on
 * the crab and the starfish) and `hook` (an empty node, its translation is where a hook goes). The
 * nose points to +X and up is +Y, as in the code-built animals. The scene is right-handed, so no
 * axis is flipped: the file's (x, y, z) is the game's (x, y, z).
 *
 * COLOUR ROLES. Every vertex colour is an sRGB byte triple written as byte * 257 in an unsigned-short
 * COLOR_0. Four triples are not colours but ROLES (flat per triangle); the game replaces them with
 * the species' colours when the file is loaded. Every other colour (the pupil, the mouth, the cheek
 * blush, the eye white and its glint) is fixed and stays as it is.
 */
export const FISH_ROLES = {
  body: [255, 0, 1],
  fin: [0, 255, 1],
  belly: [1, 0, 255],
  mark: [255, 255, 1],
} as const;
export type FishRole = keyof typeof FISH_ROLES;
const ROLE_NAMES = Object.keys(FISH_ROLES) as FishRole[];

/** The sixteen body plans, one file each (`fish-<plan>.glb`), plus two species with a file of their own. */
export const FISH_OWN_FILES: Readonly<Record<string, string>> = {
  /** Round, with white bars (the plan's own pattern is mottled). */
  "ca-he": "fish-ca-he.glb",
  /** Torpedo, with no stripes (the plan's own pattern is wavy bars). */
  "ca-ngu": "fish-ca-ngu.glb",
};

/** The file of a body plan, or of a species that has one of its own (`variant` is its id). */
export function fishFile(kind: CreatureKind, variant?: string): string {
  return (
    (variant !== undefined ? FISH_OWN_FILES[variant] : undefined) ??
    `fish-${kind}.glb`
  );
}

/** Every file, for preloading: one per plan and one per species with its own. */
export function allFishFiles(kinds: readonly CreatureKind[]): string[] {
  return [
    ...kinds.map((kind) => fishFile(kind)),
    ...Object.values(FISH_OWN_FILES),
  ];
}

/** One mesh as read from a file: model-space positions and the role of every vertex. */
export interface FishPart {
  /** Model space (a tail's own pivot is added in, so it can be drawn or measured as it is). */
  positions: number[];
  normals: number[];
  indices: number[];
  /** RGBA 0..1 as in the file (roles still carry their sentinel colours). */
  colors: number[];
  /** Per vertex: 0 fixed colour, else 1 + the index of the role in `FISH_ROLES`. */
  roles: Uint8Array;
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

/** The role of one vertex colour (0..1 channels), 0 for a fixed colour. */
function roleOf(r: number, g: number, b: number): number {
  const bytes = [r, g, b].map((v) => Math.round(v * 255));
  for (let i = 0; i < ROLE_NAMES.length; i++) {
    const want = FISH_ROLES[ROLE_NAMES[i]!];
    if (bytes[0] === want[0] && bytes[1] === want[1] && bytes[2] === want[2])
      return i + 1;
  }
  return 0;
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
    roles: new Uint8Array(0),
  };
  const roles: number[] = [];
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
      roles.push(roleOf(r, g, b));
    }
    for (const value of index.values) part.indices.push(offset + value);
  }
  part.roles = Uint8Array.from(roles);
  return part;
}

const vec3 = (value: number[] | undefined, fallback: V3): V3 =>
  value && value.length === 3 ? [value[0]!, value[1]!, value[2]!] : fallback;

/** Reads one fish file (`body`, optional `tail`, `hook` under a root). Throws if it is not one. */
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

/** The four role colours of a species, 0..1. */
export type FishColours = Record<FishRole, RGB>;

/**
 * The species' colours for the four roles, with the same helpers and constants as the code-built
 * animals (creatures.ts): the body and fin colours come from the table; the belly is the Look's or
 * a pale version of the body; the marking is the Look's (the body plan's own default when the
 * species has none, such as the slim fish's pale stripe) or a darker body colour.
 */
export function fishColours(
  kind: CreatureKind,
  bodyHex: string,
  finHex: string,
  look?: Look,
): FishColours {
  const spec = lookOf(kind, look);
  const body = rgb(bodyHex);
  return {
    body,
    fin: rgb(finHex),
    belly: spec.belly ? rgb(spec.belly) : lighter(body, 0.62),
    mark: spec.mark ? rgb(spec.mark) : darker(body, 0.45),
  };
}

/** A part's colours with every role vertex replaced; fixed colours and alpha are kept. */
export function recolour(part: FishPart, colours: FishColours): number[] {
  const out = part.colors.slice();
  for (let v = 0; v < part.roles.length; v++) {
    const role = part.roles[v]!;
    if (role === 0) continue;
    const colour = colours[ROLE_NAMES[role - 1]!];
    out[v * 4] = colour[0];
    out[v * 4 + 1] = colour[1];
    out[v * 4 + 2] = colour[2];
  }
  return out;
}

const painted = (part: FishPart, colours: FishColours): Part => ({
  positions: part.positions,
  normals: part.normals,
  indices: part.indices,
  colors: recolour(part, colours),
});

/**
 * The model as the game's `Creature` (the shape the code-built animals have), painted with the
 * species' colours. Positions, normals and indices are the template's (shared, read-only); only the
 * colours are new.
 */
export function paintFish(
  template: FishTemplate,
  colours: FishColours,
): Creature {
  return {
    main: painted(template.main, colours),
    tail: template.tail
      ? {
          part: painted(template.tail.part, colours),
          pivot: template.tail.pivot,
        }
      : undefined,
    size: template.size,
    hook: template.hook,
  };
}
