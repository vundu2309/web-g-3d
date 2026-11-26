/**
 * The living parts of the sea's sound, as plain numbers (no Web Audio): when a gull calls, and the
 * background music. src/app/audio.ts plays what these describe.
 */

/** A small seeded random generator (mulberry32): the same seed gives the same music. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seconds until the next gull, or undefined when there should be none (night, or far from any
 * beach). A gull calls every 5 to 17 s near a beach in daylight and rarely farther out.
 * `near` is how close to a beach the boat is (0 far .. 1, audio-plan `nearShore`).
 */
export function gullIn(
  random: () => number,
  near: number,
  daylight: number,
): number | undefined {
  if (!(daylight > 0.35) || !(near > 0.05)) return undefined;
  return (5 + 12 * random()) * (1.7 - 1.1 * Math.min(1, near));
}

/** A note of the music: when (s after the bar starts), how long, pitch (Hz) and level (0..1). */
export interface MusicNote {
  at: number;
  dur: number;
  freq: number;
  gain: number;
  wave: "sine" | "triangle";
}

/** Seconds in one bar of the music. */
export const BAR_SECONDS = 8;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
/** Chords of the day (C, Am, F, G) and the night (Am, F, C, Em): the root as a MIDI note. */
const DAY_ROOTS = [48, 45, 41, 43];
const NIGHT_ROOTS = [45, 41, 36, 40];
/** The major pentatonic in semitones above the root: no note clashes with another. */
const PENTATONIC = [0, 2, 4, 7, 9];

/**
 * The notes of bar number `bar`: a slow pad (root, fifth and a high third, each swelling for the whole
 * bar) and a few sparse melody notes picked from the pentatonic scale by a seeded generator, so the
 * same bar always plays the same notes. By day the pad is brighter and the melody has more notes; at
 * night everything is an octave lower and nearly still. `daylight` is 0..1.
 */
export function musicBar(bar: number, daylight: number): MusicNote[] {
  const day = daylight > 0.5;
  const roots = day ? DAY_ROOTS : NIGHT_ROOTS;
  const root = roots[((bar % roots.length) + roots.length) % roots.length]!;
  const notes: MusicNote[] = [];
  const pad = (semitones: number, gain: number) =>
    notes.push({
      at: 0,
      dur: BAR_SECONDS + 1.5,
      freq: midi(root + semitones),
      gain,
      wave: "sine",
    });
  pad(0, 0.05);
  pad(7, 0.035);
  pad(day ? 16 : 12, 0.025);
  const random = seeded(bar * 7919 + (day ? 1 : 2));
  const count = day ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const step = PENTATONIC[Math.floor(random() * PENTATONIC.length)]!;
    notes.push({
      at: 0.5 + ((i + random() * 0.8) * (BAR_SECONDS - 1.5)) / count,
      dur: 2.6,
      freq: midi(root + 24 + step),
      gain: day ? 0.04 : 0.025,
      wave: "triangle",
    });
  }
  return notes;
}

/**
 * How far (m) a point is from the nearest beach: the distance to the middle of the island less 95 %
 * of its radius (the coast lies at 88 to 99 % of it), never below 0. Infinity when there are no
 * islands.
 */
export function shoreDistance(
  x: number,
  z: number,
  islands: readonly { x: number; z: number; radius: number }[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const island of islands)
    best = Math.min(
      best,
      Math.max(
        0,
        Math.hypot(x - island.x, z - island.z) - 0.95 * island.radius,
      ),
    );
  return best;
}
