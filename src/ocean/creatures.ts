import {
  Builder,
  curve,
  darker,
  lighter,
  mix,
  noise,
  rgb,
  sample,
  smooth,
  standUp,
  type Creature,
  type RGB,
  type Station,
  type V3,
} from "./creature-geometry.ts";

/**
 * Every sea animal in the game as a small shape built from code (see
 * creature-geometry.ts). `kind` is the body plan; the species table supplies the two
 * colours. Each is a few hundred triangles, so a hundred can hang in a list of cards.
 */
export type CreatureKind =
  | "slim"
  | "round"
  | "diamond"
  | "puffer"
  | "chunky"
  | "torpedo"
  | "flat"
  | "sword"
  | "shark"
  | "flounder"
  | "seahorse"
  | "squid"
  | "octopus"
  | "crab"
  | "lobster"
  | "starfish";

export const CREATURE_KINDS: readonly CreatureKind[] = [
  "slim",
  "round",
  "diamond",
  "puffer",
  "chunky",
  "torpedo",
  "flat",
  "sword",
  "shark",
  "flounder",
  "seahorse",
  "squid",
  "octopus",
  "crab",
  "lobster",
  "starfish",
];

const INK: RGB = rgb(0x153b80);
const EYE: RGB = [1, 1, 1];

type Key = readonly [u: number, width: number, top: number, bottom: number];
interface FishPlan {
  /** Nose (u 0) to tail base (u 1): half-width and half-heights as fractions of length. */
  keys: readonly Key[];
  noseX: number;
  tailX: number;
  tail: "fork" | "round" | "lunate";
  tailSpan: number;
  dorsal: readonly [number, number, number];
  anal: readonly [number, number, number] | null;
  pectoral: number;
  eyeU: number;
  eyeSize: number;
}

const PLANS: Partial<Record<CreatureKind, FishPlan>> = {
  slim: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.035, 0.045, 0.04],
      [0.25, 0.05, 0.06, 0.055],
      [0.5, 0.05, 0.058, 0.05],
      [0.75, 0.035, 0.04, 0.035],
      [0.92, 0.02, 0.025, 0.022],
      [1, 0.012, 0.018, 0.016],
    ],
    noseX: 0.5,
    tailX: -0.3,
    tail: "fork",
    tailSpan: 0.13,
    dorsal: [0.38, 0.5, 0.07],
    anal: [0.62, 0.72, 0.045],
    pectoral: 0.07,
    eyeU: 0.09,
    eyeSize: 0.02,
  },
  round: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.07, 0.1, 0.09],
      [0.28, 0.09, 0.14, 0.12],
      [0.55, 0.08, 0.12, 0.1],
      [0.78, 0.05, 0.07, 0.06],
      [0.93, 0.03, 0.035, 0.03],
      [1, 0.02, 0.02, 0.02],
    ],
    noseX: 0.46,
    tailX: -0.28,
    tail: "round",
    tailSpan: 0.15,
    dorsal: [0.28, 0.6, 0.1],
    anal: [0.55, 0.74, 0.07],
    pectoral: 0.09,
    eyeU: 0.1,
    eyeSize: 0.03,
  },
  diamond: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.04, 0.12, 0.11],
      [0.35, 0.06, 0.22, 0.2],
      [0.58, 0.05, 0.16, 0.14],
      [0.8, 0.03, 0.08, 0.07],
      [0.93, 0.02, 0.035, 0.03],
      [1, 0.012, 0.02, 0.02],
    ],
    noseX: 0.44,
    tailX: -0.28,
    tail: "fork",
    tailSpan: 0.17,
    dorsal: [0.3, 0.55, 0.12],
    anal: [0.55, 0.75, 0.1],
    pectoral: 0.08,
    eyeU: 0.1,
    eyeSize: 0.025,
  },
  puffer: {
    keys: [
      [0, 0, 0, 0],
      [0.07, 0.12, 0.14, 0.13],
      [0.3, 0.2, 0.22, 0.21],
      [0.6, 0.19, 0.2, 0.19],
      [0.82, 0.1, 0.1, 0.09],
      [0.94, 0.05, 0.05, 0.05],
      [1, 0.025, 0.025, 0.025],
    ],
    noseX: 0.42,
    tailX: -0.26,
    tail: "round",
    tailSpan: 0.1,
    dorsal: [0.62, 0.72, 0.06],
    anal: [0.64, 0.76, 0.05],
    pectoral: 0.08,
    eyeU: 0.12,
    eyeSize: 0.04,
  },
  chunky: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.08, 0.1, 0.09],
      [0.3, 0.12, 0.17, 0.14],
      [0.58, 0.11, 0.15, 0.12],
      [0.8, 0.07, 0.08, 0.07],
      [0.93, 0.04, 0.04, 0.04],
      [1, 0.025, 0.03, 0.03],
    ],
    noseX: 0.46,
    tailX: -0.3,
    tail: "round",
    tailSpan: 0.17,
    dorsal: [0.24, 0.72, 0.1],
    anal: [0.62, 0.78, 0.06],
    pectoral: 0.1,
    eyeU: 0.1,
    eyeSize: 0.03,
  },
  torpedo: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.04, 0.06, 0.05],
      [0.3, 0.07, 0.1, 0.085],
      [0.55, 0.07, 0.1, 0.08],
      [0.78, 0.05, 0.07, 0.06],
      [0.93, 0.025, 0.03, 0.028],
      [1, 0.014, 0.018, 0.016],
    ],
    noseX: 0.5,
    tailX: -0.28,
    tail: "lunate",
    tailSpan: 0.2,
    dorsal: [0.36, 0.5, 0.09],
    anal: [0.64, 0.8, 0.05],
    pectoral: 0.09,
    eyeU: 0.1,
    eyeSize: 0.022,
  },
  sword: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.04, 0.06, 0.05],
      [0.3, 0.07, 0.11, 0.09],
      [0.55, 0.075, 0.11, 0.085],
      [0.78, 0.05, 0.07, 0.06],
      [0.93, 0.025, 0.03, 0.028],
      [1, 0.014, 0.018, 0.016],
    ],
    noseX: 0.26,
    tailX: -0.3,
    tail: "lunate",
    tailSpan: 0.2,
    dorsal: [0.3, 0.62, 0.16],
    anal: [0.7, 0.84, 0.05],
    pectoral: 0.1,
    eyeU: 0.1,
    eyeSize: 0.022,
  },
  shark: {
    keys: [
      [0, 0, 0, 0],
      [0.06, 0.05, 0.06, 0.05],
      [0.3, 0.09, 0.11, 0.1],
      [0.55, 0.085, 0.105, 0.085],
      [0.78, 0.05, 0.065, 0.05],
      [0.93, 0.025, 0.03, 0.025],
      [1, 0.014, 0.018, 0.016],
    ],
    noseX: 0.5,
    tailX: -0.26,
    tail: "lunate",
    tailSpan: 0.22,
    dorsal: [0.34, 0.52, 0.17],
    anal: [0.72, 0.84, 0.045],
    pectoral: 0.17,
    eyeU: 0.1,
    eyeSize: 0.02,
  },
};

