/**
 * The three cat vendors of the fish markets (public/models/cat-*.glb, made in Blender by
 * tools/blender/vendors.py) as plain data and plain maths: which file belongs to which vendor look,
 * the names of the five parts of every model and how those parts move. No Babylon in here, so the
 * poses are tested without a browser; the loading is in cats.ts and the placing on the pier in
 * market-vendor.ts.
 *
 * Every model is an empty `vendor-<id>` at the feet with five children (the parts), each with a
 * pivot of its own (head at the neck, arms at the shoulders, tail at its base), so the poses are
 * rotations of the parts about their own origins: no skeleton.
 */
export const CAT_IDS = ["lan", "tu", "sau"] as const;
export type CatId = (typeof CAT_IDS)[number];

/** The GLB of a cat, under public/models. */
export const catFile = (id: CatId) => `cat-${id}.glb`;
/** The root node of a cat's GLB. */
export const catRoot = (id: CatId) => `vendor-${id}`;

export const CAT_PARTS = [
  "body",
  "head",
  "arm-left",
  "arm-right",
  "tail",
] as const;
export type CatPart = (typeof CAT_PARTS)[number];

/** The model is life-size for a small cat person (1.2 to 1.33 m); the pier draws it a little larger so the face reads from a boat. */
export const CAT_SCALE = 1.6;

/** Per-cat tempo: how each one breathes, nods and sways, so the three never move in step. */
export const CAT_MOTION: Record<
  CatId,
  {
    breathRate: number;
    headRate: number;
    nodRate: number;
    tailRate: number;
    tailPhase: number;
    tailSwing: number;
  }
> = {
  /** Slim and quick: a lively tail. */
  lan: {
    breathRate: 1.7,
    headRate: 0.9,
    nodRate: 0.6,
    tailRate: 1.3,
    tailPhase: 0.4,
    tailSwing: 0.32,
  },
  /** The big one: slow and heavy. */
  tu: {
    breathRate: 1.3,
    headRate: 0.7,
    nodRate: 0.5,
    tailRate: 0.9,
    tailPhase: 2.1,
    tailSwing: 0.24,
  },
  /** The elder: a slow, small sway. */
  sau: {
    breathRate: 1.1,
    headRate: 0.55,
    nodRate: 0.4,
    tailRate: 0.7,
    tailPhase: 4.0,
    tailSwing: 0.18,
  },
};

/** A wave lasts this long out of every WAVE_EVERY seconds. */
export const WAVE_SECONDS = 2.2;
export const WAVE_EVERY = 8;

/** Rotations (radians) of the parts, relative to their rest pose, and the breath. */
export interface CatPose {
  /** The body's height scale (1 at rest): the chest rises a few millimetres when the cat breathes in. */
  bodyScaleY: number;
  /** How far the head, the arms and the tail rise with the chest (m, in the model's own size). */
  lift: number;
  head: { x: number; z: number };
  /** Right arm (the cat's right, glTF -x): x swings it forward and back, z out to the side. */
  armRight: { x: number; z: number };
  armLeft: { x: number; z: number };
  tail: { y: number; z: number };
}

/** How far the waving arm is raised (0 resting, 1 at the top) at time t. */
export function waveAmount(t: number): number {
  const cycle = ((t % WAVE_EVERY) + WAVE_EVERY) % WAVE_EVERY;
  return cycle < WAVE_SECONDS ? Math.sin((cycle / WAVE_SECONDS) * Math.PI) : 0;
}

/** The chest's rise at its highest (a fraction of the body's height: about 5 mm on a 65 cm body). */
export const BREATH = 0.008;

/**
 * The pose of cat `id` at sea-clock time `t` (s). `phase` (s) shifts the whole cycle, so two cats
 * of one look in two markets would not move in step; the wave comes 2.2 s in every 8.
 */
export function catPose(id: CatId, t: number, phase = 0): CatPose {
  const m = CAT_MOTION[id];
  const u = t + phase;
  const breath = Math.sin(u * m.breathRate);
  const raised = waveAmount(u);
  // Outward is negative for the right arm (it hangs at -x): a turn about z by a negative angle
  // swings it out and up. The wave lifts it past the shoulder and the paw flutters a little.
  const wave = raised * (2.35 + Math.sin(u * 9) * 0.28);
  return {
    bodyScaleY: 1 + BREATH * (0.5 + 0.5 * breath),
    lift: BREATH * 0.6 * (0.5 + 0.5 * breath),
    head: {
      x: Math.sin(u * m.nodRate + 1) * 0.05,
      z: Math.sin(u * m.headRate) * 0.07,
    },
    armRight: { x: -raised * 0.3 + breath * 0.02, z: -0.05 - wave },
    armLeft: { x: -breath * 0.02, z: 0.05 },
    tail: {
      y: Math.sin(u * m.tailRate * 0.8 + m.tailPhase + 1.3) * m.tailSwing * 0.5,
      z: Math.sin(u * m.tailRate + m.tailPhase) * m.tailSwing,
    },
  };
}
