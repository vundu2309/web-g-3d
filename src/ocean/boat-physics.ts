import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import { SEA_BOUND } from "./model.ts";
import { waveHeight } from "./waves.ts";

/**
 * Havok rigid-body boat. Havok integrates the body and resolves collisions; this
 * module adds what Havok does not know: buoyancy from the shared wave function,
 * anisotropic water drag, propeller thrust and a rudder. All of it is applied as
 * impulses (force * dt) before each physics step, so it is frame-rate independent.
 *
 * Local axes: the bow points to local -Z, matching the movement model (heading 0
 * moves toward -Z and a positive steer turns right, increasing heading).
 */
export interface IslandBody {
  x: number;
  z: number;
  radius: number;
}
export interface BoatInput {
  /** -1 left .. 1 right (analog). */
  steer: number;
  /** -1 reverse .. 1 full ahead (analog). */
  throttle: number;
}
export interface BoatState {
  x: number;
  y: number;
  z: number;
  heading: number;
  roll: number;
  pitch: number;
  /** Speed over water along the bow, m/s (negative when reversing). */
  forwardSpeed: number;
  /** Speed across the hull, m/s. */
  sideSpeed: number;
}
export interface BoatPhysics {
  readonly input: BoatInput;
  readonly mesh: Mesh;
  state(): BoatState;
  dispose(): void;
}
export interface BoatPhysicsOptions {
  islands: readonly IslandBody[];
  /** Sea clock in seconds, the same one the water shader uses. */
  time: () => number;
  /** Extra height of the water on top of the waves, such as the boats' wakes (m). */
  extraHeight?: (x: number, z: number, t: number) => number;
  start?: { x: number; z: number; heading: number };
}

export const HULL = { width: 2.8, height: 1.4, length: 7.4, mass: 900 };
const DRAFT = 0.45;
const BOTTOM = -HULL.height / 2;
// Six hull-bottom sample points: stern, midship and bow on each side.
const SAMPLES = [-1, 1].flatMap((side) =>
  [3, 0, -3].map((z) => new Vector3(side * 1.1, BOTTOM, z)),
);
const STIFFNESS = (HULL.mass * 9.81) / (SAMPLES.length * DRAFT); // N per metre submerged
const HEAVE_DAMPING = 520; // N·s/m per sample
export const THRUST = 6000;
/** Nominal top speed with the hull planing (m/s); the real one comes out of the drag below. */
export const TOP_SPEED = 12;
// With the planing drag cut below, this gives a top speed a little over TOP_SPEED.
const C_FORWARD = THRUST / (12 * 12);
const C_SIDE = C_FORWARD * 13; // the keel resists sideslip far more than motion ahead
const C_LINEAR = 60;
const RUDDER = 2600;

// Parting the water. The hull pushes a bow wave and, as it speeds up, climbs it ("the
// hump", near HUMP_SPEED): the bow rises and the wave-making drag peaks. Past it the hull
// rides up on the water (planing): lighter, less wetted, less drag. All of it grows from
// the speed along the keel, so a slow boat behaves as before.
const WEIGHT = HULL.mass * 9.81;
export const HUMP_SPEED = 7;
const HUMP_WIDTH = 2.2;
const WAVE_DRAG = 1100; // N at the peak of the hump
const BOW_LIFT = 0.3 * WEIGHT; // N at the peak of the hump, at the bow
const PLANE_FROM = 6;
const PLANE_TO = 10.5;
const PLANE_LIFT = 0.22 * WEIGHT; // N, at full planing, at the centre
const PLANE_DRAG_CUT = 0.15; // the share of forward drag that goes away at full planing
const BANK = 2800; // N·m·s: how hard the hull leans into a turn at speed
const BOW = new Vector3(0, BOTTOM, -3.2);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 0 away from the hump speed, 1 at it. */
export const humpAt = (speed: number) =>
  Math.exp(-(((speed - HUMP_SPEED) / HUMP_WIDTH) ** 2));
/** 0 below planing speed, 1 once the hull is up on the water. */
export const planingAt = (speed: number) =>
  smoothstep(PLANE_FROM, PLANE_TO, speed);

