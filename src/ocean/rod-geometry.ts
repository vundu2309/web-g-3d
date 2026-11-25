import type { Creature, Part } from "./creature-geometry.ts";
import { rodColour } from "./rod-colours.ts";
import {
  GUIDE_INNER,
  GUIDE_OUTER,
  GUIDE_SIDES,
  ROD_SIDES,
  joined,
  radiusAt,
  rodPlan,
  type ReelPart,
} from "./rod-plan.ts";
import { ROD_LENGTH } from "./rod.ts";

/**
 * A rod as plain triangles, for its picture in the market (app/item-thumb.ts draws it with the
 * same painter as the fish store, creature-thumb.ts): the blank and its guides lofted through the
 * plan's rings and the reel built from the plan's parts, in the colours of the shared palette
 * (rod-colours.ts). No Babylon, so a test reads it. It is drawn straight (the in-game rod bends
 * and curves; a picture is a still) and leaned up a little, with the rod along +X like a fish's
 * nose, the reel hanging down and its face turned to the viewer.
 *
 * Everything below works in the rod's own frame, `[a, d, b]`: `a` along the rod from the butt,
 * `d` down (the reel's side) and `b` toward the stern, where the viewer is. `Builder.vertex` is
 * the one place that turns that frame into the picture's.
 */
type V3 = [number, number, number];

/** How far the rod is leaned up in the picture (rad). */
const LEAN = 0.6;

class Builder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  /** A vertex at `at` with outward direction `n`, both in the rod's frame. */
  vertex(at: V3, n: V3, colour: V3): number {
    const c = Math.cos(LEAN);
    const s = Math.sin(LEAN);
    // The picture's frame: x along the rod, y up (so down is -y), z away from the viewer (so the
    // stern is -z), then the whole rod leaned up by LEAN about z.
    const to = (a: number, d: number, b: number): V3 => [
      a * c + d * s,
      a * s - d * c,
      -b,
    ];
    this.positions.push(...to(...at));
    this.normals.push(...to(...n));
    this.colors.push(colour[0], colour[1], colour[2], 1);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number) {
    this.indices.push(a, b, c);
  }

  /** A quad a-b-c-d (in order round it) as two triangles. */
  quad(a: number, b: number, c: number, d: number) {
    this.indices.push(a, b, c, a, c, d);
  }
}

const rgb = (hex: number): V3 => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

/** The two directions across each axis of the rod's frame. */
const ACROSS: Record<"a" | "d" | "b", [V3, V3]> = {
  a: [
    [0, 1, 0],
    [0, 0, 1],
  ],
  d: [
    [1, 0, 0],
    [0, 0, 1],
  ],
  b: [
    [1, 0, 0],
    [0, 1, 0],
  ],
};
const ALONG: Record<"a" | "d" | "b", V3> = {
  a: [1, 0, 0],
  d: [0, 1, 0],
  b: [0, 0, 1],
};

const plus = (p: V3, q: V3, k = 1): V3 => [
  p[0] + q[0] * k,
  p[1] + q[1] * k,
  p[2] + q[2] * k,
];

/** A round plate or tube whose axis is `axis`, with flat ends. */
function cylinder(
  out: Builder,
  centre: V3,
  axis: "a" | "d" | "b",
  radius: number,
  length: number,
  sides: number,
  colour: V3,
) {
  const [u, v] = ACROSS[axis];
  const w = ALONG[axis];
  const rim = (k: number): V3 => {
    const angle = (k / sides) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [0, 1, 2].map((i) => u[i]! * c + v[i]! * s) as V3;
  };
  const side: number[][] = [];
  for (let k = 0; k < sides; k++) {
    const dir = rim(k);
    side.push(
      [-0.5, 0.5].map((end) =>
        out.vertex(
          plus(plus(centre, w, length * end), dir, radius),
          dir,
          colour,
        ),
      ),
    );
  }
  for (let k = 0; k < sides; k++) {
    const n = (k + 1) % sides;
    out.quad(side[k]![0]!, side[n]![0]!, side[n]![1]!, side[k]![1]!);
  }
  for (const end of [-0.5, 0.5]) {
    const normal: V3 = [
      w[0] * Math.sign(end),
      w[1] * Math.sign(end),
      w[2] * Math.sign(end),
    ];
    const middle = out.vertex(plus(centre, w, length * end), normal, colour);
    const fan: number[] = [];
    for (let k = 0; k < sides; k++)
      fan.push(
        out.vertex(
          plus(plus(centre, w, length * end), rim(k), radius),
          normal,
          colour,
        ),
      );
    for (let k = 0; k < sides; k++)
      out.triangle(middle, fan[k]!, fan[(k + 1) % sides]!);
  }
}

/** A low ball (an eight-sided belt and two poles), squashed along `b` by `flat`. */
function ball(
  out: Builder,
  centre: V3,
  diameter: number,
  flat: number,
  colour: V3,
) {
  const r = diameter / 2;
  const at = (a: number, d: number, b: number) =>
    out.vertex(
      [centre[0] + a * r, centre[1] + d * r, centre[2] + b * r * flat],
      [a, d, b],
      colour,
    );
  const top = at(0, 0, 1);
  const bottom = at(0, 0, -1);
  const belt: number[] = [];
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2;
    belt.push(at(Math.cos(angle), Math.sin(angle), 0));
  }
  for (let k = 0; k < 8; k++) {
    const n = (k + 1) % 8;
    out.triangle(top, belt[k]!, belt[n]!);
    out.triangle(bottom, belt[n]!, belt[k]!);
  }
}