/** How the skin is marked. The species table picks one; each kind has a default. */
export type Pattern =
  | "plain"
  | "lateral"
  | "bars"
  | "spots"
  | "mottled"
  | "saddle";
export interface Look {
  pattern?: Pattern;
  /** Colour of the markings (hex); default is a darker body colour. */
  mark?: string;
  /** Colour of the iris (hex). */
  iris?: string;
}
const LOOKS: Partial<Record<CreatureKind, Look>> = {
  slim: { pattern: "lateral", mark: "#f4fbff", iris: "#e8e8ee" },
  round: { pattern: "mottled", iris: "#ffcf4a" },
  diamond: { pattern: "plain", iris: "#e8e8ee" },
  puffer: { pattern: "spots", iris: "#7ad0e8" },
  chunky: { pattern: "spots", iris: "#ffcf4a" },
  torpedo: { pattern: "bars", iris: "#d8e0e8" },
  sword: { pattern: "plain", iris: "#9ad0f0" },
  shark: { pattern: "plain", iris: "#2b3a4a" },
  flounder: { pattern: "mottled", iris: "#ffcf4a" },
  flat: { pattern: "spots", iris: "#2b3a4a" },
};

const fract = (v: number) => v - Math.floor(v);

/** Paints the skin: dark back, pale belly and the species' markings. u: nose 0 to tail 1. */
function skinOf(body: RGB, belly: RGB, mark: RGB, pattern: Pattern) {
  return (u: number, a: number): RGB => {
    const c = Math.cos(a);
    let col = mix(belly, body, smooth(-0.55, 0.5, c));
    col = mix(col, darker(body, 0.2), smooth(0.45, 1, c) * 0.65);
    const flank = 1 - Math.abs(c);
    const turn = (a / (Math.PI * 2)) % 1;
    switch (pattern) {
      case "lateral": {
        const line =
          smooth(0.8, 0.97, flank) *
          smooth(0.14, 0.26, u) *
          (1 - smooth(0.88, 0.98, u));
        col = mix(col, mark, line * 0.95);
        break;
      }
      case "bars": {
        const bar = Math.pow(Math.max(0, Math.sin(u * Math.PI * 10 + 0.4)), 3);
        const back = smooth(-0.05, 0.55, c);
        col = mix(
          col,
          darker(body, 0.5),
          bar * back * smooth(0.18, 0.3, u) * 0.85,
        );
        break;
      }
      case "spots":
      case "mottled": {
        const cu = pattern === "spots" ? 17 : 8;
        const ca = pattern === "spots" ? 15 : 7;
        const iu = Math.floor(u * cu);
        const ia = Math.floor(turn * ca);
        const chance = noise(iu, ia);
        const d = Math.hypot(fract(u * cu) - 0.5, fract(turn * ca) - 0.5);
        const strength = pattern === "spots" ? 0.9 : 0.6;
        const size = pattern === "spots" ? 0.34 : 0.55;
        const amount =
          chance < (pattern === "spots" ? 0.45 : 0.55)
            ? smooth(size, size * 0.45, d)
            : 0;
        col = mix(
          col,
          mark,
          amount * strength * (1 - smooth(-0.2, -0.7, c) * 0.5),
        );
        break;
      }
      case "saddle": {
        for (const centre of [0.3, 0.5, 0.7]) {
          const k =
            smooth(0.07, 0.02, Math.abs(u - centre)) * smooth(0.1, 0.6, c);
          col = mix(col, mark, k * 0.8);
        }
        break;
      }
      default:
        break;
    }
    return col;
  };
}

