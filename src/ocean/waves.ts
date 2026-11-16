/**
 * Analytic sea surface shared by physics (CPU) and rendering (GLSL string below).
 * A layered sea like the ones in sailing games: a long SWELL (three waves of 56 to 92 m,
 * slow and tall), a MEDIUM tier (four waves of 14 to 38 m, the one a 7 m hull pitches and
 * rolls on) and a small CHOP on top (four waves of 3 to 10 m). Each wave is a sharpened
 * sine, ((1 + sin) / 2)^sharp: broad troughs and narrow crests. The swell and the larger
 * medium waves also LEAN: the phase is bent, theta - lean sin(theta), so the face toward
 * which the wave travels is steeper than the back (the look of a Gerstner crest) without
 * any horizontal displacement, so the surface stays a pure vertical function of (x, z, t)
 * and the CPU and the GPU heights are identical by construction. The bend is monotonic for
 * lean < 1, so a crest never folds over. The slope (waveGradient) is analytic too.
 *
 * The sea STATE breathes: each tier's amplitude is scaled by a gain that follows one slow
 * value, seaState(t) in 0..1 (a calm-to-rough cycle of several minutes), the swell and the
 * medium tier more than the chop. The lowest point is as calm as the sea was before this
 * layering (the summed amplitudes are about 1.4 m); the roughest is about 2.4 m. The same
 * function of the same clock runs in the shader.
 */
export type WaveTier = "swell" | "medium" | "chop";
export interface Wave {
  /** Wavelength in metres. */
  length: number;
  /** Amplitude in metres at the roughest sea (before the sharpening is normalised, see `terms`). */
  amplitude: number;
  /** Travel direction, radians in the XZ plane. */
  direction: number;
  phase: number;
  /** 1 is a plain sine; larger gives narrower crests and broader troughs. */
  sharp: number;
  /** 0 is symmetric; larger leans the crest toward its travel direction (always below 1). */
  lean: number;
  tier: WaveTier;
}
export const GRAVITY = 9.81;
/**
 * The dominant wind, radians in the XZ plane (the same convention as `Wave.direction`). The
 * long swell runs close to it; the shorter the wave, the wider its spread around it, as in a
 * real wind sea. The water shader lays its wind streaks and ripples along it too.
 */
export const WIND_DIRECTION = 0.25;
/**
 * Eleven waves in three tiers. Neighbouring lengths and headings beat against each other, so
 * the swell comes in groups (higher sets, calmer gaps) instead of a uniform corrugation.
 */
export const WAVES: readonly Wave[] = [
  // Swell: long, slow, tall, close to the wind.
  {
    length: 92,
    amplitude: 0.55,
    direction: 0.14,
    phase: 1.7,
    sharp: 1.3,
    lean: 0.35,
    tier: "swell",
  },
  {
    length: 71,
    amplitude: 0.48,
    direction: 0.38,
    phase: 0.4,
    sharp: 1.4,
    lean: 0.3,
    tier: "swell",
  },
  {
    length: 56,
    amplitude: 0.38,
    direction: 0.05,
    phase: 5.2,
    sharp: 1.5,
    lean: 0.25,
    tier: "swell",
  },
  // Medium: what the hull rides on.
  {
    length: 38,
    amplitude: 0.3,
    direction: 0.62,
    phase: 2.1,
    sharp: 1.8,
    lean: 0.3,
    tier: "medium",
  },
  {
    length: 28,
    amplitude: 0.25,
    direction: -0.25,
    phase: 3.6,
    sharp: 2,
    lean: 0.25,
    tier: "medium",
  },
  {
    length: 20,
    amplitude: 0.19,
    direction: 0.95,
    phase: 4.2,
    sharp: 2.2,
    lean: 0,
    tier: "medium",
  },
  {
    length: 14.5,
    amplitude: 0.13,
    direction: -0.55,
    phase: 0.9,
    sharp: 2.4,
    lean: 0,
    tier: "medium",
  },
  // Chop: the small texture on top.
  {
    length: 10,
    amplitude: 0.05,
    direction: 1.2,
    phase: 1.3,
    sharp: 2.6,
    lean: 0,
    tier: "chop",
  },
  {
    length: 6.8,
    amplitude: 0.035,
    direction: -0.85,
    phase: 5.5,
    sharp: 2.8,
    lean: 0,
    tier: "chop",
  },
  {
    length: 4.6,
    amplitude: 0.024,
    direction: 0.55,
    phase: 2.8,
    sharp: 3,
    lean: 0,
    tier: "chop",
  },
  {
    length: 3.1,
    amplitude: 0.016,
    direction: 1.5,
    phase: 3.3,
    sharp: 3,
    lean: 0,
    tier: "chop",
  },
];