/**
 * The crank: a flat bar of `size` [length, width, depth] about `centre`, its length running along
 * `down` turned by `turn` toward the butt (the reel's own swing, as the drawn rod has it).
 */
function bar(out: Builder, centre: V3, size: V3, turn: number, colour: V3) {
  const along: V3 = [-Math.sin(turn), Math.cos(turn), 0];
  const across: V3 = [Math.cos(turn), Math.sin(turn), 0];
  const corner = (i: number, j: number, k: number): V3 =>
    plus(
      plus(plus(centre, along, i * size[0]), across, j * size[1]),
      [0, 0, 1],
      k * size[2],
    );
  const ids = new Map<string, number>();
  const id = (i: number, j: number, k: number, n: V3) => {
    const key = `${i}${j}${k}${n.join()}`;
    if (!ids.has(key)) ids.set(key, out.vertex(corner(i, j, k), n, colour));
    return ids.get(key)!;
  };
  const faces: [V3, [number, number, number][]][] = [
    [
      [0, 0, 1],
      [
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
        [-0.5, 0.5, 0.5],
      ],
    ],
    [
      [0, 0, -1],
      [
        [-0.5, -0.5, -0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, -0.5],
        [0.5, -0.5, -0.5],
      ],
    ],
    [
      [0, 1, 0],
      [
        [-0.5, 0.5, -0.5],
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, -0.5],
      ],
    ],
    [
      [0, -1, 0],
      [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
      ],
    ],
    [
      [1, 0, 0],
      [
        [0.5, -0.5, -0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
        [0.5, -0.5, 0.5],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [-0.5, -0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
        [-0.5, 0.5, -0.5],
      ],
    ],
  ];
  for (const [n, quad] of faces) {
    const [p, q, r, s] = quad.map(([i, j, k]) => id(i, j, k, n)) as [
      number,
      number,
      number,
      number,
    ];
    out.quad(p, q, r, s);
  }
}

function reelPart(out: Builder, part: ReelPart, wrap: number) {
  const colour = rgb(rodColour(part.colour, wrap));
  // A plan's `at` is [down, back, along]; the rod's frame here is [a, d, b].
  const [down, back, along] = part.at;
  const centre: V3 = [along, down, back];
  switch (part.kind) {
    case "disc":
      cylinder(
        out,
        centre,
        "b",
        part.radius,
        part.depth,
        Math.max(8, part.sides),
        colour,
      );
      break;
    case "ball":
      ball(out, centre, part.diameter, part.flat ?? 1, colour);
      break;
    case "arm":
      bar(out, centre, part.size, part.turn, colour);
      break;
    case "stem":
      cylinder(out, centre, "d", part.radius, part.length, 6, colour);
      break;
    case "post":
      cylinder(out, centre, "a", part.radius, part.length, 6, colour);
      break;
  }
}

/** The blank, the guides and the reel of a rod tier as one creature, for the painter. `wrap` is the boat colour of the bamboo rod's thread. */
export function rodCreature(tier: unknown, wrap: number): Creature {
  const plan = rodPlan(tier);
  const out = new Builder();
  // The blank: a loft through the rings.
  const rings: number[][] = [];
  for (const ring of plan.rings) {
    const colour = rgb(rodColour(ring.colour, wrap));
    const row: number[] = [];
    for (let k = 0; k < ROD_SIDES; k++) {
      const angle = (k / ROD_SIDES) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      row.push(
        out.vertex(
          [ring.s * ROD_LENGTH, c * ring.radius, s * ring.radius],
          [0, c, s],
          colour,
        ),
      );
    }
    rings.push(row);
  }
  for (let r = 0; r + 1 < plan.rings.length; r++) {
    if (!joined(plan, r)) continue;
    for (let k = 0; k < ROD_SIDES; k++) {
      const n = (k + 1) % ROD_SIDES;
      out.quad(
        rings[r]![k]!,
        rings[r]![n]!,
        rings[r + 1]![n]!,
        rings[r + 1]![k]!,
      );
    }
  }
  // The guides: flat eyelets on the stern side of the blank.
  const eyelet = rgb(rodColour(plan.guideColour, wrap));
  for (const s of plan.guides) {
    const at = s * ROD_LENGTH;
    const off = radiusAt(plan, s) + GUIDE_OUTER * 0.82;
    const outer: number[] = [];
    const inner: number[] = [];
    for (let k = 0; k < GUIDE_SIDES; k++) {
      const angle = (k / GUIDE_SIDES) * Math.PI * 2;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      outer.push(
        out.vertex(
          [at + c * GUIDE_OUTER, off + sn * GUIDE_OUTER, 0],
          [0, 0, 1],
          eyelet,
        ),
      );
      inner.push(
        out.vertex(
          [at + c * GUIDE_INNER, off + sn * GUIDE_INNER, 0],
          [0, 0, 1],
          eyelet,
        ),
      );
    }
    for (let k = 0; k < GUIDE_SIDES; k++) {
      const n = (k + 1) % GUIDE_SIDES;
      out.quad(outer[k]!, outer[n]!, inner[n]!, inner[k]!);
    }
  }
  for (const part of plan.reel) reelPart(out, part, wrap);
  const main: Part = {
    positions: out.positions,
    normals: out.normals,
    indices: out.indices,
    colors: out.colors,
  };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < main.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, main.positions[i + k]!);
      max[k] = Math.max(max[k]!, main.positions[i + k]!);
    }
  return {
    main,
    size: Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!),
    hook: [0, 0, 0],
  };
}
