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
      [0.78, 0.058, 0.082, 0.07],
      [0.93, 0.038, 0.048, 0.042],
      [1, 0.026, 0.03, 0.028],
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
      [0.35, 0.06, 0.19, 0.17],
      [0.58, 0.05, 0.15, 0.13],
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
  | "saddle"
  /** Pale vertical bands edged in black, like a clownfish. */
  | "bands"
  /** Dark wavy stripes down from the back, like a mackerel. */
  | "wavy";
export interface Look {
  pattern?: Pattern;
  /** Colour of the markings (hex); default is a darker body colour. */
  mark?: string;
  /** Colour of the iris (hex). */
  iris?: string;
  /** Colour of the belly (hex); default is a pale version of the body. */
  belly?: string;
  /** 0..1: a pale metallic glow along the flank, for silvery fish. */
  sheen?: number;
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
function skinOf(body: RGB, belly: RGB, mark: RGB, pattern: Pattern, sheen = 0) {
  return (u: number, a: number): RGB => {
    const c = Math.cos(a);
    let col = mix(belly, body, smooth(-0.55, 0.5, c));
    col = mix(col, darker(body, 0.2), smooth(0.45, 1, c) * 0.65);
    const flank = 1 - Math.abs(c);
    // A paler cheek in front of the gill cover.
    col = mix(
      col,
      lighter(col, 0.14),
      (1 - smooth(0.2, 0.3, u)) * smooth(0.04, 0.12, u) * flank,
    );
    // A silvery fish catches the light along its flank.
    if (sheen > 0)
      col = mix(
        col,
        lighter(col, 0.38),
        sheen *
          smooth(0.55, 0.95, flank) *
          smooth(0.1, 0.25, u) *
          (1 - smooth(0.85, 1, u)),
      );
    const turn = (a / (Math.PI * 2)) % 1;
    switch (pattern) {
      case "bands": {
        const ink: RGB = [0.08, 0.07, 0.07];
        [
          [0.2, 0.05],
          [0.52, 0.07],
          [0.87, 0.035],
        ].forEach(([centre, half]) => {
          const d = Math.abs(u - centre!);
          const white = smooth(half!, half! * 0.7, d);
          const edge = smooth(half! + 0.02, half!, d) * (1 - white);
          col = mix(col, ink, edge * 0.9);
          col = mix(col, mark, white * 0.96);
        });
        break;
      }
      case "wavy": {
        const stripe =
          Math.pow(
            Math.max(0, Math.sin(u * Math.PI * 16 + Math.sin(a) * 2.4)),
            3,
          ) *
          smooth(0.05, 0.55, c) *
          smooth(0.16, 0.28, u) *
          (1 - smooth(0.9, 0.98, u));
        col = mix(col, mark, stripe * 0.85);
        break;
      }
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
        const cu = pattern === "spots" ? 12 : 7;
        const ca = pattern === "spots" ? 10 : 6;
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
  const belly = spec.belly ? rgb(spec.belly) : lighter(body, 0.62);
  const sheen = spec.sheen ?? 0;
  const mark = spec.mark ? rgb(spec.mark) : darker(body, 0.5);
  const iris = rgb(spec.iris ?? "#ffcf4a");
  const membrane = lighter(fin, 0.12);
  const ray = darker(fin, 0.3);
  const main = new Builder();
  const STATIONS = 34;
  main.loft(stationsOf(plan, STATIONS), 28, (i, a) =>
    skinOf(
      body,
      belly,
      mark,
      spec.pattern ?? "plain",
      sheen,
    )(i / (STATIONS - 1), a),
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
  const [d0, d1, dhBase] = plan.dorsal;
  const dh = dhBase * 1.08;
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
      const len = plan.pectoral * 1.15 * (1.5 - 0.5 * Math.abs(t - 0.4));
      tips.push([
        root[0] - len * (0.7 + 0.3 * t),
        root[1] - len * (0.5 - 0.85 * t) * 0.7 - 0.008,
        root[2] + side * len * 0.14,
      ]);
    }
    // Pectorals are glassy: a pale membrane with faint rays, not dark blades.
    main.fan(root, tips, lighter(fin, 0.4), lighter(fin, 0.1));
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
      const f = k / 8;
      const a = 0.5 + f * 1.55;
      // The edge of the cover curves back at the middle, like a real operculum.
      arc.push(
        surf(
          gillU + 0.032 * Math.sin(f * Math.PI),
          side > 0 ? a : Math.PI * 2 - a,
          1.015,
        ),
      );
    }
    main.tube(
      arc,
      (t) => 0.0042 * (0.5 + Math.sin(t * Math.PI)),
      darker(body, 0.4),
      4,
    );
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
    const e = plan.eyeSize * 1.08;
    const ey = es.top * 0.38;
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
      [e * 0.9, e * 0.9, e * 0.5],
      iris,
      6,
      9,
    );
    main.ellipsoid(
      [es.x + 0.01, ey, ez + side * e * 0.62],
      [e * 0.56, e * 0.56, e * 0.4],
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
  const s = plan.tailSpan * 1.1;
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

const ripple = (rgbBase: RGB, edge: RGB, a: number) =>
  mix(rgbBase, edge, smooth(0.78, 1, Math.abs(Math.sin(a))) * 0.55);

const eyeAt = (
  b: Builder,
  at: V3,
  e: number,
  side: number,
  iris: RGB,
  dir: V3 = [0, 0, 1],
) => {
  // Socket, white, iris, pupil and a spark, looking along `dir` (times side on Z).
  const [dx, dy, dz] = dir;
  const out = (k: number): V3 => [
    at[0] + dx * e * k * side,
    at[1] + dy * e * k * side,
    at[2] + dz * e * k * side,
  ];
  b.ellipsoid(at, [e * 1.2, e * 1.2, e * 1.2], rgb(0x2b3a4a), 6, 9);
  b.ellipsoid(out(0.35), [e, e, e], EYE, 6, 9);
  b.ellipsoid(out(0.75), [e * 0.72, e * 0.72, e * 0.72], iris, 6, 9);
  b.ellipsoid(out(1.05), [e * 0.42, e * 0.42, e * 0.42], rgb(0x0b1d3a), 5, 8);
  const spark = out(1.25);
  b.ellipsoid(
    [spark[0] + e * 0.18, spark[1] + e * 0.2, spark[2]],
    [e * 0.15, e * 0.15, e * 0.15],
    EYE,
    4,
    6,
  );
};

const flat = (bodyHex: string, finHex: string): Creature => {
  // A ray: a wide diamond of a body with a long whip tail.
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const belly = lighter(body, 0.72);
  const mark = darker(body, 0.45);
  const skin = skinOf(body, belly, mark, "spots");
  const main = new Builder();
  const keys: Key[] = [
    [0, 0, 0, 0],
    [0.08, 0.1, 0.035, 0.025],
    [0.25, 0.36, 0.06, 0.04],
    [0.42, 0.46, 0.065, 0.04],
    [0.6, 0.3, 0.05, 0.03],
    [0.8, 0.09, 0.03, 0.02],
    [1, 0.012, 0.014, 0.01],
  ];
  const ch = (i: 1 | 2 | 3) => keys.map((k) => [k[0], k[i]] as const);
  const N = 30;
  const stations: Station[] = Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1);
    return {
      x: 0.34 - u * 0.52,
      width: sample(ch(1), u),
      top: sample(ch(2), u),
      bottom: sample(ch(3), u),
      cap: 0.03,
    };
  });
  main.loft(stations, 24, (i, a) =>
    ripple(skin(i / (N - 1), a), lighter(body, 0.4), a),
  );
  // Two raised eyes and the breathing holes behind them.
  for (const side of [1, -1]) {
    eyeAt(main, [0.2, 0.062, 0.075 * side], 0.02, 1, rgb(0xffcf4a), [0, 1, 0]);
    main.ellipsoid(
      [0.15, 0.062, 0.085 * side],
      [0.016, 0.006, 0.01],
      rgb(0x1a2a45),
      5,
      7,
    );
    main.ellipsoid(
      [0.3, 0.036, 0.03 * side],
      [0.006, 0.005, 0.006],
      darker(body, 0.5),
      4,
      5,
    );
  }
  // A ridge down the middle of the back and a small dorsal fin near the tail.
  main.tube(
    curve(
      [
        [0.18, 0.06, 0],
        [0.0, 0.07, 0],
        [-0.12, 0.05, 0],
      ],
      9,
    ),
    (t) => 0.014 * (1 - t * 0.7),
    lighter(body, 0.1),
    5,
  );
  main.finStrip(
    [
      [-0.1, 0.03, 0],
      [-0.13, 0.03, 0],
      [-0.16, 0.025, 0],
    ],
    [
      [-0.12, 0.09, 0],
      [-0.15, 0.085, 0],
      [-0.18, 0.06, 0],
    ],
    lighter(fin, 0.1),
    darker(fin, 0.3),
  );
  // The whip tail is its own part, thick at the root and ending in a barb.
  const tail = new Builder();
  tail.tube(
    curve(
      [
        [-0.17, 0, 0],
        [-0.3, 0.02, 0.01],
        [-0.42, 0.0, -0.01],
        [-0.54, 0.02, 0],
      ],
      14,
    ),
    (t) => 0.02 * Math.pow(1 - t, 0.8) + 0.004,
    (t) => mix(body, darker(fin, 0.3), t),
    5,
  );
  tail.plate(
    [
      [-0.3, 0.022, 0.012],
      [-0.34, 0.05, 0.0],
      [-0.37, 0.018, 0.0],
    ],
    darker(fin, 0.35),
  );
  return standUp({
    main: main.part,
    tail: { part: tail.part, pivot: [-0.17, 0, 0] },
    size: 1,
    hook: [0.36, 0, 0],
  });
};