/** The tiers in the order the sums keep them. */
export const TIERS: readonly WaveTier[] = ["swell", "medium", "chop"];
/**
 * How much of its full amplitude each tier has at the calmest sea (the roughest is 1). The
 * swell and the medium tier swing most, the chop least. At the calm point the summed
 * amplitudes are about 1.4 m, the sea of before the layering.
 */
export const CALM_GAIN: Record<WaveTier, number> = {
  swell: 0.58,
  medium: 0.55,
  chop: 0.7,
};
/**
 * The sea state: a slow bounded value in 0..1 (0 calm, 1 rough), the sum of two sines (a
 * 330 s and a 137 s cycle) with weights that add to 1, so it never leaves 0..1. It starts at
 * about 0.3 (a fishing sea) and builds toward rough over a couple of minutes. The shader
 * computes the same value from the same clock.
 */
export const SEA_STATE = {
  slow: { period: 330, weight: 0.65, phase: -0.3 },
  fast: { period: 137, weight: 0.35, phase: -0.6 },
};
export function seaState(t: number): number {
  const { slow, fast } = SEA_STATE;
  return (
    0.5 +
    0.5 *
      (slow.weight * Math.sin((t * Math.PI * 2) / slow.period + slow.phase) +
        fast.weight * Math.sin((t * Math.PI * 2) / fast.period + fast.phase))
  );
}
/** The multiplier of a tier's amplitude at sea state `s` (0..1). */
export function tierGain(tier: WaveTier, s: number): number {
  return CALM_GAIN[tier] + (1 - CALM_GAIN[tier]) * s;
}

/** Bends the phase so the travel-side face is steeper: theta - lean sin(theta). */
export const leanPhase = (theta: number, lean: number) =>
  theta - lean * Math.sin(theta);

/** The mean of ((1 + sin) / 2)^sharp over a period, so every wave averages to zero. */
function meanOfSharpened(sharp: number, lean: number) {
  const samples = 4096;
  let sum = 0;
  for (let i = 0; i < samples; i++)
    sum += Math.pow(
      0.5 + 0.5 * Math.sin(leanPhase((i / samples) * Math.PI * 2, lean)),
      sharp,
    );
  return sum / samples;
}

const terms = WAVES.map((wave) => {
  const k = (Math.PI * 2) / wave.length;
  // f = 2 u^s - 1 - m has zero mean (m = 2 mean(u^s) - 1) and |f| <= 1 + |m| after
  // dividing, so the sum stays inside the summed amplitudes.
  const m = 2 * meanOfSharpened(wave.sharp, wave.lean) - 1;
  const scale = wave.amplitude / (1 + Math.abs(m));
  return {
    k,
    length: wave.length,
    sharp: wave.sharp,
    lean: wave.lean,
    tier: TIERS.indexOf(wave.tier),
    m,
    scale,
    omega: Math.sqrt(GRAVITY * k),
    dx: Math.cos(wave.direction),
    dz: Math.sin(wave.direction),
    phase: wave.phase,
  };
});

/** Sum of the wave amplitudes at the roughest sea: the sea never rises or falls farther than this. */
export const MAX_WAVE_HEIGHT = WAVES.reduce((s, w) => s + w.amplitude, 0);
/** The same at the calmest sea. */
export const CALM_WAVE_HEIGHT = WAVES.reduce(
  (s, w) => s + w.amplitude * CALM_GAIN[w.tier],
  0,
);

/** Sea surface height in metres at world (x, z) and time t in seconds. */
export function waveHeight(x: number, z: number, t: number): number {
  let swell = 0;
  let medium = 0;
  let chop = 0;
  for (const w of terms) {
    const theta = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
    const u = 0.5 + 0.5 * Math.sin(leanPhase(theta, w.lean));
    const h = w.scale * (2 * Math.pow(u, w.sharp) - 1 - w.m);
    if (w.tier === 0) swell += h;
    else if (w.tier === 1) medium += h;
    else chop += h;
  }
  const s = seaState(t);
  return (
    swell * tierGain("swell", s) +
    medium * tierGain("medium", s) +
    chop * tierGain("chop", s)
  );
}