/** Fish read plumper in 3D than their drawings; this keeps them close to the cards. */
const FAT = 1.32;
const fatKeys = (keys: readonly Key[]): Key[] =>
  keys.map(([u, w, t, b]) => [u, w * FAT, t * FAT, b * FAT]);

const fishColour = (body: RGB, belly: RGB) => (_s: number, angle: number) => {
  const c = Math.cos(angle);
  return mix(belly, body, Math.min(1, Math.max(0, 0.5 + c * 0.9)));
};

function stationsOf(plan: FishPlan, n: number): Station[] {
  const span = plan.noseX - plan.tailX;
  const keys = fatKeys(plan.keys);
  const channel = (index: 1 | 2 | 3) =>
    keys.map((k) => [k[0], k[index]] as const);
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return {
      x: plan.noseX - u * span,
      width: sample(channel(1), u),
      top: sample(channel(2), u),
      bottom: sample(channel(3), u),
      cap: i === 0 ? 0.035 : 0.012,
    };
  });
}

const fishy = (
  kind: CreatureKind,
  bodyHex: string,
  finHex: string,
  look?: Look,
): Creature => {
  const plan = PLANS[kind]!;
  const spec = { ...LOOKS[kind], ...look };
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const belly = lighter(body, 0.62);
  const mark = spec.mark ? rgb(spec.mark) : darker(body, 0.5);
  const iris = rgb(spec.iris ?? "#ffcf4a");
  const membrane = lighter(fin, 0.12);
  const ray = darker(fin, 0.3);
  const main = new Builder();
  const STATIONS = 34;
  main.loft(stationsOf(plan, STATIONS), 20, (i, a) =>
    skinOf(body, belly, mark, spec.pattern ?? "plain")(i / (STATIONS - 1), a),
  );

  const span = plan.noseX - plan.tailX;
  const keys = fatKeys(plan.keys);
  const ch = (index: 1 | 2 | 3) => keys.map((k) => [k[0], k[index]] as const);
  const at = (u: number) => ({
    x: plan.noseX - u * span,
    w: sample(ch(1), u),
    top: sample(ch(2), u),
    bottom: sample(ch(3), u),
  });
  /** A point on the skin at u along the body and angle a around it (0 is the back). */
  const surf = (u: number, a: number, out = 1): V3 => {
    const s = at(u);
    const c = Math.cos(a);
    return [
      s.x,
      (c >= 0 ? s.top : s.bottom) * c * out,
      s.w * Math.sin(a) * out,
    ];
  };

  // Dorsal fin: a spiny leading edge then soft rays, swept back.
  const [d0, d1, dh] = plan.dorsal;
  const dBase: V3[] = [];
  const dTip: V3[] = [];
  const dn = 9;
  for (let i = 0; i < dn; i++) {
    const u = d0 + ((d1 - d0) * i) / (dn - 1);
    const s = at(u);
    const height =
      dh * (i < 3 ? 0.85 + 0.15 * (i / 2) : 1 - 0.55 * ((i - 3) / (dn - 4)));
    dBase.push([s.x, s.top * 0.92, 0]);
    dTip.push([s.x - 0.045 * (1 - i / dn) - 0.01, s.top + height, 0]);
  }
  main.finStrip(dBase, dTip, membrane, ray);
  if (plan.anal) {
    const [a0, a1, ah] = plan.anal;
    const aBase: V3[] = [];
    const aTip: V3[] = [];
    for (let i = 0; i < 6; i++) {
      const u = a0 + ((a1 - a0) * i) / 5;
      const s = at(u);
      aBase.push([s.x, -s.bottom * 0.92, 0]);
      aTip.push([s.x - 0.03, -s.bottom - ah * (1 - 0.35 * (i / 5)), 0]);
    }
    main.finStrip(aBase, aTip, membrane, ray);
  }
  // Pectoral fins (a fan of rays) and small pelvic fins.
  for (const side of [1, -1]) {
    const pu = 0.27;
    const s = at(pu);
    const root: V3 = [s.x, -s.bottom * 0.15, s.w * 0.96 * side];
    const tips: V3[] = [];
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const len = plan.pectoral * (1.5 - 0.5 * Math.abs(t - 0.4));
      tips.push([
        root[0] - len * (0.65 + 0.35 * t),
        root[1] - len * (0.55 - 0.9 * t) * 0.8 - 0.01,
        root[2] + side * len * 0.45,
      ]);
    }
    main.fan(root, tips, membrane, ray);
    const ps = at(0.36);
    const proot: V3 = [ps.x, -ps.bottom * 0.95, ps.w * 0.45 * side];
    main.fan(
      proot,
      [0, 1, 2, 3].map(
        (k): V3 => [
          proot[0] - 0.02 - k * 0.012,
          proot[1] - 0.05 + k * 0.006,
          proot[2] + side * (0.03 + k * 0.012),
        ],
      ),
      membrane,
      ray,
    );
  }
  // Finlets before the tail on the fast swimmers.
  if (kind === "torpedo" || kind === "sword") {
    for (const sign of [1, -1])
      for (let k = 0; k < 5; k++) {
        const u = 0.76 + k * 0.034;
        const s = at(u);
        const y = sign * (sign > 0 ? s.top : s.bottom);
        main.plate(
          [
            [s.x, y * 0.95, 0],
            [s.x - 0.03, y + sign * 0.035, 0],
            [s.x - 0.04, y * 0.95, 0],
          ],
          lighter(fin, 0.35),
        );
      }
  }
  // Head detail: gill covers, mouth and eyes.
  const gillU = plan.eyeU + 0.13;
  for (const side of [1, -1]) {
    const arc: V3[] = [];
    for (let k = 0; k < 9; k++) {
      const a = 0.45 + (k / 8) * 2.1;
      arc.push(surf(gillU, side > 0 ? a : Math.PI * 2 - a, 1.02));
    }
    main.tube(arc, () => 0.0065, darker(body, 0.45), 4);
    // The cover is a touch lighter than the flank.
    const lit: V3[] = [];
    for (let k = 0; k < 7; k++)
      lit.push(
        surf(
          gillU - 0.035,
          side > 0 ? 0.7 + k * 0.28 : Math.PI * 2 - (0.7 + k * 0.28),
          1.01,
        ),
      );
    main.tube(lit, () => 0.01, lighter(body, 0.22), 4);
    // Mouth: a thin dark line from the tip to the corner.
    const corner = surf(0.1, side > 0 ? 1.95 : Math.PI * 2 - 1.95, 1.0);
    const front = surf(0.012, Math.PI, 1.0);
    main.tube(
      [
        front,
        [
          (front[0] + corner[0]) / 2,
          (front[1] + corner[1]) / 2 - 0.004,
          ((front[2] + corner[2]) / 2) * 1.05,
        ],
        corner,
      ],
      () => 0.0042,
      rgb(0x153b80),
      4,
    );
    // The eye: socket, white, iris, pupil and a spark of light.
    const es = at(plan.eyeU);
    const e = plan.eyeSize * 1.25;
    const ey = es.top * 0.32;
    const ez = es.w * 0.9 * side;
    main.ellipsoid(
      [es.x, ey, ez],
      [e * 1.2, e * 1.2, e * 0.7],
      darker(body, 0.35),
      6,
      9,
    );
    main.ellipsoid(
      [es.x + 0.002, ey, ez + side * e * 0.2],
      [e, e, e * 0.6],
      EYE,
      6,
      9,
    );
    main.ellipsoid(
      [es.x + 0.006, ey, ez + side * e * 0.46],
      [e * 0.72, e * 0.72, e * 0.45],
      iris,
      6,
      9,
    );
    main.ellipsoid(
      [es.x + 0.01, ey, ez + side * e * 0.62],
      [e * 0.42, e * 0.42, e * 0.35],
      rgb(0x0b1d3a),
      5,
      8,
    );
    main.ellipsoid(
      [es.x + 0.016, ey + e * 0.22, ez + side * e * 0.78],
      [e * 0.14, e * 0.14, e * 0.12],
      EYE,
      4,
      6,
    );
    // Nostril.
    const nose = surf(0.045, side > 0 ? 0.4 : Math.PI * 2 - 0.4, 1.0);
    main.ellipsoid(nose, [0.006, 0.006, 0.006], darker(body, 0.4), 4, 5);
  }
  if (kind === "puffer") {
    // Short spines all over, and a small beak.
    for (let k = 0; k < 44; k++) {
      const u = 0.16 + noise(k, 3) * 0.6;
      const a = noise(k, 9) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) > 0.9 && u < 0.3) continue;
      const base = surf(u, a, 1.0);
      const tipP = surf(u, a, 1.0 + 0.2 + noise(k, 5) * 0.08);
      main.tube(
        [base, tipP],
        (t) => 0.011 * (1 - t) + 0.001,
        lighter(body, 0.45),
        4,
      );
    }
    const beak = surf(0.02, Math.PI, 1.0);
    main.plate(
      [
        [beak[0] + 0.02, beak[1] + 0.012, 0.012],
        [beak[0] + 0.02, beak[1] + 0.012, -0.012],
        [beak[0] - 0.01, beak[1] - 0.012, 0],
      ],
      lighter(body, 0.8),
    );
  }
  if (kind === "sword") {
    // The bill and the lower jaw.
    main.tube(
      [
        [plan.noseX, 0.004, 0],
        [plan.noseX + 0.12, 0.004, 0],
        [0.5, 0.004, 0],
      ],
      (t) => 0.024 * (1 - t * 0.9),
      darker(body, 0.25),
      7,
    );
    main.tube(
      [
        [plan.noseX - 0.02, -0.02, 0],
        [plan.noseX + 0.04, -0.018, 0],
      ],
      (t) => 0.014 * (1 - t * 0.5),
      darker(body, 0.1),
      5,
    );
  }
  if (kind === "shark") {
    // Five gill slits and a long smile.
    for (let g = 0; g < 5; g++) {
      for (const side of [1, -1]) {
        const slit: V3[] = [];
        for (let k = 0; k < 5; k++) {
          const a = 0.7 + k * 0.28;
          slit.push(
            surf(0.2 + g * 0.026, side > 0 ? a : Math.PI * 2 - a, 1.015),
          );
        }
        main.tube(slit, () => 0.0042, darker(body, 0.55), 4);
      }
    }
    // A second small dorsal fin and bigger pelvics.
    const s2 = at(0.7);
    main.plate(
      [
        [s2.x, s2.top * 0.9, 0],
        [s2.x - 0.035, s2.top + 0.045, 0],
        [s2.x - 0.06, s2.top * 0.9, 0],
      ],
      membrane,
    );
  }

  // The tail swings on its own: a fan of rays pivoting where the body ends.
  const tail = new Builder();
  const tx = plan.tailX;
  const s = plan.tailSpan;
  const tips: [number, number, number][] = [];
  const count = 11;
  for (let k = 0; k < count; k++) {
    const t = (k / (count - 1)) * 2 - 1;
    const y =
      t *
      s *
      (plan.tail === "lunate" ? 1.3 : plan.tail === "fork" ? 1.1 : 0.85);
    const reach =
      plan.tail === "round"
        ? 0.21 - 0.05 * t * t
        : plan.tail === "lunate"
          ? 0.1 + 0.11 * Math.abs(t)
          : 0.12 + 0.07 * Math.abs(t);
    tips.push([tx - reach, y, 0]);
  }
  if (kind === "shark") {
    tips.forEach((tip, k) => {
      const t = (k / (count - 1)) * 2 - 1;
      tip[1] = t > 0 ? t * s * 1.9 : t * s * 1.0;
      tip[0] = tx - (t > 0 ? 0.1 + 0.14 * t : 0.1 + 0.06 * -t);
    });
  }
  tail.fan([tx, 0, 0], tips, membrane, ray);
  // A keel on each side of the narrow tail base.
  if (kind === "torpedo" || kind === "sword" || kind === "shark")
    for (const side of [1, -1])
      tail.plate(
        [
          [tx + 0.04, 0, 0.0],
          [tx, 0.0, 0.03 * side],
          [tx - 0.04, 0.0, 0.0],
        ],
        darker(body, 0.2),
      );
  return {
    main: main.part,
    tail: { part: tail.part, pivot: [tx, 0, 0] },
    size: 1,
    hook: [plan.noseX, -0.005, 0],
  };
};

