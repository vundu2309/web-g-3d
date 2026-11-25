import { TowTrail } from "./banner.ts";
import {
  leave,
  spawnFlight,
  stepFlight,
  wrap,
  type Flight,
  type Point,
} from "./plane-flight.ts";

/**
 * Where the NPC seaplanes are, on the SHARED clock: the server's time the app already follows
 * (the same clock as the rowing cats), so every player sees the same planes at the same places and
 * on the same turns, with nothing sent over the network.
 *
 * A plane's flight is a random one (plane-flight.ts) but fully determined by its seed, and the
 * seed by the plane and the number of its flight. A flight lasts `period` seconds on the shared
 * clock; a device that joins at any moment replays the flight from its start in fixed steps of
 * `STEP` (about four thousand cheap steps at most; the place between two steps is interpolated) and from then on takes the steps the clock
 * calls for. So the place of a plane at a given shared time is the same on every device, and the
 * direction changes are as random as a free-flying plane's.
 *
 * A flight begins on a ring far out at sea, heading in, and ends by flying out over the edge, so
 * the jump from one flight to the next happens where no boat can see it.
 */
export const PLANES = 8;
/** The simulation step (s): fixed, so every device takes the same ones. */
export const STEP = 0.25;
/** The middle of the sea the planes are kept over. */
export const CENTRE: Point = { x: 0, z: 0 };
/** A plane starts to leave this long (s) before the end of its flight. */
export const LEAVE = 200;
/** The path behind the plane is kept for this many of the last steps of a replay. */
const TRAIL_STEPS = 40;

export interface PlanePlan {
  index: number;
  /** How long a flight lasts (s) and where the first one stands in time, so planes do not begin together. */
  period: number;
  offset: number;
}

/** The plans of the sea's planes: the same on every device. */
export function makePlans(): PlanePlan[] {
  return Array.from({ length: PLANES }, (_, index) => {
    const period = 640 + index * 53;
    return { index, period, offset: (index * 197.3) % period };
  });
}

/** Which flight of the plane is on at `shared`, and when it began (shared seconds). */
export function cycleOf(plan: PlanePlan, shared: number) {
  const number = Math.floor((shared + plan.offset) / plan.period);
  return { number, start: number * plan.period - plan.offset };
}

/** The seed of one flight of one plane. */
export const seedOf = (plan: PlanePlan, cycle: number) =>
  Math.imul(plan.index + 1, 0x9e3779b1) ^ Math.imul(cycle | 0, 0x85ebca6b);

export interface PlanePose {
  x: number;
  z: number;
  altitude: number;
  heading: number;
  bank: number;
  pitch: number;
}

const copyFlight = (to: Flight, from: Flight) => Object.assign(to, from);

/** One plane, advanced on the shared clock. */
export class PlaneSim {
  readonly plan: PlanePlan;
  /** The plane's last two steps; its place between them is interpolated. */
  prev: Flight;
  cur: Flight;
  /** The path it has flown, for the banner (kept for the last steps only). */
  readonly trail = new TowTrail();
  private cycle: number | undefined;
  private start = 0;
  private steps = 0;
  private trailing = false;

  constructor(plan: PlanePlan) {
    this.plan = plan;
    this.cur = spawnFlight(seedOf(plan, 0), CENTRE);
    this.prev = { ...this.cur };
  }

  private begin(cycle: number, start: number) {
    this.cycle = cycle;
    this.start = start;
    this.steps = 0;
    this.trailing = false;
    this.cur = spawnFlight(seedOf(this.plan, cycle), CENTRE);
    this.prev = { ...this.cur };
  }

  /** Brings the plane to the shared time `shared` (seconds). */
  advance(shared: number) {
    const { number, start } = cycleOf(this.plan, shared);
    const target = Math.floor((shared - start) / STEP);
    // A new flight, or the clock moved back (a correction): begin the flight again.
    if (number !== this.cycle || target < this.steps) this.begin(number, start);
    const leaveStep = Math.floor((this.plan.period - LEAVE) / STEP);
    while (this.steps < target) {
      copyFlight(this.prev, this.cur);
      if (this.steps === leaveStep) leave(this.cur);
      stepFlight(this.cur, STEP, CENTRE);
      this.steps++;
      // The path is kept up to the step BEFORE the last one: the plane is drawn between the two,
      // and a sample ahead of it would fold the banner's rope back on itself.
      if (target - this.steps <= TRAIL_STEPS) {
        const { prev } = this;
        if (!this.trailing) {
          this.trailing = true;
          this.trail.prime(prev.x, prev.altitude, prev.z, prev.heading);
        }
        this.trail.push(prev.x, prev.altitude, prev.z);
      }
    }
  }

  /** Where the plane is at `shared`, between its last two steps (call `advance` first). */
  pose(shared: number, out: PlanePose): PlanePose {
    const { start, prev, cur } = this;
    const f = Math.min(1, Math.max(0, (shared - start) / STEP - this.steps));
    out.x = prev.x + (cur.x - prev.x) * f;
    out.z = prev.z + (cur.z - prev.z) * f;
    out.altitude = prev.altitude + (cur.altitude - prev.altitude) * f;
    out.heading = wrap(prev.heading + wrap(cur.heading - prev.heading) * f);
    out.bank = prev.bank + (cur.bank - prev.bank) * f;
    out.pitch = prev.pitch + (cur.pitch - prev.pitch) * f;
    return out;
  }
}
