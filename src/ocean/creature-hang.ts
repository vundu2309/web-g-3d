import { bounds, type Creature } from "./creature-geometry.ts";

/**
 * How a landed animal hangs from the rod tip. A fish hangs nose up by the mouth, which is the
 * quarter turn about Z that puts +X on top, with the origin half a model unit below the line's
 * end (the nose is about 0.5 from the origin). An animal whose hook is not on its nose axis hangs
 * by the hook instead: the octopus's is on top of its head (+Y) and the seahorse's up its snout
 * (+X and +Y), and a quarter turn about Z would lay the octopus on its side with its face to the
 * sky. For them the roll turns the hook direction to up, and the drop is how far the model reaches
 * toward the hook, so the line ends at its top. Pure; the gear applies it.
 */
export interface HangPose {
  /** Rotation about Z (radians) of the hanging animal, before its slow spin about Y. */
  roll: number;
  /** Model units from the line's end down to the animal's origin. */
  drop: number;
}

const FISH: HangPose = { roll: Math.PI / 2, drop: 0.5 };
/** The hook this close to the nose axis, or this close to the origin, is a fish's (or a starfish's). */
const AXIS = 0.3;
const NEAR = 0.15;

const known = new WeakMap<Creature, HangPose>();

export function hangPose(creature: Creature): HangPose {
  const found = known.get(creature);
  if (found) return found;
  const [hx, hy] = creature.hook;
  const angle = Math.atan2(hy, hx);
  let pose = FISH;
  if (Math.hypot(hx, hy) > NEAR && Math.abs(angle) > AXIS) {
    const parts = [
      creature.main,
      ...(creature.tail ? [creature.tail.part] : []),
    ];
    let reach = -Infinity;
    for (const part of parts) {
      const { min, max } = bounds(part);
      for (const x of [min[0]!, max[0]!])
        for (const y of [min[1]!, max[1]!])
          reach = Math.max(reach, x * Math.cos(angle) + y * Math.sin(angle));
    }
    pose = { roll: Math.PI / 2 - angle, drop: reach };
  }
  known.set(creature, pose);
  return pose;
}
