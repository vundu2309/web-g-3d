/**
 * The advertising banner a seaplane tows, as plain numbers (no Babylon, so tests read it
 * directly). A rope and a banner hang from the plane's tail and follow the PATH the plane has
 * flown (not its present heading), so on a turn the banner swings through the same curve and
 * trails a little behind it, as a real one does. Its tail flutters and sags a little.
 *
 * The geometry is one static layout (rows of two vertices, faces, uvs) and `fillBanner` moves the
 * vertices every frame: one mesh, one draw call per plane. The banner is drawn on both sides, and
 * the text is set so it reads correctly from either side (the back face runs the texture the
 * other way round).
 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export const BANNER = {
  /** How far behind the plane's centre its tail is, where the rope is tied (m). */
  tail: 4.1,
  /** The rope from the plane's tail to the banner (m), and the banner's length and height. */
  rope: 14,
  length: 38,
  height: 6,
  /** Rows of the banner (more rows, a smoother wave) and of the rope. */
  segments: 12,
  ropeSegments: 2,
  /** The rope's thickness (m). */
  ropeThick: 0.14,
  /** Flutter of the free end (m), its speed (rad/s) and wavelength factor (rad per m). */
  flutter: 1.1,
  flutterRate: 6,
  flutterWave: 0.55,
  /** How far the banner's free end sags (m). */
  sag: 0.9,
  /** Where the banner's text starts in the texture (v), and the rope's row (v). */
  textV0: 0.14,
  ropeV: 0.04,
  /** Samples of the path are kept this far apart (m). */
  step: 2,
} as const;

/** The path a plane has flown, newest first, from which the tow is hung. */
export class TowTrail {
  private head: Point3 = { x: 0, y: 0, z: 0 };
  private readonly samples: Point3[] = [];
  private readonly reach: number;

  constructor(
    reach = BANNER.tail + BANNER.rope + BANNER.length + 2 * BANNER.step,
  ) {
    this.reach = reach;
  }

  /** Lays the path straight behind a plane that is at (x, y, z) heading `heading` (it starts mid-flight). */
  prime(x: number, y: number, z: number, heading: number) {
    this.head = { x, y, z };
    this.samples.length = 0;
    const backX = -Math.sin(heading);
    const backZ = Math.cos(heading);
    for (let d = BANNER.step; d <= this.reach + BANNER.step; d += BANNER.step)
      this.samples.push({ x: x + backX * d, y, z: z + backZ * d });
  }

  /** Moves the plane's end of the path to (x, y, z) without adding a sample (the plane is between two steps). */
  follow(x: number, y: number, z: number) {
    this.head.x = x;
    this.head.y = y;
    this.head.z = z;
  }

  /** The plane is now at (x, y, z). */
  push(x: number, y: number, z: number) {
    this.head.x = x;
    this.head.y = y;
    this.head.z = z;
    const last = this.samples[0];
    if (
      !last ||
      Math.hypot(x - last.x, y - last.y, z - last.z) >= BANNER.step
    ) {
      this.samples.unshift({ x, y, z });
      // Keep just enough path to hang the whole tow from.
      let length = 0;
      let prev: Point3 = this.head;
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i]!;
        length += Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z);
        prev = s;
        if (length > this.reach + 2 * BANNER.step) {
          this.samples.length = i + 1;
          break;
        }
      }
    }
  }

  /** The point `distance` metres back along the path from the plane (extended straight past its end). */
  behind(distance: number, out: Point3): Point3 {
    let prev: Point3 = this.head;
    let left = Math.max(0, distance);
    let dx = 0;
    let dy = 0;
    let dz = 0;
    for (const s of this.samples) {
      dx = s.x - prev.x;
      dy = s.y - prev.y;
      dz = s.z - prev.z;
      const length = Math.hypot(dx, dy, dz);
      if (length >= left && length > 0) {
        const f = left / length;
        out.x = prev.x + dx * f;
        out.y = prev.y + dy * f;
        out.z = prev.z + dz * f;
        return out;
      }
      left -= length;
      prev = s;
    }
    const length = Math.hypot(dx, dy, dz) || 1;
    out.x = prev.x + (dx / length) * left;
    out.y = prev.y + (dy / length) * left;
    out.z = prev.z + (dz / length) * left;
    return out;
  }
}