const flounder = (bodyHex: string, finHex: string): Creature => {
  // A flatfish lies on its side: the viewer sees the pigmented side with both eyes on it.
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const pale = lighter(body, 0.72);
  const mark = darker(body, 0.5);
  const skin = skinOf(body, body, mark, "mottled");
  const main = new Builder();
  const keys: Key[] = [
    [0, 0, 0, 0],
    [0.07, 0.022, 0.09, 0.08],
    [0.3, 0.036, 0.2, 0.19],
    [0.6, 0.034, 0.185, 0.17],
    [0.86, 0.022, 0.08, 0.075],
    [1, 0.012, 0.03, 0.03],
  ];
  const ch = (i: 1 | 2 | 3) => keys.map((k) => [k[0], k[i]] as const);
  const N = 30;
  const stations: Station[] = Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1);
    return {
      x: 0.46 - u * 0.78,
      width: sample(ch(1), u),
      top: sample(ch(2), u),
      bottom: sample(ch(3), u),
      cap: 0.02,
    };
  });
  main.loft(stations, 22, (i, a) =>
    Math.sin(a) >= 0 ? skin(i / (N - 1), a * 1.6) : pale,
  );
  // Fringe fins all round the edge, made of rays.
  const edgeTop: V3[] = [];
  const edgeTipTop: V3[] = [];
  const edgeBottom: V3[] = [];
  const edgeTipBottom: V3[] = [];
  for (let k = 0; k < 20; k++) {
    const u = 0.1 + (k / 19) * 0.8;
    const x = 0.46 - u * 0.78;
    const top = sample(ch(2), u);
    const bottom = sample(ch(3), u);
    const wave = 0.012 * Math.sin(k * 1.9);
    edgeTop.push([x, top * 0.96, 0]);
    edgeTipTop.push([x - 0.012, top + 0.065 + wave, 0]);
    edgeBottom.push([x, -bottom * 0.96, 0]);
    edgeTipBottom.push([x - 0.012, -bottom - 0.06 - wave, 0]);
  }
  main.finStrip(edgeTop, edgeTipTop, lighter(fin, 0.12), darker(fin, 0.3));
  main.finStrip(
    edgeBottom,
    edgeTipBottom,
    lighter(fin, 0.12),
    darker(fin, 0.3),
  );
  // Both eyes sit high on the near side, on little bumps.
  for (const [x, y] of [
    [0.34, 0.09],
    [0.29, 0.14],
  ] as const) {
    main.ellipsoid([x, y, 0.03], [0.036, 0.036, 0.022], body, 5, 8);
    eyeAt(main, [x, y, 0.045], 0.02, 1, rgb(0xffcf4a));
  }
  // A small pectoral fin and the mouth.
  main.fan(
    [0.26, -0.02, 0.034],
    [0, 1, 2, 3, 4].map(
      (k): V3 => [
        0.26 - 0.03 - k * 0.012,
        -0.02 - 0.03 - k * 0.006 + k * 0.002,
        0.038,
      ],
    ),
    lighter(fin, 0.1),
    darker(fin, 0.3),
  );
  main.tube(
    [
      [0.455, -0.012, 0.004],
      [0.43, -0.03, 0.014],
      [0.4, -0.04, 0.02],
    ],
    () => 0.005,
    rgb(0x153b80),
    4,
  );
  const tail = new Builder();
  tail.fan(
    [-0.31, 0, 0],
    Array.from({ length: 9 }, (_, k): V3 => {
      const t = (k / 8) * 2 - 1;
      return [-0.31 - (0.15 - 0.04 * t * t), t * 0.1, 0];
    }),
    lighter(fin, 0.12),
    darker(fin, 0.3),
  );
  return {
    main: main.part,
    tail: { part: tail.part, pivot: [-0.31, 0, 0] },
    size: 1,
    hook: [0.46, 0, 0],
  };
};