/** Slope of the surface, dh/dx and dh/dz, exact (not a finite difference). */
export function waveGradient(
  x: number,
  z: number,
  t: number,
): { x: number; z: number } {
  const sx = [0, 0, 0] as [number, number, number];
  const sz = [0, 0, 0] as [number, number, number];
  for (const w of terms) {
    const theta = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
    const bent = leanPhase(theta, w.lean);
    const u = 0.5 + 0.5 * Math.sin(bent);
    const slope =
      w.scale *
      w.sharp *
      Math.pow(u, w.sharp - 1) *
      Math.cos(bent) *
      (1 - w.lean * Math.cos(theta)) *
      w.k;
    const i = w.tier as 0 | 1 | 2;
    sx[i] += slope * w.dx;
    sz[i] += slope * w.dz;
  }
  const s = seaState(t);
  const g0 = tierGain("swell", s);
  const g1 = tierGain("medium", s);
  const g2 = tierGain("chop", s);
  return {
    x: sx[0] * g0 + sx[1] * g1 + sx[2] * g2,
    z: sz[0] * g0 + sz[1] * g1 + sz[2] * g2,
  };
}

/**
 * The same functions as GLSL, built from WAVES so the shader can never drift from the
 * CPU. `waveHeight` is what the vertex shader displaces by (exactly the CPU height).
 * `waveSurface` also returns the slope, with each wave's slope faded out with the
 * distance to the camera in proportion to its wavelength: far away the short waves
 * would only shimmer. The fade is only in the slope, never in the height. `seaState` and
 * `tierGains` are the slow sea-state cycle above, from the same clock.
 */
export function glslWaveHeight(): string {
  const f = (n: number) => n.toFixed(6);
  const { slow, fast } = SEA_STATE;
  const arg = (w: (typeof terms)[number]) =>
    `${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.omega)} * t + ${f(w.phase)}`;
  const height = terms.map((w) => {
    const bent = w.lean > 0 ? `th - ${f(w.lean)} * sin(th)` : "th";
    return `  { float th = ${arg(w)}; acc[${w.tier}] += ${f(w.scale)} * (2.0 * pow(0.5 + 0.5 * sin(${bent}), ${f(w.sharp)}) - ${f(1 + w.m)}); }`;
  });
  // Waves whose slope has faded to nothing are skipped, so the far sea (most of the
  // screen) pays only for its long swell.
  const surface = terms.map((w) => {
    const lean = w.lean > 0;
    return `  {
    float fade = 1.0 - smoothstep(${f(w.length * 12)}, ${f(w.length * 45)}, dist);
    if (fade > 0.0) {
      float th = ${arg(w)};
${lean ? `      float bt = th - ${f(w.lean)} * sin(th);` : "      float bt = th;"}
      float u = max(0.5 + 0.5 * sin(bt), 0.0);
      float s = ${f(w.scale * w.sharp * w.k)} * pow(u, ${f(w.sharp - 1)}) * cos(bt)${lean ? ` * (1.0 - ${f(w.lean)} * cos(th))` : ""} * fade;
      acc[${w.tier}] += s * vec2(${f(w.dx)}, ${f(w.dz)});
    }
  }`;
  });
  const gains = TIERS.map(
    (tier) => `${f(CALM_GAIN[tier])} + ${f(1 - CALM_GAIN[tier])} * s`,
  );
  return `float seaState(float t) {
  return 0.5 + 0.5 * (${f(slow.weight)} * sin(t * ${f((Math.PI * 2) / slow.period)} + ${f(slow.phase)}) + ${f(fast.weight)} * sin(t * ${f((Math.PI * 2) / fast.period)} + ${f(fast.phase)}));
}
vec3 tierGains(float t) {
  float s = seaState(t);
  return vec3(${gains.join(", ")});
}
float waveHeight(vec2 p, float t) {
  vec3 acc = vec3(0.0);
${height.join("\n")}
  return dot(acc, tierGains(t));
}
vec2 waveSlope(vec2 p, float t, float dist) {
  vec2 acc[3];
  acc[0] = vec2(0.0);
  acc[1] = vec2(0.0);
  acc[2] = vec2(0.0);
${surface.join("\n")}
  vec3 g = tierGains(t);
  return acc[0] * g.x + acc[1] * g.y + acc[2] * g.z;
}`;
}