/** One row of the tow: two vertices (top, bottom) for each face. */
export interface Row {
  /** Distance behind the plane (m). */
  d: number;
  /** Half the height (m). */
  half: number;
  /** 0 at the plane's end to 1 at the free end: how much the row flutters. */
  free: number;
  rope: boolean;
  /** Where along the texture the row is (0 at the banner's start to 1 at its free end). */
  u: number;
}
export interface BannerLayout {
  rows: Row[];
  /** Faces: the front of every row pair, then the back (reversed). */
  indices: number[];
  /** Per vertex: front vertices of all rows, then the back vertices. */
  uvs: number[];
  /** Vertices of one face set (the back set starts here). */
  half: number;
  vertices: number;
}

/** The static layout of a tow: a thin rope, then the banner. */
export function bannerLayout(): BannerLayout {
  const rows: Row[] = [];
  for (let j = 0; j <= BANNER.ropeSegments; j++)
    rows.push({
      d: BANNER.tail + (BANNER.rope * j) / BANNER.ropeSegments,
      half: BANNER.ropeThick / 2,
      free: 0,
      rope: true,
      u: 0.5,
    });
  for (let i = 0; i <= BANNER.segments; i++)
    rows.push({
      d: BANNER.tail + BANNER.rope + (BANNER.length * i) / BANNER.segments,
      half: BANNER.height / 2,
      free: i / BANNER.segments,
      rope: false,
      u: i / BANNER.segments,
    });
  const half = rows.length * 2;
  const indices: number[] = [];
  const uvs: number[] = [];
  // Vertex 2r is the top of row r, 2r+1 its bottom; the back face repeats them from `half`.
  for (const back of [false, true]) {
    for (const row of rows) {
      const u = row.u;
      const uu = back ? u : 1 - u;
      uvs.push(
        uu,
        row.rope ? BANNER.ropeV : 1,
        uu,
        row.rope ? BANNER.ropeV : BANNER.textV0,
      );
    }
  }
  const quad = (a: number, b: number, back: boolean) => {
    const offset = back ? half : 0;
    const t0 = offset + a * 2;
    const b0 = t0 + 1;
    const t1 = offset + b * 2;
    const b1 = t1 + 1;
    if (!back) indices.push(t0, b0, t1, b0, b1, t1);
    else indices.push(t0, t1, b0, b0, t1, b1);
  };
  for (const back of [false, true])
    for (let r = 0; r < rows.length - 1; r++) {
      // No face joins the end of the rope to the start of the banner.
      if (rows[r]!.rope !== rows[r + 1]!.rope) continue;
      quad(r, r + 1, back);
    }
  return { rows, indices, uvs, half, vertices: half * 2 };
}

const SCRATCH: Point3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
];

/** Moves every vertex of the layout to hang from the trail at `time` seconds (writes `out`, 3 floats per vertex). */
export function fillBanner(
  layout: BannerLayout,
  trail: TowTrail,
  time: number,
  out: Float32Array | number[],
) {
  const [p, a, b] = SCRATCH as [Point3, Point3, Point3];
  layout.rows.forEach((row, r) => {
    trail.behind(row.d, p);
    trail.behind(Math.max(0, row.d - 1.5), a);
    trail.behind(row.d + 1.5, b);
    // The sideways direction (to the plane's left) from the local direction of the path.
    let fx = a.x - b.x;
    let fz = a.z - b.z;
    const length = Math.hypot(fx, fz) || 1;
    fx /= length;
    fz /= length;
    const lx = -fz;
    const lz = fx;
    const swing = row.rope
      ? 0
      : Math.sin(time * BANNER.flutterRate - row.d * BANNER.flutterWave) *
        BANNER.flutter *
        row.free ** 1.3;
    const sag = row.rope ? 0 : BANNER.sag * row.free ** 2;
    const x = p.x + lx * swing;
    const z = p.z + lz * swing;
    const y = p.y - sag;
    for (const face of [0, 1]) {
      const top = (face * layout.half + r * 2) * 3;
      out[top] = x;
      out[top + 1] = y + row.half;
      out[top + 2] = z;
      out[top + 3] = x;
      out[top + 4] = y - row.half;
      out[top + 5] = z;
    }
  });
}
