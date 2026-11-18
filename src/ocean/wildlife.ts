import { beachRise } from "./island-shape.ts";
import { islands } from "./model.ts";
import { coastAt, shoreTable } from "./shore.ts";

/**
 * The living animals that share the sea with the boats: dolphins that swim in pods and leap,
 * turtles and jellyfish that drift near the islands, crabs that scuttle on the beaches and
 * starfish lying on the wet sand. They are scenery, like the gulls (sea-layout.ts): none is
 * solid, none is part of the shared state, and where each one is at a time `t` is a pure
 * function of `t`, so every player sees the same animals without any message. They never change
 * what can be caught or what a fish is worth.
 *
 * The models are the fish files of the species (glb-parts.ts), which are heavy (a crab is 78,048
 * triangles). So only the animals near the player are drawn, with a cap per kind and a budget of
 * triangles for all of them (`chooseVisible`); the rest are hidden and cost nothing.
 * Pure maths with no Babylon, so it is tested without a browser; wildlife-scene.ts draws it.
 */
export type Kind = "dolphin" | "turtle" | "jellyfish" | "crab" | "starfish";

export interface KindSpec {
  /** The species whose model draws it (fish-<species>.glb). */
  species: string;
  /** How long it is drawn (m), its longest side; larger than life where the real animal is small. */
  length: number;
  /** Triangles of its model, for the budget. */
  triangles: number;
  /** Beyond this distance from the player (m) it is not drawn. */
  range: number;
  /** At most this many of the kind are drawn at once. */
  cap: number;
}

export const KINDS: Readonly<Record<Kind, KindSpec>> = {
  dolphin: {
    species: "ca-heo",
    length: 4,
    triangles: 600,
    range: 260,
    cap: 8,
  },
  turtle: {
    species: "rua-bien",
    length: 3,
    triangles: 17512,
    range: 110,
    cap: 2,
  },
  jellyfish: {
    species: "sua",
    length: 2.4,
    triangles: 58756,
    range: 90,
    cap: 1,
  },
  crab: {
    species: "cua-bien",
    length: 0.8,
    triangles: 78048,
    range: 45,
    cap: 1,
  },
  starfish: {
    species: "sao-bien",
    length: 0.6,
    triangles: 10732,
    range: 45,
    cap: 2,
  },
};

/** Most triangles of animals drawn at once, all kinds together. */
export const TRIANGLE_BUDGET = 200_000;