const seahorse = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const main = new Builder();
  const keys: V3[] = [
    [0.07, 0.43, 0],
    [0.01, 0.35, 0],
    [-0.04, 0.23, 0],
    [-0.06, 0.09, 0],
    [-0.03, -0.05, 0],
    [0.03, -0.17, 0],
    [0.07, -0.29, 0],
    [0.04, -0.41, 0],
    [-0.04, -0.46, 0],
    [-0.11, -0.42, 0],
    [-0.12, -0.34, 0],
    [-0.07, -0.3, 0],
  ];
  const spine = curve(keys, 52);
  const radiusKeys: [number, number][] = [
    [0, 0.032],
    [0.1, 0.04],
    [0.28, 0.075],
    [0.42, 0.085],
    [0.58, 0.05],
    [0.8, 0.026],
    [1, 0.012],
  ];
  const radius = (t: number) => sample(radiusKeys, t);
  const band = (t: number) => {
    const ring = Math.pow(Math.max(0, Math.sin(t * Math.PI * 22)), 2);
    const base =
      t < 0.46 ? mix(lighter(body, 0.45), body, smooth(0.18, 0.5, t)) : body;
    return mix(base, darker(body, 0.35), ring * 0.55);
  };
  main.tube(spine, radius, band, 12);
  // Belly ridges: little bumps down the front of the trunk.
  for (let k = 4; k < 24; k += 2) {
    const p = spine[k]!;
    const r = radius(k / 51);
    main.ellipsoid(
      [p[0] + r * 0.9, p[1], 0],
      [0.014, 0.012, 0.03],
      lighter(body, 0.4),
      4,
      6,
    );
  }
  // Head: a rounded skull, a long snout with a mouth, a crown and a bright eye.
  main.ellipsoid(
    [0.09, 0.45, 0],
    [0.075, 0.065, 0.058],
    mix(body, lighter(body, 0.3), 0.4),
    7,
    10,
  );
  main.tube(
    [
      [0.13, 0.44, 0],
      [0.24, 0.415, 0],
      [0.34, 0.4, 0],
    ],
    (t) => 0.03 * (1 - t * 0.5),
    body,
    8,
  );
  main.tube(
    [
      [0.335, 0.397, 0],
      [0.345, 0.397, 0],
    ],
    () => 0.014,
    darker(body, 0.5),
    6,
  );
  for (const side of [1, -1]) {
    eyeAt(main, [0.11, 0.465, 0.05 * side], 0.02, side, rgb(0xffcf4a));
    main.ellipsoid(
      [0.08, 0.43, 0.06 * side],
      [0.016, 0.014, 0.008],
      darker(body, 0.15),
      4,
      6,
    );
  }
  for (const [dx, h] of [
    [-0.03, 0.1],
    [0.01, 0.085],
    [0.05, 0.07],
  ] as const)
    main.tube(
      [
        [dx, 0.49, 0],
        [dx - 0.015, 0.49 + h, 0],
      ],
      (t) => 0.012 * (1 - t) + 0.002,
      darker(body, 0.15),
      5,
    );
  // A dorsal fin on the back of the trunk and a small pectoral fin by the cheek.
  const dBase: V3[] = [];
  const dTip: V3[] = [];
  for (let k = 0; k < 8; k++) {
    const i = 14 + k * 2;
    const p = spine[i]!;
    const r = radius(i / 51);
    dBase.push([p[0] - r * 0.9, p[1], 0]);
    dTip.push([p[0] - r - 0.07 + 0.012 * Math.sin(k), p[1] - 0.01, 0]);
  }
  main.finStrip(dBase, dTip, lighter(fin, 0.15), darker(fin, 0.25));
  for (const side of [1, -1])
    main.fan(
      [0.02, 0.37, 0.05 * side],
      [0, 1, 2, 3, 4].map(
        (k): V3 => [
          0.02 - 0.045 - k * 0.006,
          0.37 + 0.03 - k * 0.022,
          0.06 * side,
        ],
      ),
      lighter(fin, 0.15),
      darker(fin, 0.25),
    );
  return { main: main.part, size: 1.1, hook: [0.3, 0.41, 0] };
};