const flat = (bodyHex: string, finHex: string): Creature => {
  // A ray: a wide diamond of a body with a whip tail.
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const belly = lighter(body, 0.7);
  const main = new Builder();
  const keys: Key[] = [
    [0, 0, 0, 0],
    [0.1, 0.12, 0.03, 0.02],
    [0.3, 0.4, 0.05, 0.035],
    [0.5, 0.3, 0.05, 0.035],
    [0.75, 0.1, 0.03, 0.02],
    [1, 0.01, 0.012, 0.01],
  ];
  const ch = (i: 1 | 2 | 3) => keys.map((k) => [k[0], k[i]] as const);
  const stations: Station[] = Array.from({ length: 13 }, (_, i) => {
    const u = i / 12;
    return {
      x: 0.32 - u * 0.5,
      width: sample(ch(1), u),
      top: sample(ch(2), u),
      bottom: sample(ch(3), u),
      cap: 0.03,
    };
  });
  main.loft(stations, 12, fishColour(body, belly));
  // Wing tips curve up a little and the head carries two small eyes on top.
  for (const side of [1, -1]) {
    main.ellipsoid([0.2, 0.05, 0.07 * side], [0.02, 0.02, 0.016], EYE, 5, 7);
    main.ellipsoid(
      [0.205, 0.056, 0.073 * side],
      [0.01, 0.01, 0.008],
      INK,
      4,
      6,
    );
    main.plate(
      [
        [0.12, 0.03, 0.3 * side],
        [0.02, 0.05, 0.46 * side],
        [-0.08, 0.025, 0.3 * side],
      ],
      mix(body, fin, 0.5),
    );
  }
  // The whip tail.
  const tailBuilder = new Builder();
  tailBuilder.tube(
    curve(
      [
        [-0.18, 0, 0],
        [-0.34, 0.02, 0],
        [-0.5, 0.0, 0.02],
      ],
      6,
    ),
    (t) => 0.018 * (1 - t * 0.85),
    fin,
    5,
  );
  return {
    main: main.part,
    tail: { part: tailBuilder.part, pivot: [-0.18, 0, 0] },
    size: 1,
    hook: [0.34, 0, 0],
  };
};

