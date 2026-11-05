import type { Pose } from "./model";

/**
 * Other players' boats arrive a few times per second. Drawing the newest sample
 * directly makes them jump; chasing it with an exponential blend makes them sprint
 * and stall. This keeps a short history per boat and plays it back a little in the
 * past, interpolating between the two samples around that moment, so motion is
 * continuous at any publish rate. Pure maths, no rendering.
 */
export interface Sample extends Pose {
  /** Server time of the sample, in ms. */
  t: number;
}

const MAX_SAMPLES = 12;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class RemoteTracks {
  private readonly tracks = new Map<string, Sample[]>();

  /** Adds a sample; out-of-order or duplicate times are ignored. */
  push(uid: string, t: number, pose: Pose) {
    if (!Number.isFinite(t)) return;
    let list = this.tracks.get(uid);
    if (!list) {
      list = [];
      this.tracks.set(uid, list);
    }
    const newest = list[list.length - 1];
    if (newest && t <= newest.t) return;
    list.push({
      t,
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      fishing: pose.fishing,
    });
    if (list.length > MAX_SAMPLES) list.shift();
  }

  /** Where the boat was at `at` (server ms). Holds the ends instead of extrapolating. */
  sample(uid: string, at: number): Pose | undefined {
    const list = this.tracks.get(uid);
    const first = list?.[0];
    const last = list?.[list.length - 1];
    if (!list || !first || !last) return undefined;
    if (at <= first.t) return pick(first);
    if (at >= last.t) return pick(last);
    let i = list.length - 1;
    while (i > 1 && (list[i - 1]?.t ?? -Infinity) > at) i--;
    const a = list[i - 1];
    const b = list[i];
    if (!a || !b) return pick(last);
    const k = (at - a.t) / (b.t - a.t);
    return {
      x: a.x + (b.x - a.x) * k,
      z: a.z + (b.z - a.z) * k,
      heading: wrap(a.heading + wrap(b.heading - a.heading) * k),
      fishing: k < 0.5 ? a.fishing : b.fishing,
    };
  }

  /** Newest sample time for a boat, to tell whether a snapshot brought anything new. */
  latest(uid: string): number {
    const list = this.tracks.get(uid);
    return list?.[list.length - 1]?.t ?? -Infinity;
  }

  /** Forgets boats that are gone. */
  keepOnly(uids: Set<string>) {
    for (const uid of this.tracks.keys())
      if (!uids.has(uid)) this.tracks.delete(uid);
  }
}

const pick = (s: Sample): Pose => ({
  x: s.x,
  z: s.z,
  heading: s.heading,
  fishing: s.fishing,
});

/**
 * Maps the local clock to server time. A packet that was delayed shows a smaller
 * (server - local) gap than one that was not, so the offset jumps up at once when a
 * quicker packet arrives and eases down slowly otherwise: playback follows the
 * fastest recent path and stays steady through jitter.
 */
export class ServerClock {
  private offset: number | undefined;

  observe(serverTime: number, localNow: number) {
    if (!Number.isFinite(serverTime)) return;
    const gap = serverTime - localNow;
    this.offset =
      this.offset === undefined || gap > this.offset
        ? gap
        : this.offset + (gap - this.offset) * 0.02;
  }

  /** Server time now, or undefined before the first packet. */
  now(localNow: number): number | undefined {
    return this.offset === undefined ? undefined : localNow + this.offset;
  }
}
