import { PAL } from "./art/colors.ts";

/**
 * The people of the sea, as plain data and plain maths: how each one looks and how their joints
 * move. No Babylon in here, so the looks and the poses are tested without a browser; the
 * figure itself is built in npc-visual.ts. The people are small cartoon figures (a big round
 * head, a short body) made of parts that overlap at the joints, so nothing floats apart.
 *
 * Colours are never written here: every one is a role of the shared palette (art/colors.ts).
 */
export type HatKind = "none" | "non" | "cap" | "scarf";

export interface NpcLook {
  skin: number;
  hair: number;
  /** Hair that falls down the back. */
  longHair: boolean;
  shirt: number;
  pants: number;
  shoes: number;
  /** An apron over the shirt, when there is one. */
  apron?: number;
  hat: HatKind;
  hatColor?: number;
  /** 1 is a figure about 1.5 m tall; the vendors are drawn larger than life so the face and the wave read from a boat. */
  scale: number;
}

const P = PAL.people;

export const NPC_LOOKS = {
  /** Slim, long black hair, ao ba ba, teal apron, conical hat. */
  lan: {
    skin: P.skin.fair,
    hair: P.hair.black,
    longHair: true,
    shirt: P.clothes.babaCream,
    pants: P.clothes.blackPants,
    shoes: P.clothes.sandal,
    apron: P.clothes.apronTeal,
    hat: "non",
    hatColor: P.clothes.hatStraw,
    scale: 1.5,
  },
  /** Dark-skinned, cap, fisherman's shirt. */
  tu: {
    skin: P.skin.deep,
    hair: P.hair.black,
    longHair: false,
    shirt: P.clothes.fisherShirt,
    pants: P.clothes.fisherPants,
    shoes: P.clothes.sandal,
    hat: "cap",
    hatColor: P.clothes.capNavy,
    scale: 1.6,
  },
  /** Brown hair under a coral scarf, maroon ao ba ba, rose apron. */
  sau: {
    skin: P.skin.warm,
    hair: P.hair.brown,
    longHair: true,
    shirt: P.clothes.babaMaroon,
    pants: P.clothes.blackPants,
    shoes: P.clothes.sandal,
    apron: P.clothes.apronRose,
    hat: "scarf",
    hatColor: P.clothes.scarfCoral,
    scale: 1.45,
  },
  /** Short brown hair, lilac ao ba ba, sky apron. */
  em: {
    skin: P.skin.light,
    hair: P.hair.brown,
    longHair: false,
    shirt: P.clothes.babaLilac,
    pants: P.clothes.blackPants,
    shoes: P.clothes.sandal,
    apron: P.clothes.apronSky,
    hat: "none",
    scale: 1.4,
  },
  /** Mustard shirt and a blue cap. */
  ngudan: {
    skin: P.skin.tan,
    hair: P.hair.dark,
    longHair: false,
    shirt: P.clothes.babaMustard,
    pants: P.clothes.blackPants,
    shoes: P.clothes.sandal,
    hat: "cap",
    hatColor: P.clothes.scarfBlue,
    scale: 1.5,
  },
} as const satisfies Record<string, NpcLook>;

export type NpcLookId = keyof typeof NPC_LOOKS;

/** Where the joints sit on a figure of scale 1 (m), measured from the soles of the feet. */
export const NPC_RIG = {
  hipsY: 0.46,
  /** The shoulder and the hip, from the hips node. */
  shoulder: { x: 0.19, y: 0.46 },
  hip: { x: 0.085, y: 0.03 },
  headY: 0.55,
} as const;

/** One joint of an arm: swinging forward and back (x) and out to the side (z), in radians. */
export interface ArmPose {
  x: number;
  z: number;
}

export interface NpcPose {
  /** Lift of the whole body above its resting height (m, before the figure's scale). */
  hipsY: number;
  /** Head tilt to the side (radians). */
  headZ: number;
  /** Left and right leg swing (radians). */
  legs: readonly [number, number];
  arms: readonly [ArmPose, ArmPose];
}

/**
 * The arm that waves: the one hanging at +x (index 1). A turn about z by a positive angle
 * swings an arm hanging at +x out to the side and up, and one at -x across the body, so
 * outward is positive for index 1 and negative for index 0.
 */
export const WAVE_ARM = 1;
/** A wave lasts this long out of every WAVE_EVERY seconds. */
export const WAVE_SECONDS = 2.2;
export const WAVE_EVERY = 8;

/** Standing and breathing slowly. */
export function idlePose(t: number): NpcPose {
  const breath = Math.sin(t * 1.6);
  return {
    hipsY: breath * 0.008,
    headZ: Math.sin(t * 0.9) * 0.03,
    legs: [0, 0],
    arms: [
      { x: breath * 0.03, z: -0.06 },
      { x: -breath * 0.03, z: 0.06 },
    ],
  };
}

/** How far the waving arm is raised (0 resting, 1 at the top) at time t. */
export function waveAmount(t: number): number {
  const cycle = ((t % WAVE_EVERY) + WAVE_EVERY) % WAVE_EVERY;
  return cycle < WAVE_SECONDS ? Math.sin((cycle / WAVE_SECONDS) * Math.PI) : 0;
}

/** Standing and breathing, and every few seconds a wave with the right arm. */
export function wavePose(t: number): NpcPose {
  const base = idlePose(t);
  const raised = waveAmount(t);
  if (raised === 0) return base;
  const arms = [base.arms[0], base.arms[1]] as [ArmPose, ArmPose];
  // The arm lifts out to the side and over the shoulder, a little forward, and its swing is
  // the wave itself.
  arms[WAVE_ARM] = {
    x: -raised * 0.35,
    z: raised * (2.45 + Math.sin(t * 9) * 0.3),
  };
  return { ...base, arms };
}

/** Walking: `phase` advances by 2 pi per stride (two steps). */
export function walkPose(phase: number): NpcPose {
  const s = Math.sin(phase);
  return {
    hipsY: Math.abs(Math.cos(phase)) * 0.025,
    headZ: s * 0.04,
    legs: [s * 0.7, -s * 0.7],
    arms: [
      { x: -s * 0.6, z: -0.06 },
      { x: s * 0.6, z: 0.06 },
    ],
  };
}
