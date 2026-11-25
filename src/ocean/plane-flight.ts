/**
 * How an NPC seaplane flies, as plain numbers (no Babylon, so tests read it directly). Each plane
 * holds a speed and turns to a new random direction every few seconds, never faster than a plane
 * can bank, climbs and sinks between random heights, and is led back when it strays too far from
 * its HOME (a place players spend their time: the harbour or an island, see plane-plan.ts).
 *
 * The flight is deterministic: `spawnFlight(seed)` and fixed steps of `stepFlight` give the same
 * plane on every device, which is how every player sees the same planes at the same places
 * (plane-plan.ts puts the planes on the shared clock). A flight has an end: `leaving` sends the
 * plane out over the edge of the sea, where a new flight can begin unseen.
 *
 * Headings follow the boats: 0 flies toward -Z, pi/2 toward +X, a positive turn is to the right.
 */
export interface Point {
  x: number;
  z: number;
}

/** The middle of the sea: flights begin and end on a ring round it, out beyond the edge. */
export const SEA_MIDDLE: Point = { x: 0, z: 0 };

export const FLIGHT = {
  /** Cruise speed (m/s), one value per plane. */
  speed: { min: 20, max: 27 },
  /** Seconds between two changes of direction. */
  leg: { min: 5, max: 13 },
  /** How far (rad) a change of direction turns, either way. */
  turn: { min: 0.5, max: 1.9 },
  /** The fastest the heading may change (rad/s) and how quickly that rate may build (rad/s²). */
  maxRate: 0.32,
  rateAccel: 0.25,
  /** Farther than this (m) from its home a plane is led back; it keeps turning at random inside. */
  roam: 450,
  /** A flight begins this far (m) from the middle of the sea, flying in, and ends this far out: beyond sight of any boat. */
  ring: 2300,
  /** Height above the sea (m) and the fastest it may climb or sink (m/s). */
  altitude: { min: 50, max: 85 },
  climb: 3.5,
  /** Bank (rad) per rad/s of turn, and the most a plane leans. */
  bankGain: 1.7,
  bankMax: 0.5,
  /** The longest step (s) simulated at once: a hidden tab must not throw a plane across the sea. */
  maxStep: 0.25,
} as const;

export interface Flight {
  x: number;
  z: number;
  /** Radians, wrapped to (-pi, pi]. */
  heading: number;
  /** Metres above the sea. */
  altitude: number;
  /** Lean into the turn, radians; positive leans to the right (the right wing is lower). */
  bank: number;
  /** Nose up (positive) or down, radians. */
  pitch: number;
  speed: number;
  /** The heading's present rate of change (rad/s). */
  rate: number;
  targetHeading: number;
  targetAltitude: number;
  /** Seconds left of the present leg. */
  legLeft: number;
  /** True while it is led back toward the middle. */
  homing: boolean;
  /** True while it flies out over the edge of the sea to end its flight. */
  leaving: boolean;
  /** The generator's state (mulberry32). */
  rng: number;
}