const flounder = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const main = new Builder();
  const keys: Key[] = [
    [0, 0, 0, 0],
    [0.08, 0.02, 0.09, 0.08],
    [0.35, 0.035, 0.2, 0.18],
    [0.65, 0.03, 0.17, 0.15],
    [0.9, 0.02, 0.06, 0.05],
    [1, 0.01, 0.02, 0.02],
  ];
  const ch = (i: 1 | 2 | 3) => keys.map((k) => [k[0], k[i]] as const);
  const stations: Station[] = Array.from({ length: 13 }, (_, i) => {
    const u = i / 12;
    return {
      x: 0.46 - u * 0.78,
      width: sample(ch(1), u),
      top: sample(ch(2), u),
      bottom: sample(ch(3), u),
      cap: 0.02,
    };
  });
  main.loft(stations, 10, (_s, a) =>
    Math.sin(a) > 0 ? mix(body, darker(body, 0.25), 0.5) : lighter(body, 0.7),
  );
  // Long fringe fins all the way along the top and bottom edges.
  for (const side of [1, -1])
    main.plate(
      [
        [0.36, side * 0.17, 0],
        [0.0, side * 0.31, 0],
        [-0.28, side * 0.1, 0],
      ],
      fin,
    );
  // Both eyes on the same (upper) side.
  for (const [x, y] of [
    [0.34, 0.07],
    [0.3, 0.12],
  ] as const) {
    main.ellipsoid([x, y, 0.036], [0.02, 0.02, 0.014], EYE, 5, 7);
    main.ellipsoid([x + 0.004, y, 0.047], [0.01, 0.01, 0.008], INK, 4, 6);
  }
  const tailBuilder = new Builder();
  tailBuilder.plate(
    [
      [-0.32, 0.02, 0],
      [-0.46, 0.1, 0],
      [-0.5, 0, 0],
      [-0.46, -0.1, 0],
      [-0.32, -0.02, 0],
    ],
    fin,
  );
  return {
    main: main.part,
    tail: { part: tailBuilder.part, pivot: [-0.32, 0, 0] },
    size: 1,
    hook: [0.46, 0, 0],
  };
};

