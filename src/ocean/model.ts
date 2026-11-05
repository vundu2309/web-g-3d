export const SEA_BOUND = 180;
export const BOAT_SPEED = 8;
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
  { x: -68, z: -65, radius: 18 },
  { x: 95, z: -110, radius: 23 },
  { x: 110, z: 70, radius: 15 },
];
export function spawn(uid: string): Pose {
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const angle = ((hash % 360) * Math.PI) / 180;
  return {
    x: Math.sin(angle) * (12 + (hash % 30)),
    z: Math.cos(angle) * (12 + (hash % 30)),
    heading: Math.atan2(Math.sin(angle), Math.cos(angle)),
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
