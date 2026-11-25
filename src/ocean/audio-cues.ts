/**
 * The short sounds of the game ("cues"), described as plain numbers so they can be tested
 * without a sound card: each cue is a few voices, a tone (an oscillator gliding from one pitch
 * to another) or a burst of filtered noise, with a start time, a length and a loudness.
 * src/app/audio.ts turns the voices into Web Audio nodes.
 */
export type Cue =
  | "cast"
  | "splash"
  | "nibble"
  | "bite"
  | "hook"
  | "escape"
  | "snap"
  | "catch"
  | "keep"
  | "drop"
  | "blocked"
  | "coin"
  | "error";

export interface Voice {
  kind: "tone" | "noise";
  /** Oscillator shape (tones only). */
  wave: "sine" | "triangle" | "square" | "sawtooth";
  /** Pitch in Hz at the start and at the end (tones only). */
  from: number;
  to: number;
  /** Filter on a noise burst: its type, cutoff at the start and at the end (Hz). */
  filter: "lowpass" | "highpass" | "bandpass";
  cutoff: number;
  cutoffTo: number;
  /** Seconds after the cue starts, and how long the voice lasts. */
  at: number;
  dur: number;
  /** Peak level 0..1 before the master volume. */
  gain: number;
}

const tone = (
  from: number,
  to: number,
  at: number,
  dur: number,
  gain: number,
  wave: Voice["wave"] = "sine",
): Voice => ({
  kind: "tone",
  wave,
  from,
  to,
  filter: "lowpass",
  cutoff: 0,
  cutoffTo: 0,
  at,
  dur,
  gain,
});
const noise = (
  filter: Voice["filter"],
  cutoff: number,
  cutoffTo: number,
  at: number,
  dur: number,
  gain: number,
): Voice => ({
  kind: "noise",
  wave: "sine",
  from: 0,
  to: 0,
  filter,
  cutoff,
  cutoffTo,
  at,
  dur,
  gain,
});

const SPLASH = [
  noise("lowpass", 1800, 500, 0, 0.35, 0.4),
  noise("highpass", 2500, 2500, 0, 0.12, 0.15),
];

export const CUES: Record<Cue, readonly Voice[]> = {
  // The rod whips and the line runs out.
  cast: [noise("bandpass", 600, 2600, 0, 0.28, 0.35)],
  // The lure lands in the water.
  splash: SPLASH,
  // A fish touches the lure: a small tick.
  nibble: [tone(660, 660, 0, 0.06, 0.18)],
  // The bite: two quick notes, the signal to pull within the second.
  bite: [tone(880, 880, 0, 0.09, 0.3), tone(1175, 1175, 0.11, 0.12, 0.3)],
  // The hook is set.
  hook: [
    tone(300, 150, 0, 0.12, 0.35, "triangle"),
    noise("bandpass", 2000, 2000, 0, 0.05, 0.2),
  ],
  // The fish got away.
  escape: [tone(500, 220, 0, 0.3, 0.25)],
  // The line snapped.
  snap: [
    noise("highpass", 3000, 3000, 0, 0.08, 0.4),
    tone(700, 120, 0, 0.25, 0.2, "sawtooth"),
  ],
  // Landed: the splash and three rising notes.
  catch: [
    ...SPLASH,
    tone(523, 523, 0.05, 0.15, 0.25),
    tone(659, 659, 0.13, 0.15, 0.25),
    tone(784, 784, 0.21, 0.2, 0.25),
  ],
  keep: [tone(600, 900, 0, 0.12, 0.25)],
  // Put back: the fish falls into the sea.
  drop: [
    noise("lowpass", 1200, 1200, 0, 0.3, 0.3),
    tone(400, 200, 0, 0.2, 0.12),
  ],
  // The throw cannot land there.
  blocked: [
    tone(150, 150, 0, 0.12, 0.15, "square"),
    tone(150, 150, 0.15, 0.12, 0.15, "square"),
  ],
  // A sale: two bright notes.
  coin: [tone(1568, 1568, 0, 0.08, 0.25), tone(2093, 2093, 0.07, 0.35, 0.25)],
  error: [tone(200, 140, 0, 0.2, 0.25, "triangle")],
};

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** The voices of a cue at a master volume (0..1); none when it is off or the cue is unknown. */
export function cueVoices(
  cue: Cue,
  volume: number,
  enabled = true,
): readonly Voice[] {
  const level = Math.max(0, Math.min(1, finite(volume)));
  const voices = CUES[cue];
  if (!enabled || level === 0 || !voices) return [];
  return voices.map((v) => ({ ...v, gain: v.gain * level }));
}

/** The longest a cue lasts, in seconds (the player frees its nodes after this). */
export function cueLength(cue: Cue): number {
  return Math.max(0, ...CUES[cue].map((v) => v.at + v.dur));
}