const seahorse = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const main = new Builder();
  const spine = curve(
    [
      [0.1, 0.42, 0],
      [0.03, 0.32, 0],
      [-0.04, 0.18, 0],
      [-0.03, 0.0, 0],
      [0.03, -0.14, 0],
      [0.06, -0.28, 0],
      [0.0, -0.4, 0],
      [-0.1, -0.38, 0],
      [-0.15, -0.28, 0],
    ],
    22,
  );
  main.tube(
    spine.slice(2),
    (t) => 0.075 * Math.pow(1 - t, 0.6) * (t < 0.15 ? 1 : 1) + 0.012,
    (t) => (t < 0.35 ? lighter(body, 0.35 * (1 - t / 0.35)) : body),
    8,
  );
  // Head and a long snout.
  main.ellipsoid([0.08, 0.4, 0], [0.085, 0.075, 0.06], body, 6, 9);
  main.tube(
    [
      [0.14, 0.4, 0],
      [0.26, 0.37, 0],
      [0.34, 0.35, 0],
    ],
    (t) => 0.028 - t * 0.012,
    darker(body, 0.1),
    6,
  );
  for (const side of [1, -1]) {
    main.ellipsoid([0.1, 0.43, 0.045 * side], [0.02, 0.02, 0.015], EYE, 5, 7);
    main.ellipsoid([0.106, 0.43, 0.056 * side], [0.01, 0.01, 0.008], INK, 4, 6);
  }
  // Crown spines and the dorsal fin on the back.
  for (const dx of [-0.02, 0.03])
    main.plate(
      [
        [dx, 0.46, 0],
        [dx - 0.03, 0.55, 0],
        [dx - 0.05, 0.45, 0],
      ],
      darker(body, 0.15),
    );
  main.plate(
    [
      [-0.07, 0.24, 0],
      [-0.16, 0.18, 0],
      [-0.13, 0.08, 0],
      [-0.06, 0.1, 0],
    ],
    fin,
  );
  return { main: main.part, size: 1, hook: [0.3, 0.37, 0] };
};

const squid = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const belly = lighter(body, 0.6);
  const main = new Builder();
  const mantle: Station[] = [
    { x: 0.1, width: 0.0, top: 0.0, bottom: 0.0, cap: 0.02 },
    { x: 0.04, width: 0.07, top: 0.075, bottom: 0.07 },
    { x: -0.12, width: 0.095, top: 0.1, bottom: 0.09 },
    { x: -0.3, width: 0.07, top: 0.07, bottom: 0.065 },
    { x: -0.44, width: 0.02, top: 0.02, bottom: 0.02, cap: 0.05 },
  ];
  main.loft(mantle, 10, fishColour(body, belly));
  for (const side of [1, -1])
    main.plate(
      [
        [-0.22, 0.01 * side, 0.07 * side],
        [-0.34, 0.01 * side, 0.2 * side],
        [-0.48, 0.0, 0.05 * side],
        [-0.36, -0.01 * side, 0.07 * side],
      ].map(([x, y, z]) => [x!, y!, z!] as V3),
      fin,
    );
  main.ellipsoid([0.14, 0, 0], [0.065, 0.075, 0.075], body, 6, 9);
  for (const side of [1, -1]) {
    main.ellipsoid(
      [0.15, 0.02, 0.066 * side],
      [0.028, 0.028, 0.018],
      EYE,
      5,
      7,
    );
    main.ellipsoid(
      [0.158, 0.02, 0.078 * side],
      [0.014, 0.014, 0.01],
      INK,
      4,
      6,
    );
  }
  // Eight short arms and two long tentacles.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const y = Math.cos(a) * 0.05;
    const z = Math.sin(a) * 0.05;
    main.tube(
      curve(
        [
          [0.18, y, z],
          [0.3, y * 1.4, z * 1.4],
          [0.42, y * 1.1, z * 1.1],
        ],
        6,
      ),
      (t) => 0.018 * (1 - t * 0.8),
      mix(body, fin, 0.4),
      5,
    );
  }
  for (const side of [1, -1])
    main.tube(
      curve(
        [
          [0.18, 0.0, 0.02 * side],
          [0.36, 0.0, 0.03 * side],
          [0.5, 0.01, 0.025 * side],
        ],
        6,
      ),
      (t) => 0.01 + t * 0.012,
      darker(body, 0.1),
      5,
    );
  return { main: main.part, size: 1, hook: [0.2, 0, 0] };
};