/** Blotches on a soft body, from where the point is (so they follow the shape). */
const blotch =
  (base: RGB, mark: RGB, cell: number, chance: number, strength: number) =>
  (p: V3): RGB => {
    const iu = Math.floor(p[0] * cell);
    const iv = Math.floor(p[1] * cell);
    const iw = Math.floor(p[2] * cell);
    const n = noise(iu * 7 + iw * 13, iv * 5 + iw * 3);
    const d = Math.hypot(
      fract(p[0] * cell) - 0.5,
      fract(p[1] * cell) - 0.5,
      fract(p[2] * cell) - 0.5,
    );
    const amount = n < chance ? smooth(0.5, 0.18, d) : 0;
    return mix(base, mark, amount * strength);
  };

/** Rows of suckers along an arm: tiny pale discs on the side facing `facing`. */
function suckers(
  b: Builder,
  path: V3[],
  radius: (t: number) => number,
  facing: V3,
  colour: RGB,
  every = 2,
) {
  for (let i = 2; i < path.length - 2; i += every) {
    const t = i / (path.length - 1);
    const r = radius(t);
    const p = path[i]!;
    for (const lane of [-1, 1]) {
      const side: V3 = [facing[2] * lane, 0, -facing[0] * lane];
      b.ellipsoid(
        [
          p[0] + facing[0] * r * 0.85 + side[0] * r * 0.4,
          p[1] + facing[1] * r * 0.85,
          p[2] + facing[2] * r * 0.85 + side[2] * r * 0.4,
        ],
        [r * 0.34, r * 0.34, r * 0.34],
        colour,
        3,
        5,
      );
    }
  }
}

