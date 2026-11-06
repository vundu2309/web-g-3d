import {
  Builder,
  curve,
  darker,
  lighter,
  mix,
  rgb,
  sample,
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

const fishColour = (body: RGB, belly: RGB) => (_s: number, angle: number) => {
  const c = Math.cos(angle);
  return mix(belly, body, Math.min(1, Math.max(0, 0.5 + c * 0.9)));
};

/** Fish read plumper in 3D than their drawings; this keeps them close to the cards. */
const FAT = 1.32;
const fatKeys = (keys: readonly Key[]): Key[] =>
  keys.map(([u, w, t, b]) => [u, w * FAT, t * FAT, b * FAT]);

function stationsOf(plan: FishPlan, n = 13): Station[] {
  const span = plan.noseX - plan.tailX;
  const at = (i: number) => i / (n - 1);
  const keys = fatKeys(plan.keys);
  const channel = (index: 1 | 2 | 3) =>
    keys.map((k) => [k[0], k[index]] as const);
  return Array.from({ length: n }, (_, i) => {
    const u = at(i);
    return {
      x: plan.noseX - u * span,
      width: sample(channel(1), u),
      top: sample(channel(2), u),
      bottom: sample(channel(3), u),
      cap: i === 0 ? 0.03 : 0.012,
    };
  });
}

const fishy = (
  kind: CreatureKind,
  bodyHex: string,
  finHex: string,
): Creature => {
  const plan = PLANS[kind]!;
  const body = rgb(bodyHex);
  const fin = rgb(finHex);
  const belly = lighter(body, 0.62);
  const main = new Builder();
  const stations = stationsOf(plan);
  main.loft(stations, 11, fishColour(body, belly));
  const span = plan.noseX - plan.tailX;
  const xOf = (u: number) => plan.noseX - u * span;
  const widthAt = (x: number) =>
    sample(
      fatKeys(plan.keys)
        .map((k) => [plan.noseX - k[0] * span, k[1]] as const)
        .reverse(),
      x,
    );
  const topAt = (x: number) =>
    sample(
      fatKeys(plan.keys)
        .map((k) => [plan.noseX - k[0] * span, k[2]] as const)
        .reverse(),
      x,
    );
  const bottomAt = (x: number) =>
    sample(
      fatKeys(plan.keys)
        .map((k) => [plan.noseX - k[0] * span, k[3]] as const)
        .reverse(),
      x,
    );
  // Dorsal and anal fins.
  const [d0, d1, dh] = plan.dorsal;
  const dorsalX0 = xOf(d0);
  const dorsalX1 = xOf(d1);
  main.plate(
    [
      [dorsalX0, topAt(dorsalX0) * 0.8, 0],
      [
        (dorsalX0 + dorsalX1) / 2 + 0.03,
        topAt((dorsalX0 + dorsalX1) / 2) + dh,
        0,
      ],
      [dorsalX1, topAt(dorsalX1) * 0.8, 0],
    ],
    fin,
  );
  if (plan.anal) {
    const [a0, a1, ah] = plan.anal;
    const ax0 = xOf(a0);
    const ax1 = xOf(a1);
    main.plate(
      [
        [ax0, -bottomAt(ax0) * 0.8, 0],
        [(ax0 + ax1) / 2 - 0.02, -bottomAt((ax0 + ax1) / 2) - ah, 0],
        [ax1, -bottomAt(ax1) * 0.8, 0],
      ],
      fin,
    );
  }
  // Pectoral fins, one on each side.
  const px = xOf(0.3);
  for (const side of [1, -1])
    main.plate(
      [
        [px, -bottomAt(px) * 0.1, widthAt(px) * side],
        [
          px - plan.pectoral * 1.3,
          -bottomAt(px) * 0.55,
          (widthAt(px) + plan.pectoral * 0.7) * side,
        ],
        [px - plan.pectoral * 0.8, -bottomAt(px) * 0.9, widthAt(px) * side],
      ],
      fin,
    );
  // Eyes.
  const ex = xOf(plan.eyeU);
  for (const side of [1, -1]) {
    const ew = widthAt(ex);
    main.ellipsoid(
      [ex, topAt(ex) * 0.35, ew * 0.88 * side],
      [plan.eyeSize, plan.eyeSize, plan.eyeSize * 0.7],
      EYE,
      5,
      7,
    );
    main.ellipsoid(
      [
        ex + 0.004,
        topAt(ex) * 0.35,
        ew * 0.88 * side + plan.eyeSize * 0.55 * side,
      ],
      [plan.eyeSize * 0.5, plan.eyeSize * 0.5, plan.eyeSize * 0.4],
      INK,
      4,
      6,
    );
  }
  if (kind === "puffer") {
    // Short spines over the round body.
    for (let k = 0; k < 14; k++) {
      const a = k * 2.399;
      const u = 0.2 + ((k * 0.37) % 0.55);
      const x = xOf(u);
      const y = Math.sin(a) * topAt(x) * 0.8;
      const z = Math.cos(a) * widthAt(x) * 0.8;
      if (Math.abs(z) < 0.02 && Math.abs(y) < 0.02) continue;
      main.plate(
        [
          [x, y, z],
          [
            x - 0.02,
            y + Math.sign(y || 1) * 0.045,
            z + Math.sign(z || 1) * 0.04,
          ],
          [x - 0.035, y, z],
        ],
        darker(fin, 0.15),
      );
    }
  }
  if (kind === "sword") {
    // The bill: a long thin cone in front of the face.
    main.tube(
      [
        [plan.noseX, 0, 0],
        [plan.noseX + 0.12, 0, 0],
        [0.5, 0, 0],
      ],
      (t) => 0.022 * (1 - t * 0.92),
      darker(body, 0.2),
      6,
    );
  }
  if (kind === "shark") {
    // A paler underside and gill slits.
    for (let g = 0; g < 3; g++) {
      const gx = xOf(0.17 + g * 0.04);
      for (const side of [1, -1])
        main.plate(
          [
            [gx, topAt(gx) * 0.5, widthAt(gx) * side],
            [gx - 0.006, -bottomAt(gx) * 0.35, widthAt(gx) * side],
          ],
          darker(body, 0.5),
        );
    }
  }
  // The tail swings on its own: a separate part pivoting where the body ends.
  const tailBuilder = new Builder();
  const tx = plan.tailX;
  const s = plan.tailSpan;
  const tailPoints: V3[] =
    plan.tail === "round"
      ? [
          [tx, 0.016, 0],
          [tx - 0.1, s * 0.75, 0],
          [tx - 0.2, s * 0.55, 0],
          [tx - 0.21, 0, 0],
          [tx - 0.2, -s * 0.55, 0],
          [tx - 0.1, -s * 0.75, 0],
          [tx, -0.016, 0],
        ]
      : plan.tail === "lunate"
        ? [
            [tx, 0.016, 0],
            [tx - 0.08, s * 0.55, 0],
            [tx - 0.21, s * 1.25, 0],
            [tx - 0.14, 0, 0],
            [tx - 0.21, -s * 1.25, 0],
            [tx - 0.08, -s * 0.55, 0],
            [tx, -0.016, 0],
          ]
        : [
            [tx, 0.016, 0],
            [tx - 0.17, s * 1.1, 0],
            [tx - 0.12, 0, 0],
            [tx - 0.17, -s * 1.1, 0],
            [tx, -0.016, 0],
          ];
  if (kind === "shark")
    tailPoints.splice(
      0,
      tailPoints.length,
      [tx, 0.02, 0],
      [tx - 0.06, s * 0.8, 0],
      [tx - 0.24, s * 1.7, 0],
      [tx - 0.15, s * 0.2, 0],
      [tx - 0.2, -s * 0.9, 0],
      [tx - 0.06, -s * 0.5, 0],
      [tx, -0.02, 0],
    );
  tailBuilder.plate(tailPoints, fin);
  return {
    main: main.part,
    tail: { part: tailBuilder.part, pivot: [tx, 0, 0] },
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