/** A number in [0, 1) from the flight's own generator (it advances the state). */
export function next(flight: Flight): number {
  flight.rng = (flight.rng + 0x6d2b79f5) | 0;
  let t = flight.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (flight: Flight, range: { min: number; max: number }) =>
  range.min + (range.max - range.min) * next(flight);
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** An angle brought into (-pi, pi]. */
export const wrap = (angle: number) => {
  const a = (((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return a - Math.PI;
};

/** The heading that flies from `from` toward `to`. */
export const headingTo = (from: Point, to: Point) =>
  Math.atan2(to.x - from.x, -(to.z - from.z));

/** A plane that begins its flight on the ring round the middle of the sea, heading in toward its `home`. */
export function spawnFlight(seed: number, home: Point): Flight {
  const flight: Flight = {
    x: 0,
    z: 0,
    heading: 0,
    altitude: 0,
    bank: 0,
    pitch: 0,
    speed: 0,
    rate: 0,
    targetHeading: 0,
    targetAltitude: 0,
    legLeft: 0,
    homing: true,
    leaving: false,
    rng: seed | 0,
  };
  const angle = next(flight) * Math.PI * 2;
  flight.x = SEA_MIDDLE.x + Math.cos(angle) * FLIGHT.ring;
  flight.z = SEA_MIDDLE.z + Math.sin(angle) * FLIGHT.ring;
  flight.heading = wrap(headingTo(flight, home) + (next(flight) - 0.5) * 0.6);
  flight.targetHeading = flight.heading;
  flight.altitude = between(flight, FLIGHT.altitude);
  flight.targetAltitude = flight.altitude;
  flight.speed = between(flight, FLIGHT.speed);
  flight.legLeft = between(flight, FLIGHT.leg);
  return flight;
}

/** Begins the end of the flight: out over the edge of the sea, starting with the next step. */
export function leave(flight: Flight) {
  flight.leaving = true;
  flight.homing = false;
  flight.legLeft = 0;
}

/** Chooses the next leg: a random turn, or the way home when it has strayed. */
function chooseLeg(flight: Flight, home: Point) {
  flight.legLeft = between(flight, FLIGHT.leg);
  flight.targetAltitude = between(flight, FLIGHT.altitude);
  if (flight.leaving) {
    // Straight out over the edge of the sea (away from its middle), a little off the radial so the planes do not all leave alike.
    flight.targetHeading = wrap(
      headingTo(SEA_MIDDLE, flight) + (next(flight) - 0.5) * 0.5,
    );
    return;
  }
  const away = Math.hypot(flight.x - home.x, flight.z - home.z);
  if (away > FLIGHT.roam) {
    flight.homing = true;
    flight.targetHeading = wrap(
      headingTo(flight, home) + (next(flight) - 0.5) * 0.8,
    );
    return;
  }
  flight.homing = false;
  const side = next(flight) < 0.5 ? -1 : 1;
  flight.targetHeading = wrap(
    flight.heading + side * between(flight, FLIGHT.turn),
  );
}

/** Flies `dt` seconds (in place). `home` is the place the plane is kept over. */
export function stepFlight(flight: Flight, dtSeconds: number, home: Point) {
  const dt = clamp(dtSeconds, 0, FLIGHT.maxStep);
  if (dt === 0) return;
  const away = Math.hypot(flight.x - home.x, flight.z - home.z);
  // A leaving plane keeps to the way out chosen when it began to leave (`leave`).
  if (!flight.leaving) {
    if (!flight.homing && away > FLIGHT.roam * 1.3) flight.legLeft = 0;
    else if (flight.homing && away < FLIGHT.roam * 0.85) {
      flight.homing = false;
      flight.legLeft = 0;
    }
  }
  flight.legLeft -= dt;
  if (flight.legLeft <= 0) chooseLeg(flight, home);

  // The heading eases toward its target: the turn rate builds up and dies away, never a snap.
  const wanted = clamp(
    wrap(flight.targetHeading - flight.heading) * 1.2,
    -FLIGHT.maxRate,
    FLIGHT.maxRate,
  );
  const accel = FLIGHT.rateAccel * dt;
  flight.rate += clamp(wanted - flight.rate, -accel, accel);
  flight.heading = wrap(flight.heading + flight.rate * dt);

  const lean = clamp(
    flight.rate * FLIGHT.bankGain,
    -FLIGHT.bankMax,
    FLIGHT.bankMax,
  );
  flight.bank += (lean - flight.bank) * Math.min(1, dt * 2.5);

  const climb = clamp(
    (flight.targetAltitude - flight.altitude) * 0.5,
    -FLIGHT.climb,
    FLIGHT.climb,
  );
  flight.altitude += climb * dt;
  flight.pitch = climb / flight.speed;

  flight.x += Math.sin(flight.heading) * flight.speed * dt;
  flight.z -= Math.cos(flight.heading) * flight.speed * dt;
}