const squid = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const belly = lighter(body, 0.62);
  const mark = darker(fin, 0.2);
  const dots = (u: number, a: number): RGB => {
    const c = Math.cos(a);
    let col = mix(belly, body, smooth(-0.5, 0.5, c));
    // Chromatophores: little coloured dots over the back and flanks.
    const iu = Math.floor(u * 22);
    const ia = Math.floor(((a / (Math.PI * 2)) % 1) * 16);
    const d = Math.hypot(
      fract(u * 22) - 0.5,
      fract(((a / (Math.PI * 2)) % 1) * 16) - 0.5,
    );
    if (noise(iu, ia) < 0.5)
      col = mix(col, mark, smooth(0.34, 0.12, d) * 0.7 * smooth(-0.3, 0.4, c));
    return col;
  };
  const main = new Builder();
  const N = 26;
  const keys: Key[] = [
    [0, 0, 0, 0],
    [0.08, 0.06, 0.065, 0.06],
    [0.3, 0.1, 0.105, 0.095],
    [0.6, 0.085, 0.085, 0.078],
    [0.85, 0.045, 0.045, 0.04],
    [1, 0.012, 0.012, 0.012],
  ];
  const ch = (i: 1 | 2 | 3) => keys.map((k) => [k[0], k[i]] as const);
  const stations: Station[] = Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1);
    return {
      x: 0.12 - u * 0.58,
      width: sample(ch(1), u),
      top: sample(ch(2), u),
      bottom: sample(ch(3), u),
      cap: i === 0 ? 0.02 : 0.05,
    };
  });
  main.loft(stations, 20, (i, a) => dots(i / (N - 1), a));
  // Two broad fins at the tail end, made of rays.
  for (const side of [1, -1]) {
    const base: V3[] = [];
    const tip: V3[] = [];
    for (let k = 0; k < 9; k++) {
      const u = 0.45 + (k / 8) * 0.5;
      const x = 0.12 - u * 0.58;
      const w = sample(ch(1), u);
      const span = 0.17 * Math.sin(((k + 0.6) / 9.4) * Math.PI);
      base.push([x, 0, w * 0.95 * side]);
      tip.push([x - 0.02, 0.0, (w + span) * side]);
    }
    main.finStrip(base, tip, lighter(fin, 0.2), darker(fin, 0.2));
  }
  // The head, a funnel and two big eyes with horizontal pupils.
  main.ellipsoid(
    [0.15, 0, 0],
    [0.07, 0.075, 0.08],
    mix(body, belly, 0.25),
    7,
    10,
  );
  main.tube(
    [
      [0.1, -0.06, 0],
      [0.16, -0.085, 0],
    ],
    () => 0.018,
    belly,
    6,
  );
  for (const side of [1, -1]) {
    const eye: V3 = [0.16, 0.02, 0.075 * side];
    main.ellipsoid(eye, [0.04, 0.04, 0.026], rgb(0x2b3a4a), 6, 9);
    main.ellipsoid(
      [eye[0], eye[1], eye[2] + 0.014 * side],
      [0.032, 0.032, 0.02],
      rgb(0xffe08a),
      6,
      9,
    );
    main.ellipsoid(
      [eye[0], eye[1], eye[2] + 0.026 * side],
      [0.012, 0.024, 0.01],
      rgb(0x0b1d3a),
      5,
      8,
    );
    main.ellipsoid(
      [eye[0] + 0.01, eye[1] + 0.016, eye[2] + 0.034 * side],
      [0.007, 0.007, 0.006],
      EYE,
      4,
      6,
    );
  }
  // Eight arms with suckers and two long tentacles ending in clubs.
  const armColour = (t: number) => mix(body, mix(belly, fin, 0.4), t * 0.6);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const y = Math.cos(a) * 0.055;
    const z = Math.sin(a) * 0.055;
    const out = Math.hypot(y, z) || 1;
    const path = curve(
      [
        [0.2, y, z],
        [0.3, y * 1.5, z * 1.5],
        [0.4, y * 1.2 + 0.01 * Math.sin(k), z * 1.2],
      ],
      9,
    );
    const r = (t: number) => 0.018 * (1 - t * 0.78) + 0.002;
    main.tube(path, r, armColour, 5);
    suckers(main, path, r, [0, y / out, z / out], lighter(belly, 0.2), 2);
  }
  for (const side of [1, -1]) {
    const path = curve(
      [
        [0.2, 0.005, 0.03 * side],
        [0.36, 0.0, 0.045 * side],
        [0.52, 0.01, 0.035 * side],
      ],
      10,
    );
    main.tube(path, (t) => 0.008 + t * 0.006, darker(body, 0.1), 5);
    main.ellipsoid(
      [0.55, 0.01, 0.035 * side],
      [0.05, 0.02, 0.026],
      lighter(body, 0.1),
      5,
      8,
    );
    for (let i = 0; i < 5; i++)
      main.ellipsoid(
        [0.52 + i * 0.01, 0.026, 0.035 * side],
        [0.006, 0.006, 0.006],
        belly,
        3,
        5,
      );
  }
  return { main: main.part, size: 1.15, hook: [0.2, 0, 0] };
};

