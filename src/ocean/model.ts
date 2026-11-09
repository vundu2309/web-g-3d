export const SEA_BOUND = 180;
export const BOAT_SPEED = 12;
export const PRESENCE_MS = 30000;
export interface Pose {
  x: number;
  z: number;
  heading: number;
  fishing: boolean;
}
export interface Boat extends Pose {
  uid: string;
  name: string;
  session: string;
  updatedAt: number;
}
export const islands = [
  { x: -68, z: -65, radius: 31 },
  { x: 95, z: -110, radius: 39 },
  { x: 110, z: 70, radius: 26 },
];
/** Shoreline radius the hull collides at: just past the visible beach edge. */
export const islandCollisionRadius = (island: { radius: number }) =>
  island.radius * 1.08;
/**
 * Everyone starts in one small harbor, all facing the open sea, so players see each
 * other from the first second. (They used to start up to 40 m apart facing random
 * directions, which put the other boat behind or beside the camera.)
 */
export const HARBOR = { x: 0, z: 22 };
const SLOTS: ReadonlyArray<readonly [number, number]> = [
  [-10.5, 0],
  [-3.5, 0],
  [3.5, 0],
  [10.5, 0],
  [-10.5, 7],
  [-3.5, 7],
  [3.5, 7],
  [10.5, 7],
];
export function spawn(uid: string): Pose {
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [dx, dz] = SLOTS[hash % SLOTS.length]!;
  // A little jitter so two accounts that share a slot do not stack exactly.
  const jitter = (shift: number) => (((hash >>> shift) % 100) / 100 - 0.5) * 3;
  return {
    x: HARBOR.x + dx + jitter(8),
    z: HARBOR.z + dz + jitter(16),
    heading: 0,
    fishing: false,
  };
}
export function move(
  pose: Pose,
  steer: number,
  throttle: number,
  dt: number,
): Pose {
  if (pose.fishing) return pose;
  const step = Math.max(0, Math.min(dt, 0.05));
  const heading = Math.atan2(
    Math.sin(pose.heading + steer * step * 1.8),
    Math.cos(pose.heading + steer * step * 1.8),
  );
  const speed = Math.max(-0.45, Math.min(1, throttle)) * BOAT_SPEED;
  const x = Math.max(
    -SEA_BOUND,
    Math.min(SEA_BOUND, pose.x + Math.sin(heading) * speed * step),
  );
  const z = Math.max(
    -SEA_BOUND,
    Math.min(SEA_BOUND, pose.z - Math.cos(heading) * speed * step),
  );
  if (
    islands.some(
      (island) => Math.hypot(x - island.x, z - island.z) < island.radius + 3,
    )
  )
    return { ...pose, heading };
  return { ...pose, x, z, heading };
}
export function readBoat(
  uid: string,
  value: Record<string, unknown>,
): Boat | null {
  const { name, session, x, z, heading, fishing, updatedAt } = value;
  const stamp = updatedAt as { toMillis?: () => number } | undefined;
  if (
    typeof name !== "string" ||
    !name.length ||
    name.length > 24 ||
    typeof session !== "string" ||
    session.length > 64 ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    Math.abs(x) > SEA_BOUND ||
    typeof z !== "number" ||
    !Number.isFinite(z) ||
    Math.abs(z) > SEA_BOUND ||
    typeof heading !== "number" ||
    !Number.isFinite(heading) ||
    Math.abs(heading) > Math.PI ||
    typeof fishing !== "boolean" ||
    typeof stamp?.toMillis !== "function"
  )
    return null;
  return {
    uid,
    name,
    session,
    x,
    z,
    heading,
    fishing,
    updatedAt: stamp.toMillis(),
  };
}