/**
 * Turns physics on with a fixed 60 Hz step. Havok then integrates identical steps
 * at any frame rate (a 30 fps phone runs two steps per frame) and results repeat
 * exactly for the same inputs, which the tests rely on.
 */
export function enableSeaPhysics(scene: Scene, plugin: HavokPlugin) {
  // The world uses the same right-handed axes as the movement model and the server
  // poses (heading 0 is -Z, heading pi/2 is +X), so the screen is not mirrored.
  scene.useRightHandedSystem = true;
  plugin.setTimeStep(1 / 60);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  scene.getPhysicsEngine()!.setSubTimeStep(1000 / 60);
}

export function createBoatPhysics(
  scene: Scene,
  options: BoatPhysicsOptions,
): BoatPhysics {
  const physics = scene.getPhysicsEngine();
  if (!physics)
    throw new Error("Enable physics on the scene before creating the boat.");
  const start = options.start ?? { x: 0, z: 0, heading: 0 };
  const mesh = MeshBuilder.CreateBox(
    "boat-body",
    { width: HULL.width, height: HULL.height, depth: HULL.length },
    scene,
  );
  mesh.isVisible = false;
  mesh.position.set(start.x, -DRAFT - BOTTOM, start.z);
  mesh.rotate(Axis.Y, -start.heading);
  const aggregate = new PhysicsAggregate(
    mesh,
    PhysicsShapeType.BOX,
    { mass: HULL.mass, friction: 0.05, restitution: 0.12 },
    scene,
  );
  const body = aggregate.body;
  body.setLinearDamping(0);
  body.setAngularDamping(0.9);

  const colliders = options.islands.map((island, index) => {
    const post = MeshBuilder.CreateCylinder(
      `island-${index}`,
      { diameter: island.radius * 2, height: 14, tessellation: 24 },
      scene,
    );
    post.isVisible = false;
    post.position.set(island.x, 0, island.z);
    return {
      mesh: post,
      aggregate: new PhysicsAggregate(
        post,
        PhysicsShapeType.CYLINDER,
        { mass: 0, friction: 0.04, restitution: 0.1 },
        scene,
      ),
    };
  });

  const input: BoatInput = { steer: 0, throttle: 0 };
  const world = new Vector3();
  const point = new Vector3();
  const velocity = new Vector3();
  const spin = new Vector3();
  const forward = new Vector3();
  const side = new Vector3();
  const force = new Vector3();
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));

  // The water the hull floats on: the waves and, when given, the wakes on top of them.
  const surface = (x: number, z: number, t: number) =>
    waveHeight(x, z, t) + (options.extraHeight?.(x, z, t) ?? 0);

  const beforeStep = () => {
    // Fixed sub-steps (see enableSeaPhysics): every step is exactly this long.
    const dt = physics.getTimeStep();
    mesh.computeWorldMatrix(true);
    const t = options.time();
    // Buoyancy and heave damping at every sample point.
    for (const local of SAMPLES) {
      Vector3.TransformCoordinatesToRef(local, mesh.getWorldMatrix(), world);
      const depth = surface(world.x, world.z, t) - world.y;
      if (depth <= 0) continue;
      body.getLinearVelocityToRef(velocity);
      body.getAngularVelocityToRef(spin);
      point.copyFrom(world).subtractInPlace(mesh.position);
      const vy = velocity.y + (spin.z * point.x - spin.x * point.z);
      const lift = STIFFNESS * Math.min(depth, 1.2) - HEAVE_DAMPING * vy;
      force.set(0, Math.max(0, lift) * dt, 0);
      body.applyImpulse(force, world);
    }
    // Horizontal axes of the hull and velocity along them.
    Vector3.TransformNormalToRef(
      Axis.Z.scale(-1),
      mesh.getWorldMatrix(),
      forward,
    );
    forward.y = 0;
    forward.normalize();
    side.set(-forward.z, 0, forward.x); // forward rotated toward +X when heading 0
    body.getLinearVelocityToRef(velocity);
    const along = velocity.x * forward.x + velocity.z * forward.z;
    const across = velocity.x * side.x + velocity.z * side.z;
    // Water drag: quadratic along the keel, much stronger across it.
    const speed = Math.abs(along);
    const hump = humpAt(speed);
    const planing = planingAt(speed);
    const dragAlong =
      -(C_FORWARD * (1 - PLANE_DRAG_CUT * planing) * speed + C_LINEAR) * along -
      // The bow wave: only forward, a hump of extra drag the hull has to climb.
      Math.sign(along) * WAVE_DRAG * hump;
    const dragAcross = -(C_SIDE * Math.abs(across) + C_LINEAR) * across;
    const thrust =
      clamp(input.throttle, -1, 1) *
      (input.throttle >= 0 ? THRUST : THRUST * 0.45);
    // Only a hull in the water is pushed and slowed by it.
    const wet = clamp(
      (surface(mesh.position.x, mesh.position.z, t) -
        (mesh.position.y + BOTTOM)) /
        0.2,
      0,
      1,
    );
    const push = (thrust + dragAlong) * wet;
    force.set(
      (forward.x * push + side.x * dragAcross * wet) * dt,
      0,
      (forward.z * push + side.z * dragAcross * wet) * dt,
    );
    body.applyImpulse(force, mesh.position);
    // The bow climbs its own wave (a lift at the bow) and the hull rides up on the water
    // (a lift at the centre) as it speeds up.
    if (wet > 0 && speed > 0.5) {
      force.set(0, BOW_LIFT * hump * Math.sign(along) * wet * dt, 0);
      Vector3.TransformCoordinatesToRef(BOW, mesh.getWorldMatrix(), world);
      body.applyImpulse(force, world);
      force.set(0, PLANE_LIFT * planing * wet * dt, 0);
      body.applyImpulse(force, mesh.position);
    }
    // Rudder: a rotation about +Y lowers heading, so a right turn is a negative torque.
    const flow = clamp(Math.abs(along) / 5, 0, 1);
    const authority = (0.35 + 0.65 * flow) * wet;
    spin.set(0, -clamp(input.steer, -1, 1) * RUDDER * authority * dt, 0);
    body.applyAngularImpulse(spin);
    // Leaning into the turn: a roll about the keel that grows with speed and rudder.
    const lean =
      clamp(input.steer, -1, 1) * clamp(speed / 8, 0, 1) * wet * BANK * dt;
    spin.set(forward.x * lean, 0, forward.z * lean);
    body.applyAngularImpulse(spin);
    // Soft wall keeps the boat inside the sea the server validates.
    const px = mesh.position.x;
    const pz = mesh.position.z;
    const limit = SEA_BOUND - 4;
    const wall = (v: number) =>
      Math.abs(v) > limit
        ? -Math.sign(v) * (Math.abs(v) - limit) * 6000 * dt
        : 0;
    if (wall(px) || wall(pz)) {
      force.set(wall(px), 0, wall(pz));
      body.applyImpulse(force, mesh.position);
    }
  };
  scene.onBeforePhysicsObservable.add(beforeStep);

  return {
    input,
    mesh,
    state() {
      mesh.computeWorldMatrix(true);
      Vector3.TransformNormalToRef(
        Axis.Z.scale(-1),
        mesh.getWorldMatrix(),
        forward,
      );
      const right = Vector3.TransformNormal(Axis.X, mesh.getWorldMatrix());
      body.getLinearVelocityToRef(velocity);
      const flat = Math.hypot(forward.x, forward.z) || 1;
      const fx = forward.x / flat;
      const fz = forward.z / flat;
      return {
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
        heading: Math.atan2(fx, -fz),
        roll: Math.asin(clamp(right.y, -1, 1)),
        pitch: Math.asin(clamp(forward.y, -1, 1)),
        forwardSpeed: velocity.x * fx + velocity.z * fz,
        sideSpeed: velocity.x * -fz + velocity.z * fx,
      };
    },
    dispose() {
      scene.onBeforePhysicsObservable.removeCallback(beforeStep);
      aggregate.dispose();
      mesh.dispose();
      for (const collider of colliders) {
        collider.aggregate.dispose();
        collider.mesh.dispose();
      }
    },
  };
}