const octopus = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const mark = darker(fin, 0.15);
  const belly = lighter(body, 0.45);
  const skin = blotch(body, mark, 26, 0.45, 0.7);
  const main = new Builder();
  // A bulbous mantle, a head under it, warts across the skin.
  main.ellipsoid(
    [-0.03, 0.31, 0],
    [0.17, 0.23, 0.155],
    (p) => mix(skin(p), lighter(body, 0.2), smooth(0.4, 0.55, p[1]) * 0.35),
    9,
    14,
  );
  main.ellipsoid([0.03, 0.12, 0], [0.14, 0.115, 0.14], skin, 8, 12);
  for (let k = 0; k < 28; k++) {
    const a = noise(k, 1) * Math.PI * 2;
    const v = 0.25 + noise(k, 2) * 0.7;
    main.ellipsoid(
      [
        -0.03 + Math.cos(a) * 0.15 * Math.sin(v * 3),
        0.31 + 0.22 * Math.cos(v * 2.6 + 0.3),
        Math.sin(a) * 0.14 * Math.sin(v * 3),
      ],
      [0.012, 0.012, 0.012],
      lighter(body, 0.2),
      3,
      5,
    );
  }
  for (const side of [1, -1]) {
    const eye: V3 = [0.1, 0.16, 0.115 * side];
    main.ellipsoid(
      [eye[0] - 0.01, eye[1] + 0.01, eye[2] - 0.02 * side],
      [0.05, 0.045, 0.03],
      body,
      6,
      9,
    );
    main.ellipsoid(eye, [0.036, 0.036, 0.022], rgb(0x2b3a4a), 6, 9);
    main.ellipsoid(
      [eye[0], eye[1], eye[2] + 0.012 * side],
      [0.029, 0.029, 0.018],
      rgb(0xffcf4a),
      6,
      9,
    );
    main.ellipsoid(
      [eye[0], eye[1], eye[2] + 0.022 * side],
      [0.022, 0.008, 0.009],
      rgb(0x0b1d3a),
      5,
      8,
    );
    main.ellipsoid(
      [eye[0] + 0.008, eye[1] + 0.014, eye[2] + 0.03 * side],
      [0.006, 0.006, 0.005],
      EYE,
      4,
      6,
    );
  }
  main.tube(
    [
      [0.1, 0.06, 0.0],
      [0.14, 0.03, 0.0],
    ],
    () => 0.02,
    belly,
    6,
  );
  // Eight arms fanned out, curling at the tips, suckers down the inside.
  const reach = [0.1, 0.17, 0.25, 0.32, 0.37];
  const drop = [0.06, -0.1, -0.3, -0.5, -0.6];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const curl = k % 2 === 0 ? 1 : -1;
    const path = curve(
      reach.map((r, i): V3 => {
        const wave = Math.sin(i * 1.3) * 0.035 * curl * (i / 4);
        // The tips curl inward.
        const hook = i === 4 ? -0.06 : 0;
        return [
          0.03 + ca * (r + hook) - sa * wave,
          drop[i]!,
          sa * (r + hook) + ca * wave,
        ];
      }),
      16,
    );
    const radius = (t: number) => 0.04 * Math.pow(1 - t, 0.9) + 0.006;
    main.tube(
      path,
      radius,
      (t) =>
        mix(
          skin([
            path[Math.round(t * 15)]![0],
            path[Math.round(t * 15)]![1],
            path[Math.round(t * 15)]![2],
          ]),
          belly,
          t * 0.35,
        ),
      6,
    );
    suckers(main, path, radius, [-ca * 0.3, 0.2, -sa * 0.3], belly, 2);
  }
  return { main: main.part, size: 1.1, hook: [0, 0.52, 0] };
};

const legAt = (
  b: Builder,
  root: V3,
  knee: V3,
  foot: V3,
  radius: number,
  colour: RGB,
  dark: RGB,
) => {
  const upper = curve(
    [
      root,
      [
        (root[0] + knee[0]) / 2,
        (root[1] + knee[1]) / 2,
        (root[2] + knee[2]) / 2,
      ],
      knee,
    ],
    6,
  );
  const lower = curve(
    [
      knee,
      [
        (knee[0] + foot[0]) / 2,
        (knee[1] + foot[1]) / 2,
        (knee[2] + foot[2]) / 2,
      ],
      foot,
    ],
    6,
  );
  b.tube(upper, (t) => radius * (1 - t * 0.2), colour, 6);
  b.ellipsoid(knee, [radius * 1.25, radius * 1.25, radius * 1.25], dark, 4, 6);
  b.tube(
    lower,
    (t) => radius * (0.8 - t * 0.55) + 0.003,
    (t) => mix(colour, dark, t),
    6,
  );
};

const claw = (
  b: Builder,
  root: V3,
  side: number,
  body: RGB,
  tip: RGB,
  scale: number,
) => {
  // Two arm segments, a swollen palm and a pair of toothed pincers.
  const elbow: V3 = [
    root[0] + 0.1 * scale,
    root[1] + 0.02,
    root[2] + 0.1 * scale * side,
  ];
  const wrist: V3 = [
    root[0] + 0.2 * scale,
    root[1] + 0.02,
    root[2] + 0.06 * scale * side,
  ];
  b.tube(curve([root, elbow, wrist], 7), () => 0.022 * scale, body, 6);
  b.ellipsoid(
    elbow,
    [0.03 * scale, 0.03 * scale, 0.03 * scale],
    darker(body, 0.15),
    4,
    6,
  );
  const palm: V3 = [
    wrist[0] + 0.07 * scale,
    wrist[1],
    wrist[2] - 0.01 * scale * side,
  ];
  b.ellipsoid(palm, [0.09 * scale, 0.055 * scale, 0.065 * scale], tip, 7, 10);
  for (const jaw of [1, -1]) {
    const path = curve(
      [
        [
          palm[0] + 0.07 * scale,
          palm[1] + 0.01 * jaw,
          palm[2] + 0.02 * jaw * side,
        ],
        [
          palm[0] + 0.14 * scale,
          palm[1] + 0.02 * jaw,
          palm[2] + 0.025 * jaw * side - 0.015 * side,
        ],
        [palm[0] + 0.19 * scale, palm[1] + 0.005 * jaw, palm[2] - 0.015 * side],
      ],
      7,
    );
    b.tube(
      path,
      (t) => 0.028 * scale * (1 - t * 0.85) + 0.003,
      darker(tip, 0.1 * (jaw + 1)),
      6,
    );
    for (let t = 1; t < 5; t++) {
      const p = path[t]!;
      b.plate(
        [
          [p[0], p[1] - jaw * 0.014 * scale, p[2]],
          [p[0] + 0.014 * scale, p[1] - jaw * 0.004, p[2]],
          [p[0] + 0.006 * scale, p[1] - jaw * 0.026 * scale, p[2]],
        ],
        lighter(tip, 0.6),
      );
    }
  }
};

