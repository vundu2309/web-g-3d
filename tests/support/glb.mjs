import { readFileSync } from "node:fs";

/**
 * Reads a GLB file as data, so a test can check a model without a browser: the JSON, and a
 * reader for any accessor (positions, normalised vertex colours, indices).
 */
export function readGlb(path) {
  const data = readFileSync(new URL(`../../${path}`, import.meta.url));
  if (data.toString("ascii", 0, 4) !== "glTF")
    throw new Error(`${path}: not a GLB`);
  if (data.readUInt32LE(8) !== data.length)
    throw new Error(`${path}: bad length`);
  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
  const bin = data.subarray(20 + jsonLength + 8);
  const TYPES = {
    5126: Float32Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5121: Uint8Array,
  };
  const COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  /** The accessor's values as plain numbers (colours are divided by their range when normalised). */
  function accessor(index) {
    const acc = gltf.accessors[index];
    const view = gltf.bufferViews[acc.bufferView];
    const Type = TYPES[acc.componentType];
    const comps = COUNTS[acc.type];
    const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = view.byteStride ?? comps * Type.BYTES_PER_ELEMENT;
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.length);
    const get = {
      5126: (o) => dv.getFloat32(o, true),
      5123: (o) => dv.getUint16(o, true),
      5125: (o) => dv.getUint32(o, true),
      5121: (o) => dv.getUint8(o),
    }[acc.componentType];
    const range = acc.normalized
      ? { 5123: 65535, 5121: 255 }[acc.componentType]
      : 1;
    const out = new Float64Array(acc.count * comps);
    for (let i = 0; i < acc.count; i++)
      for (let k = 0; k < comps; k++)
        out[i * comps + k] =
          get(base + i * stride + k * Type.BYTES_PER_ELEMENT) / range;
    return { data: out, comps, count: acc.count, accessor: acc };
  }
  return { gltf, accessor };
}