const octopus = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const main = new Builder();
  // A rounded mantle leaning back over the head.
  main.ellipsoid(
    [-0.08, 0.3, 0],
    [0.17, 0.24, 0.15],
    (p) => lighter(body, Math.max(0, p[1] - 0.3) * 0.25),
    8,
    12,
  );
  main.ellipsoid([0.02, 0.12, 0], [0.13, 0.12, 0.13], body, 6, 10);
  for (const side of [1, -1]) {
    main.ellipsoid([0.09, 0.16, 0.1 * side], [0.04, 0.04, 0.025], EYE, 5, 7);
    main.ellipsoid([0.115, 0.16, 0.118 * side], [0.02, 0.02, 0.014], INK, 4, 6);
  }
  // Eight long arms that fan out and trail down, curling at the tips.
  const reach = [0.1, 0.17, 0.25, 0.32, 0.37];
  const drop = [0.06, -0.1, -0.3, -0.5, -0.6];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const curl = k % 2 === 0 ? 1 : -1;
    const path: V3[] = reach.map((r, i): V3 => {
      // A little sideways wave that grows toward the tip, so neighbours do not touch.
      const wave = Math.sin(i * 1.3) * 0.03 * curl * (i / 4);
      return [0.02 + ca * r - sa * wave, drop[i]!, sa * r + ca * wave];
    });
    main.tube(
      curve(path, 11),
      (t) => 0.04 * Math.pow(1 - t, 0.9) + 0.007,
      (t) => mix(body, fin, t * 0.55),
      6,
    );
  }
  return { main: main.part, size: 1.1, hook: [0.0, 0.5, 0] };
};

const crab = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const claw = rgb(finHex);
  const main = new Builder();
  main.ellipsoid(
    [0, 0.08, 0],
    [0.2, 0.08, 0.3],
    (p) => lighter(body, Math.max(0, p[1] - 0.08) * 1.2),
    7,
    12,
  );
  // Eyes on short stalks at the front.
  for (const side of [1, -1]) {
    main.tube(
      [
        [0.16, 0.13, 0.08 * side],
        [0.2, 0.2, 0.09 * side],
      ],
      () => 0.01,
      body,
      5,
    );
    main.ellipsoid([0.2, 0.22, 0.09 * side], [0.024, 0.024, 0.024], EYE, 5, 7);
    main.ellipsoid(
      [0.222, 0.222, 0.09 * side],
      [0.012, 0.012, 0.012],
      INK,
      4,
      6,
    );
  }
  // Four legs a side, bent at the knee.
  for (const side of [1, -1])
    for (let k = 0; k < 4; k++) {
      const x = 0.1 - k * 0.075;
      main.tube(
        curve(
          [
            [x, 0.06, 0.26 * side],
            [x - 0.02, 0.17, 0.4 * side],
            [x - 0.04, 0.0, 0.5 * side],
          ],
          6,
        ),
        (t) => 0.018 * (1 - t * 0.6),
        darker(body, 0.1),
        5,
      );
    }
  // Two big claws held in front.
  for (const side of [1, -1]) {
    main.tube(
      curve(
        [
          [0.14, 0.1, 0.26 * side],
          [0.28, 0.12, 0.3 * side],
          [0.36, 0.1, 0.2 * side],
        ],
        6,
      ),
      () => 0.026,
      body,
      6,
    );
    main.ellipsoid([0.44, 0.1, 0.17 * side], [0.1, 0.055, 0.07], claw, 6, 9);
    main.plate(
      [
        [0.46, 0.11, 0.2 * side],
        [0.56, 0.1, 0.13 * side],
        [0.5, 0.07, 0.15 * side],
      ],
      darker(claw, 0.2),
    );
    main.plate(
      [
        [0.46, 0.09, 0.12 * side],
        [0.56, 0.1, 0.09 * side],
        [0.5, 0.07, 0.1 * side],
      ],
      darker(claw, 0.2),
    );
  }
  return { main: main.part, size: 1.1, hook: [0.2, 0.2, 0] };
};