const crab = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const tip = rgb(finHex);
  const dark = darker(body, 0.35);
  const skin = blotch(body, dark, 14, 0.5, 0.75);
  const main = new Builder();
  // A broad shell with a raised ridge, spiny edges and speckled skin.
  main.ellipsoid(
    [0, 0.1, 0],
    [0.22, 0.1, 0.34],
    (p) => mix(skin(p), lighter(body, 0.3), smooth(0.12, 0.2, p[1]) * 0.4),
    9,
    16,
  );
  main.tube(
    curve(
      [
        [0.14, 0.17, -0.14],
        [0.17, 0.19, 0],
        [0.14, 0.17, 0.14],
      ],
      7,
    ),
    () => 0.008,
    lighter(body, 0.4),
    5,
  );
  for (const side of [1, -1])
    for (let k = 0; k < 6; k++) {
      const a = 0.4 + k * 0.28;
      const x = Math.cos(a) * 0.2;
      const z = Math.sin(a) * 0.31;
      main.plate(
        [
          [x * 0.9, 0.12, z * side * 0.9],
          [x * 1.12, 0.12, z * side * 1.12],
          [x * 1.0 + 0.012, 0.15, z * side * 1.0],
        ],
        lighter(body, 0.2),
      );
    }
  for (let k = 0; k < 24; k++)
    main.ellipsoid(
      [-0.12 + noise(k, 4) * 0.26, 0.19, -0.2 + noise(k, 6) * 0.4],
      [0.012, 0.008, 0.012],
      lighter(body, 0.45),
      3,
      5,
    );
  // Eyes on stalks at the front.
  for (const side of [1, -1]) {
    main.tube(
      [
        [0.17, 0.14, 0.09 * side],
        [0.21, 0.22, 0.1 * side],
      ],
      () => 0.011,
      body,
      5,
    );
    eyeAt(
      main,
      [0.215, 0.235, 0.1 * side],
      0.022,
      1,
      rgb(0xffcf4a),
      [0.6, 0.6, 0],
    );
  }
  // Four walking legs a side, each with a knee, and two big claws.
  for (const side of [1, -1])
    for (let k = 0; k < 4; k++) {
      const x = 0.1 - k * 0.075;
      legAt(
        main,
        [x, 0.07, 0.28 * side],
        [x - 0.03, 0.2, 0.46 * side],
        [x - 0.08, 0.01, 0.6 * side],
        0.02,
        body,
        dark,
      );
    }
  for (const side of [1, -1])
    claw(main, [0.17, 0.09, 0.26 * side], side, body, tip, 1.05);
  return { main: main.part, size: 1.25, hook: [0.22, 0.2, 0] };
};

