/**
 * Sea animals built from code, as plain arrays (positions, triangle indices, per-vertex
 * colours). No Babylon here: the shapes can be tested for size, validity and facing
 * without a GPU, and `creature-kit.ts` turns them into one merged mesh each, like the
 * boats. Convention: about 1 unit long, the nose toward +X, the tail toward -X, up is +Y
 * and the animal is symmetric about the XY plane (Z is its width).
 */
export type V3 = readonly [number, number, number];
export type RGB = readonly [number, number, number];

/** What a mesh needs; `tail` is a separate part so it can swing about `pivot`. */
export interface Part {
  positions: number[];
  indices: number[];
  colors: number[];
}
export interface Creature {
  main: Part;
  tail?: { part: Part; pivot: V3 };
  /** Longest side of the creature in model units (for fitting to a view). */
  size: number;
  /** Where a hook goes through the animal (the mouth or the head), model units. */
  hook: V3;
}

// ----- Colour helpers -----

export const rgb = (value: number | string): RGB => {
  const n =
    typeof value === "string" ? parseInt(value.replace("#", ""), 16) : value;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const WHITE: RGB = [1, 1, 1];
const BLACK: RGB = [0.05, 0.1, 0.22];
export const lighter = (c: RGB, t: number) => mix(c, WHITE, t);
export const darker = (c: RGB, t: number) => mix(c, BLACK, t);

// ----- Builder -----

export class Builder {
  readonly part: Part = { positions: [], indices: [], colors: [] };

  get triangles() {
    return this.part.indices.length / 3;
  }

  private vertex(p: V3, c: RGB) {
    const at = this.part.positions.length / 3;
    this.part.positions.push(p[0], p[1], p[2]);
    this.part.colors.push(c[0], c[1], c[2], 1);
    return at;
  }

  /**
   * A skin over rings of points. Each ring has the same count; `wrap` joins the last
   * point of a ring to its first. Winding is chosen so the outside faces out when the
   * rings run from the tail toward the nose and each ring goes the way the caller builds
   * it (see `loft`).
   */
  grid(
    rings: V3[][],
    colour: (ring: number, seg: number, p: V3) => RGB,
    wrap = true,
  ) {
    const first = this.part.positions.length / 3;
    const count = rings[0]?.length ?? 0;
    rings.forEach((ring, i) =>
      ring.forEach((p, j) => this.vertex(p, colour(i, j, p))),
    );
    const segs = wrap ? count : count - 1;
    for (let i = 0; i < rings.length - 1; i++)
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % count;
        const a = first + i * count + j;
        const b = first + i * count + j1;
        const c = first + (i + 1) * count + j;
        const d = first + (i + 1) * count + j1;
        this.part.indices.push(a, b, c, b, d, c);
      }
  }

  /** Closes the end of a ring with a point (a cone), facing along `sign` of the axis. */
  cap(ring: V3[], apex: V3, colour: RGB, outward: boolean) {
    const apexIndex = this.vertex(apex, colour);
    const first = this.part.positions.length / 3;
    ring.forEach((p) => this.vertex(p, colour));
    for (let j = 0; j < ring.length; j++) {
      const a = first + j;
      const b = first + ((j + 1) % ring.length);
      this.part.indices.push(
        ...(outward ? [apexIndex, b, a] : [apexIndex, a, b]),
      );
    }
  }

  /**
   * A flat polygon, visible from both sides. Each side has its own vertices: sharing them
   * would add the two opposite normals and leave none, and the fin would be lit as white.
   */
  plate(points: V3[], colour: RGB) {
    const centre: V3 = [
      points.reduce((s, p) => s + p[0], 0) / points.length,
      points.reduce((s, p) => s + p[1], 0) / points.length,
      points.reduce((s, p) => s + p[2], 0) / points.length,
    ];
    for (const back of [false, true]) {
      const c = this.vertex(centre, colour);
      const first = this.part.positions.length / 3;
      points.forEach((p) => this.vertex(p, colour));
      for (let j = 0; j < points.length; j++) {
        const a = first + j;
        const b = first + ((j + 1) % points.length);
        this.part.indices.push(...(back ? [c, b, a] : [c, a, b]));
      }
    }
  }

  /**
   * A fin with rays: a strip from a base line to a tip line, membrane between thin darker
   * rays. Visible from both sides (each side has its own vertices, see `plate`).
   */
  finStrip(base: V3[], tip: V3[], membrane: RGB, ray: RGB) {
    const n = Math.min(base.length, tip.length);
    const quad = (a: V3, b: V3, c: V3, d: V3, colour: RGB) => {
      for (const back of [false, true]) {
        const i = this.vertex(a, colour);
        const j = this.vertex(b, colour);
        const k = this.vertex(c, colour);
        const l = this.vertex(d, colour);
        this.part.indices.push(
          ...(back ? [i, k, j, j, k, l] : [i, j, k, j, l, k]),
        );
      }
    };
    const lerp = (p: V3, q: V3, t: number): V3 => [
      p[0] + (q[0] - p[0]) * t,
      p[1] + (q[1] - p[1]) * t,
      p[2] + (q[2] - p[2]) * t,
    ];
    for (let i = 0; i < n - 1; i++) {
      // The membrane, and a thin ray along its leading edge.
      quad(base[i]!, base[i + 1]!, tip[i]!, tip[i + 1]!, membrane);
      quad(
        base[i]!,
        lerp(base[i]!, base[i + 1]!, 0.16),
        tip[i]!,
        lerp(tip[i]!, tip[i + 1]!, 0.16),
        ray,
      );
    }
    const last = n - 1;
    const before = Math.max(0, n - 2);
    quad(
      base[last]!,
      lerp(base[last]!, base[before]!, 0.12),
      tip[last]!,
      lerp(tip[last]!, tip[before]!, 0.12),
      ray,
    );
  }

  /** A fan of rays from one root (a tail, a pectoral fin). */
  fan(root: V3, tips: V3[], membrane: RGB, ray: RGB) {
    this.finStrip(
      tips.map(() => root),
      tips,
      membrane,
      ray,
    );
  }

  ellipsoid(
    centre: V3,
    radius: V3,
    colour: RGB | ((p: V3) => RGB),
    rings = 7,
    segs = 10,
  ) {
    const lines: V3[][] = [];
    for (let i = 1; i < rings; i++) {
      const v = (i / rings) * Math.PI;
      const ring: V3[] = [];
      for (let j = 0; j < segs; j++) {
        const u = (j / segs) * Math.PI * 2;
        ring.push([
          centre[0] + radius[0] * Math.cos(v),
          centre[1] + radius[1] * Math.sin(v) * Math.cos(u),
          centre[2] + radius[2] * Math.sin(v) * Math.sin(u),
        ]);
      }
      lines.push(ring);
    }
    const pick = (p: V3) => (typeof colour === "function" ? colour(p) : colour);
    this.grid(lines, (_i, _j, p) => pick(p));
    const first = lines[0]!;
    const last = lines[lines.length - 1]!;
    this.cap(
      first,
      [centre[0] + radius[0], centre[1], centre[2]],
      pick([centre[0] + radius[0], centre[1], centre[2]]),
      true,
    );
    this.cap(
      last,
      [centre[0] - radius[0], centre[1], centre[2]],
      pick([centre[0] - radius[0], centre[1], centre[2]]),
      false,
    );
  }

  /** A tapering tube along a path (legs, arms, antennae, a seahorse body). */
  tube(
    path: V3[],
    radius: (t: number) => number,
    colour: RGB | ((t: number) => RGB),
    segs = 6,
  ) {
    const rings: V3[][] = [];
    for (let i = 0; i < path.length; i++) {
      const prev = path[Math.max(0, i - 1)]!;
      const next = path[Math.min(path.length - 1, i + 1)]!;
      const tangent = norm(sub(next, prev));
      // Any perpendicular pair around the tangent.
      const helper: V3 = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const side = norm(cross(tangent, helper));
      const up = cross(side, tangent);
      const r = radius(i / Math.max(1, path.length - 1));
      const p = path[i]!;
      const ring: V3[] = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        ring.push([
          p[0] + (side[0] * Math.cos(a) + up[0] * Math.sin(a)) * r,
          p[1] + (side[1] * Math.cos(a) + up[1] * Math.sin(a)) * r,
          p[2] + (side[2] * Math.cos(a) + up[2] * Math.sin(a)) * r,
        ]);
      }
      rings.push(ring);
    }
    const pick = (t: number) =>
      typeof colour === "function" ? colour(t) : colour;
    this.grid(rings, (i) => pick(i / Math.max(1, rings.length - 1)));
    const end = path[path.length - 1]!;
    const start = path[0]!;
    this.cap(rings[rings.length - 1]!, end, pick(1), true);
    this.cap(rings[0]!, start, pick(0), false);
  }

  /**
   * A body along X from the nose (+X) to the tail (-X). Each station gives its x, its
   * half-width (Z), half-height above and below the centre line, and an optional lift.
   * The ends are closed with a point.
   */
  loft(
    stations: Station[],
    segs: number,
    colour: (station: number, angle: number) => RGB,
  ) {
    const rings: V3[][] = stations.map((s) => {
      const ring: V3[] = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const c = Math.cos(a);
        const half = c >= 0 ? s.top : s.bottom;
        ring.push([s.x, (s.lift ?? 0) + half * c, s.width * Math.sin(a)]);
      }
      return ring;
    });
    this.grid(rings, (i, j) => colour(i, (j / segs) * Math.PI * 2));
    const nose = stations[0]!;
    const tail = stations[stations.length - 1]!;
    this.cap(
      rings[0]!,
      [nose.x + (nose.cap ?? 0.02), nose.lift ?? 0, 0],
      colour(0, 0),
      true,
    );
    this.cap(
      rings[rings.length - 1]!,
      [tail.x - (tail.cap ?? 0.01), tail.lift ?? 0, 0],
      colour(stations.length - 1, 0),
      false,
    );
  }
}