export interface Animal {
  id: string;
  kind: Kind;
  /** Which island it lives by (an index of `islands`). */
  island: number;
  /** Fixes its phases, speeds and spot; the same animal is always the same. */
  seed: number;
  /** Its place in a pod (0 for a lone animal). */
  member: number;
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const build = (): Animal[] => {
  const list: Animal[] = [];
  islands.forEach((_, island) => {
    const add = (kind: Kind, member: number, n: number) =>
      list.push({
        id: `${kind}-${island}-${n}`,
        kind,
        island,
        seed: island * 31 + n * 7 + member * 3 + 1,
        member,
      });
    // A pod of three swims round every second island.
    if (island % 2 === 0) for (let m = 0; m < 3; m++) add("dolphin", m, m);
    add("turtle", 0, 0);
    if (island % 2 === 1) add("jellyfish", 0, 0);
    for (let n = 0; n < 2; n++) add("crab", 0, n);
    for (let n = 0; n < 2; n++) add("starfish", 0, n);
  });
  return list;
};

export const ANIMALS: readonly Animal[] = build();

export interface WildPose {
  x: number;
  z: number;
  /**
   * "sea": `y` is metres above the local wave height; "ground": `y` is the world height (the
   * sand, which does not move).
   */
  level: "sea" | "ground";
  y: number;
  /** Rotation about Y that points the model's nose (+X) along its way. */
  heading: number;
  /** Nose up (rad) and lean about the nose axis (rad). */
  pitch: number;
  roll: number;
  /** Multipliers of the kind's length (1 = unchanged): a jellyfish pulses by squashing. */
  sx: number;
  sy: number;
  sz: number;
}

const tables = new Map<number, Float32Array>();
const tableOf = (island: number) => {
  let table = tables.get(island);
  if (!table) tables.set(island, (table = shoreTable(island)));
  return table;
};

/** The coast's radius (m) of island `island` at `angle`. */
const coastRadius = (island: number, angle: number) =>
  coastAt(tableOf(island), angle).fraction * islands[island]!.radius;

/** A point `offset` m out from the coast (negative: inland) at `angle` round the island. */
function ringPoint(island: number, angle: number, offset: number) {
  const home = islands[island]!;
  const rho = coastRadius(island, angle) + offset;
  return {
    x: home.x + Math.cos(angle) * rho,
    z: home.z + Math.sin(angle) * rho,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Heading that points the nose along the direction (vx, vz). */
const headingOf = (vx: number, vz: number) => Math.atan2(-vz, vx);

/**
 * An animal drifting round its island at `speed` m/s (negative: the other way), `offset` m off the
 * coast, drifting in and out by up to `wobble` m. `phase` is where on the circle it starts.
 */
function circling(
  island: number,
  t: number,
  speed: number,
  offset: number,
  wobble: number,
  phase: number,
  /** The offset that sets how fast it goes round; a pod shares one so its members stay together. */
  pace = offset,
) {
  const home = islands[island]!;
  // The angle advances at a steady rate (the wobble only moves it in and out), so its speed is
  // the one asked for at every time.
  const angle = phase + (speed / (home.radius + pace)) * t;
  const off = offset + wobble * Math.sin(0.03 * t + phase * 3);
  const at = ringPoint(island, angle, off);
  const direction = Math.sign(speed);
  // The way it faces is the tangent of the circle.
  return {
    ...at,
    heading: headingOf(
      -Math.sin(angle) * direction,
      Math.cos(angle) * direction,
    ),
    phase,
  };
}

/** Where animal `a` is, and how it is posed, at time `t` seconds. */
export function wildPose(a: Animal, t: number): WildPose {
  const length = KINDS[a.kind].length;
  switch (a.kind) {
    case "dolphin": {
      // A pod keeps together: each member a few metres apart along the ring and across it.
      const side = a.island % 4 === 0 ? 1 : -1;
      // The whole pod starts at one place on the ring; only the member's offsets differ.
      const start = hash(a.island + 0.5) * Math.PI * 2;
      const base = circling(
        a.island,
        t - a.member * 0.9,
        3.4 * side,
        48 + 6 * a.member,
        9,
        start,
        48,
      );
      // Every so often it leaps: a short arc clear of the water, nose up then down.
      const period = 15 + (a.island % 3) * 3;
      const lap = (t + a.member * 0.45 + hash(a.island) * period) % period;
      const jump = 2;
      if (lap < jump) {
        const s = lap / jump;
        return {
          x: base.x,
          z: base.z,
          level: "sea",
          y: 2.3 * Math.sin(Math.PI * s),
          heading: base.heading,
          pitch: 0.7 * Math.cos(Math.PI * s),
          roll: 0,
          sx: 1,
          sy: 1,
          sz: 1,
        };
      }
      const swim = 1.7 * t + base.phase;
      return {
        x: base.x,
        z: base.z,
        level: "sea",
        y: -0.08 + 0.06 * Math.sin(swim),
        heading: base.heading,
        pitch: 0.08 * Math.sin(swim),
        roll: 0.05 * Math.sin(swim * 0.7),
        sx: 1,
        sy: 1,
        sz: 1,
      };
    }
    case "turtle": {
      const base = circling(
        a.island,
        t,
        0.5 * (a.island % 2 ? 1 : -1),
        26,
        14,
        hash(a.seed) * Math.PI * 2,
      );
      const bob = 0.9 * t + base.phase;
      return {
        x: base.x,
        z: base.z,
        level: "sea",
        y: -0.1 + 0.04 * Math.sin(bob),
        heading: base.heading,
        pitch: 0.06 * Math.sin(bob),
        roll: 0.1 * Math.sin(0.6 * t + base.phase),
        sx: 1,
        sy: 1,
        sz: 1,
      };
    }
    case "jellyfish": {
      const base = circling(
        a.island,
        t,
        0.25,
        45,
        22,
        hash(a.seed) * Math.PI * 2,
      );
      const pulse = Math.sin(2.4 * t + base.phase);
      return {
        x: base.x,
        z: base.z,
        level: "sea",
        // The bell's top just clears the water; the tentacles hang below it.
        y: 0.12 - 0.5 * length + 0.06 * Math.sin(1.1 * t + base.phase),
        heading: 0.1 * t + base.phase,
        pitch: 0,
        roll: 0,
        sx: 1 - 0.05 * pulse,
        sy: 1 + 0.1 * pulse,
        sz: 1 - 0.05 * pulse,
      };
    }
    case "crab": {
      // On the dry sand, a few metres in from the waterline, scuttling sideways along the beach
      // and stopping at each end of its run.
      const phase = hash(a.seed) * Math.PI * 2;
      const home = hash(a.seed + 5) * Math.PI * 2;
      const inland = 4 + 5 * hash(a.seed + 9);
      const run = clamp(1.8 * Math.sin(0.3 * t + phase), -1, 1);
      const rho = coastRadius(a.island, home) - inland;
      const angle = home + (run * 4.5) / rho;
      const at = ringPoint(a.island, angle, -inland);
      return {
        ...at,
        level: "ground",
        y: beachRise(inland) + 0.17 * length,
        // Nose toward the sea, as a crab faces while it walks sideways.
        heading: headingOf(Math.cos(angle), Math.sin(angle)),
        pitch: 0,
        roll: 0,
        sx: 1,
        sy: 1,
        sz: 1,
      };
    }
    case "starfish": {
      const angle = hash(a.seed) * Math.PI * 2;
      const inland = 0.4 + 1.2 * hash(a.seed + 3);
      const at = ringPoint(a.island, angle, -inland);
      return {
        ...at,
        level: "ground",
        y: beachRise(inland) + 0.02,
        heading: hash(a.seed + 8) * Math.PI * 2,
        pitch: 0,
        roll: 0,
        sx: 1,
        sy: 1,
        sz: 1,
      };
    }
  }
}

/**
 * Which animals to draw: those within their kind's range of the player, nearest first, at most
 * `cap` of a kind and no more than `budget` triangles in all.
 */
export function chooseVisible(
  viewer: { x: number; z: number },
  t: number,
  budget = TRIANGLE_BUDGET,
  animals: readonly Animal[] = ANIMALS,
): Set<string> {
  const near: { id: string; kind: Kind; distance: number }[] = [];
  for (const a of animals) {
    const pose = wildPose(a, t);
    const distance = Math.hypot(pose.x - viewer.x, pose.z - viewer.z);
    if (distance <= KINDS[a.kind].range)
      near.push({ id: a.id, kind: a.kind, distance });
  }
  near.sort((p, q) => p.distance - q.distance);
  const counts: Partial<Record<Kind, number>> = {};
  const chosen = new Set<string>();
  let spent = 0;
  for (const n of near) {
    const spec = KINDS[n.kind];
    if ((counts[n.kind] ?? 0) >= spec.cap) continue;
    if (spent + spec.triangles > budget) continue;
    counts[n.kind] = (counts[n.kind] ?? 0) + 1;
    spent += spec.triangles;
    chosen.add(n.id);
  }
  return chosen;
}