const lobster = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const tip = rgb(finHex);
  const dark = darker(body, 0.35);
  const belly = lighter(body, 0.5);
  const main = new Builder();
  // A rounded carapace, then ribbed abdomen segments.
  const front: Station[] = [
    { x: 0.34, width: 0, top: 0, bottom: 0, cap: 0.05 },
    { x: 0.28, width: 0.07, top: 0.075, bottom: 0.06 },
    { x: 0.16, width: 0.12, top: 0.125, bottom: 0.09 },
    { x: 0.04, width: 0.125, top: 0.13, bottom: 0.09 },
    { x: -0.04, width: 0.105, top: 0.105, bottom: 0.08, cap: -0.02 },
  ];
  main.loft(front, 18, (_i, a) => {
    const c = Math.cos(a);
    return mix(belly, mix(body, dark, 0.3), smooth(-0.4, 0.5, c));
  });
  for (let k = 0; k < 5; k++) {
    const x0 = -0.05 - k * 0.07;
    const w = 0.095 - k * 0.006;
    const seg: Station[] = [
      { x: x0, width: w * 0.8, top: w * 0.9, bottom: w * 0.7, cap: -0.005 },
      { x: x0 - 0.02, width: w * 1.05, top: w * 1.05, bottom: w * 0.8 },
      {
        x: x0 - 0.065,
        width: w * 0.9,
        top: w * 0.9,
        bottom: w * 0.72,
        cap: -0.005,
      },
    ];
    main.loft(seg, 14, (_i, a) =>
      mix(
        belly,
        mix(body, dark, 0.25 + 0.2 * (k % 2)),
        smooth(-0.4, 0.5, Math.cos(a)),
      ),
    );
    // The flap on each side of the segment.
    for (const side of [1, -1])
      main.plate(
        [
          [x0 - 0.01, -w * 0.4, w * 0.95 * side],
          [x0 - 0.04, -w * 1.3, w * 1.05 * side],
          [x0 - 0.07, -w * 0.4, w * 0.9 * side],
        ],
        mix(body, tip, 0.3),
      );
  }
  // The tail fan: a middle plate and two a side, with rays.
  for (const z of [-0.14, -0.07, 0, 0.07, 0.14]) {
    const base: V3[] = [
      [-0.36, 0.0, z * 0.4],
      [-0.36, 0.0, z * 0.4 + 0.02],
    ];
    const tipP: V3[] = [
      [-0.5 - Math.abs(z) * 0.3, 0.0, z * 1.5],
      [-0.5 - Math.abs(z) * 0.3, 0.0, z * 1.5 + 0.04],
    ];
    main.finStrip(base, tipP, mix(body, tip, 0.25), dark);
  }
  // A short rostrum, long antennae and little antennules.
  main.tube(
    [
      [0.33, 0.04, 0],
      [0.4, 0.07, 0],
    ],
    (t) => 0.012 * (1 - t),
    dark,
    5,
  );
  for (const side of [1, -1]) {
    main.tube(
      curve(
        [
          [0.3, 0.05, 0.03 * side],
          [0.46, 0.12, 0.1 * side],
          [0.7, 0.08, 0.22 * side],
        ],
        12,
      ),
      (t) => 0.01 * (1 - t * 0.8) + 0.002,
      dark,
      4,
    );
    main.tube(
      curve(
        [
          [0.3, 0.02, 0.03 * side],
          [0.4, 0.04, 0.06 * side],
          [0.46, 0.03, 0.05 * side],
        ],
        6,
      ),
      () => 0.005,
      dark,
      4,
    );
    eyeAt(
      main,
      [0.3, 0.08, 0.05 * side],
      0.016,
      1,
      rgb(0x1a2a45),
      [0.6, 0.6, 0],
    );
  }
  // Big claws and the walking legs.
  for (const side of [1, -1])
    claw(main, [0.28, -0.01, 0.09 * side], side, body, tip, 1.15);
  for (const side of [1, -1])
    for (let k = 0; k < 4; k++) {
      const x = 0.2 - k * 0.07;
      legAt(
        main,
        [x, -0.05, 0.1 * side],
        [x - 0.02, -0.07, 0.22 * side],
        [x - 0.05, -0.2, 0.28 * side],
        0.012,
        body,
        dark,
      );
    }
  return { main: main.part, size: 1.2, hook: [0.34, 0.03, 0] };
};

const starfish = (bodyHex: string, finHex: string): Creature => {
  const body = rgb(bodyHex);
  const dot = rgb(finHex);
  const belly = lighter(body, 0.5);
  const main = new Builder();
  // Five tapering arms joined at a raised centre, each a rounded ridge with a flat underside.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const N = 14;
    const rings: V3[][] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const r = 0.04 + t * 0.43;
      const half = 0.105 * Math.pow(1 - t, 0.85) + 0.012;
      const high = 0.075 * Math.pow(1 - t, 0.6) + 0.014;
      const ring: V3[] = [];
      for (let j = 0; j < 12; j++) {
        const th = (j / 12) * Math.PI * 2;
        const across = Math.sin(th) * half;
        const up = Math.cos(th);
        const y = (up >= 0 ? high * up : 0.04 * up * (1 - t * 0.5)) + 0.0;
        ring.push([ca * r + sa * across, y, sa * r - ca * across]);
      }
      rings.push(ring);
    }
    main.grid(rings, (i, j) => {
      const t = i / (N - 1);
      const up = Math.cos((j / 12) * Math.PI * 2);
      return mix(
        belly,
        mix(lighter(body, 0.2), darker(body, 0.12), t),
        smooth(-0.35, 0.4, up),
      );
    });
    main.cap(
      rings[N - 1]!,
      [ca * 0.49, 0.0, sa * 0.49],
      darker(body, 0.15),
      false,
    );
    // A row of bumps down the ridge and little spines along the edge.
    for (let i = 1; i < 12; i++) {
      const t = i / (N - 1);
      const r = 0.04 + t * 0.43;
      const y = 0.075 * Math.pow(1 - t, 0.6) + 0.02;
      main.ellipsoid(
        [ca * r, y, sa * r],
        [0.014 * (1 - t * 0.5), 0.012, 0.014 * (1 - t * 0.5)],
        dot,
        3,
        5,
      );
      for (const edge of [1, -1]) {
        const half = 0.105 * Math.pow(1 - t, 0.85) + 0.012;
        main.ellipsoid(
          [
            ca * r - sa * half * 0.95 * edge,
            0.012,
            sa * r + ca * half * 0.95 * edge,
          ],
          [0.009, 0.01, 0.009],
          lighter(body, 0.4),
          3,
          4,
        );
      }
    }
  }
  // The centre: a raised disc with a pale marking.
  main.ellipsoid([0, 0.07, 0], [0.09, 0.05, 0.09], lighter(body, 0.15), 6, 10);
  main.ellipsoid([0.03, 0.115, 0.02], [0.025, 0.012, 0.025], belly, 4, 7);
  return { main: main.part, size: 1, hook: [0, 0.1, 0] };
};

/** Builds the animal for a body plan, painted with the species' two colours. */
export function buildCreature(
  kind: CreatureKind,
  body: string,
  fin: string,
  look?: Look,
): Creature {
  switch (kind) {
    case "flat":
      return flat(body, fin);
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
      return fishy(kind, body, fin, look);
  }
}