const lobster = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const claw = rgb(finHex);
  const main = new Builder();
  const stations: Station[] = [
    { x: 0.3, width: 0, top: 0, bottom: 0, cap: 0.03 },
    { x: 0.24, width: 0.07, top: 0.07, bottom: 0.06 },
    { x: 0.1, width: 0.1, top: 0.1, bottom: 0.08 },
    { x: -0.02, width: 0.09, top: 0.085, bottom: 0.07 },
    { x: -0.1, width: 0.075, top: 0.075, bottom: 0.06 },
    { x: -0.12, width: 0.09, top: 0.08, bottom: 0.065 },
    { x: -0.2, width: 0.07, top: 0.07, bottom: 0.055 },
    { x: -0.22, width: 0.085, top: 0.075, bottom: 0.06 },
    { x: -0.3, width: 0.06, top: 0.06, bottom: 0.05 },
    { x: -0.32, width: 0.075, top: 0.065, bottom: 0.05 },
    { x: -0.38, width: 0.05, top: 0.05, bottom: 0.04, cap: 0.01 },
  ];
  main.loft(stations, 10, (i, a) =>
    Math.cos(a) < -0.2
      ? lighter(body, 0.4)
      : mix(body, darker(body, 0.15), (i % 2) * 0.5),
  );
  // Tail fan.
  for (const z of [-0.09, 0, 0.09])
    main.plate(
      [
        [-0.38, 0.0, 0],
        [-0.52, 0.02, z * 1.2],
        [-0.54, -0.01, z * 0.6],
        [-0.42, -0.03, 0],
      ].map(([x, y, w]) => [x!, y!, w!] as V3),
      lighter(body, 0.1),
    );
  // Antennae: long and thin.
  for (const side of [1, -1])
    main.tube(
      curve(
        [
          [0.28, 0.04, 0.03 * side],
          [0.45, 0.1, 0.1 * side],
          [0.62, 0.05, 0.18 * side],
        ],
        8,
      ),
      (t) => 0.009 * (1 - t * 0.7),
      darker(body, 0.1),
      4,
    );
  // Big claws.
  for (const side of [1, -1]) {
    main.tube(
      curve(
        [
          [0.22, 0.0, 0.08 * side],
          [0.34, 0.02, 0.15 * side],
          [0.42, 0.0, 0.16 * side],
        ],
        6,
      ),
      () => 0.03,
      body,
      6,
    );
    main.ellipsoid([0.52, 0.0, 0.18 * side], [0.12, 0.05, 0.075], claw, 6, 9);
    main.plate(
      [
        [0.6, 0.02, 0.2 * side],
        [0.72, 0.03, 0.14 * side],
        [0.62, -0.02, 0.15 * side],
      ],
      darker(claw, 0.2),
    );
    main.plate(
      [
        [0.6, 0.0, 0.12 * side],
        [0.72, 0.0, 0.09 * side],
        [0.62, -0.03, 0.1 * side],
      ],
      darker(claw, 0.2),
    );
  }
  for (const side of [1, -1])
    for (let k = 0; k < 4; k++)
      main.tube(
        curve(
          [
            [0.14 - k * 0.07, -0.04, 0.08 * side],
            [0.14 - k * 0.07, -0.1, 0.16 * side],
            [0.12 - k * 0.07, -0.2, 0.2 * side],
          ],
          5,
        ),
        () => 0.01,
        darker(body, 0.15),
        4,
      );
  for (const side of [1, -1]) {
    main.ellipsoid([0.28, 0.06, 0.05 * side], [0.016, 0.016, 0.016], EYE, 4, 6);
    main.ellipsoid(
      [0.295, 0.06, 0.053 * side],
      [0.008, 0.008, 0.008],
      INK,
      4,
      6,
    );
  }
  return { main: main.part, size: 1.25, hook: [0.3, 0.0, 0] };
};

const starfish = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const dot = rgb(finHex);
  const main = new Builder();
  const outline = (y: number): V3[] => {
    const points: V3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const r = k % 2 === 0 ? 0.46 : 0.17;
      points.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return points;
  };
  const top = outline(0.05).map(
    (p): V3 => [p[0], 0.05 + (Math.hypot(p[0], p[2]) < 0.2 ? 0.035 : 0), p[2]],
  );
  const bottom = outline(-0.04);
  main.grid([bottom, top], (i) => (i === 0 ? darker(body, 0.2) : body));
  main.plate(
    top.map((p): V3 => [p[0], p[1] + 0.002, p[2]]),
    body,
  );
  // Bumps along each arm.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2 + Math.PI / 5;
    for (const r of [0.12, 0.22, 0.32])
      main.ellipsoid(
        [Math.cos(a) * r, 0.075 - r * 0.05, Math.sin(a) * r],
        [0.022, 0.018, 0.022],
        dot,
        4,
        6,
      );
  }
  return { main: main.part, size: 1, hook: [0.0, 0.08, 0] };
};

/** Builds the animal for a body plan, painted with the species' two colours. */
export function buildCreature(
  kind: CreatureKind,
  body: string,
  fin: string,
): Creature {
  switch (kind) {
    case "flat":
      return standUp(flat(body, fin));
    case "flounder":
      return flounder(body, fin);
    case "seahorse":
      return seahorse(body, fin);
    case "squid":
      return squid(body, fin);
    case "octopus":
      return octopus(body, fin);
    // Seen from above, like a ray: legs and claws spread across the picture.
    case "crab":
      return standUp(crab(body, fin));
    case "lobster":
      return standUp(lobster(body, fin));
    case "starfish":
      return standUp(starfish(body, fin));
    default:
      return fishy(kind, body, fin);
  }
}