export interface Station {
  x: number;
  width: number;
  top: number;
  bottom: number;
  lift?: number;
  /** How far past the end the closing point sits. */
  cap?: number;
}

// ----- Small vector maths -----

export const sub = (a: V3, b: V3): V3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const add = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
/** Points along a smooth curve through `keys` (Catmull-Rom), `n` points. */
export function curve(keys: V3[], n: number): V3[] {
  const out: V3[] = [];
  const at = (i: number) => keys[Math.min(keys.length - 1, Math.max(0, i))]!;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(t));
    const f = t - i;
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c = (a: number, b: number, c2: number, d: number) =>
      0.5 *
      (2 * b +
        (-a + c2) * f +
        (2 * a - 5 * b + 4 * c2 - d) * f * f +
        (-a + 3 * b - 3 * c2 + d) * f * f * f);
    out.push([
      c(p0[0], p1[0], p2[0], p3[0]),
      c(p0[1], p1[1], p2[1], p3[1]),
      c(p0[2], p1[2], p2[2], p3[2]),
    ]);
  }
  return out;
}

/**
 * A smooth curve through key values `[position, value]` (monotone cubic, so it never
 * overshoots between keys): profiles read as one flowing outline, not a chain of bumps.
 */
export function sample(
  keys: readonly (readonly [number, number])[],
  x: number,
) {
  const n = keys.length;
  if (x <= keys[0]![0]) return keys[0]![1];
  if (x >= keys[n - 1]![0]) return keys[n - 1]![1];
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = xs
    .slice(1)
    .map((v, i) => (ys[i + 1]! - ys[i]!) / (v - xs[i]! || 1));
  const m = ys.map((_, i) =>
    i === 0
      ? d[0]!
      : i === n - 1
        ? d[n - 2]!
        : d[i - 1]! * d[i]! <= 0
          ? 0
          : (d[i - 1]! + d[i]!) / 2,
  );
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i]! / d[i]!;
      const b = m[i + 1]! / d[i]!;
      const sum = a * a + b * b;
      if (sum > 9) {
        const t = 3 / Math.sqrt(sum);
        m[i] = t * a * d[i]!;
        m[i + 1] = t * b * d[i]!;
      }
    }
  }
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]!) i++;
  const h = xs[i + 1]! - xs[i]!;
  const t = (x - xs[i]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i]! +
    (t3 - 2 * t2 + t) * h * m[i]! +
    (-2 * t3 + 3 * t2) * ys[i + 1]! +
    (t3 - t2) * h * m[i + 1]!
  );
}

// ----- Validation helpers (also used by tests) -----

export function bounds(part: Part) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < part.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, part.positions[i + k]!);
      max[k] = Math.max(max[k]!, part.positions[i + k]!);
    }
  return { min, max };
}
export const triangleCount = (part: Part) => part.indices.length / 3;

/** Rotates a creature a quarter turn about X: what lay flat (a ray, a starfish) shows its back to a viewer at -Z. */
export function standUp(creature: Creature): Creature {
  const turn = (v: V3): V3 => [v[0], v[2], -v[1]];
  const part = (p: Part): Part => {
    const positions = [...p.positions];
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]!;
      positions[i + 1] = positions[i + 2]!;
      positions[i + 2] = -y;
    }
    return { positions, indices: p.indices, colors: p.colors };
  };
  return {
    main: part(creature.main),
    tail: creature.tail
      ? { part: part(creature.tail.part), pivot: turn(creature.tail.pivot) }
      : undefined,
    size: creature.size,
    hook: turn(creature.hook),
  };
}

/** Deterministic pseudo-random number in [0, 1) from two integers (for spots). */
export function noise(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1)));
  return t * t * (3 - 2 * t);
};
