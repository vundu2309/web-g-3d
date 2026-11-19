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
import { SHORE_ISLANDS } from "./shore.ts";
import { probe } from "./probe.ts";

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
 * The summed amplitudes (m) of each tier at the roughest sea: the sea the game has always had
 * (swell 1.41, medium 0.87, chop 0.125, 2.405 in all). The wave table below is drawn to fill
 * exactly these, so the calm and the roughest heights, and the boats' handling, do not change
 * with the wave set.
 */
export const TIER_TOTALS = { swell: 1.41, medium: 0.87, chop: 0.125 } as const;
/**
 * A way to test the boat in a violent sea: `?waves=2` in the page address makes every wave twice as
 * tall (the summed amplitudes, 1.4 to 2.4 m, become 2.8 to 4.8 m), `?waves=3` three times, up to 4.
 * The same factor is in the physics and the water shader, since both read the table below; the
 * pinch (how far a crest leans over) is a share of the height and does not change, so the surface
 * never folds. Anything else, or no switch, is the sea the game has always had (1). It is read once,
 * when the page loads, from the address or from the choice kept on this device by the "Thử sóng
 * biển" card of Settings (settings-perf.ts).
 */
export function waveBoost(value: string | null = probe("waves")): number {
  const boost = Number(value);
  return Number.isFinite(boost) && boost >= 1 ? Math.min(boost, 4) : 1;
}
export const WAVE_BOOST = waveBoost();
/** How many waves the sea is made of, and the longest and shortest wavelength (m). */
export const SPECTRUM = {
  count: 20,
  longest: 70,
  shortest: 3,
  /** The wavelength (m) where the wind sea peaks: the spectrum has a JONSWAP-like bump there. */
  peak: 44,
  /** A wave of at least this length is swell, of at least `medium` is medium, below is chop. */
  swell: 40,
  medium: 12,
  seed: 20261117,
};
/** A small deterministic random generator, so the same sea is drawn on every device. */
function seeded(seed: number) {
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
 * A wave set drawn from a wind spectrum. Wavelengths run geometrically from the longest to the
 * shortest (a hair of jitter, so no two neighbours are the same length); amplitude follows a
 * Phillips-like fall-off, a proportional to the wavelength, with a JONSWAP bump at the peak and
 * a little random spread, then each tier is scaled to its fixed total. Headings spread around
 * the wind, wider the shorter the wave (about 10 degrees for the longest, nearly 70 for the
 * shortest) and alternate side from one wave to the next, so neighbours never run alike.
 */
export function drawWaves(boost = 1): Wave[] {
  const random = seeded(SPECTRUM.seed);
  const { count, longest, shortest, peak } = SPECTRUM;
  const ratio = Math.pow(shortest / longest, 1 / (count - 1));
  const span = Math.log(longest / shortest);
  const raw = Array.from({ length: count }, (_, i) => {
    const jitter = 1 + (random() - 0.5) * 0.04;
    const length = longest * Math.pow(ratio, i) * (i === 0 ? 1 : jitter);
    const rank = Math.log(length / shortest) / span; // 1 longest, 0 shortest
    const bump =
      1 +
      1.8 * Math.exp(-Math.pow(Math.log(length / peak), 2) / (2 * 0.35 * 0.35));
    const weight = length * bump * (0.7 + 0.6 * random());
    const side = (i % 2 === 0 ? -1 : 1) * (0.5 + 0.5 * random());
    const spread = 0.2 + 1.0 * Math.pow(1 - rank, 1.3);
    const tier: WaveTier =
      length >= SPECTRUM.swell
        ? "swell"
        : length >= SPECTRUM.medium
          ? "medium"
          : "chop";
    return {
      length,
      weight,
      direction: WIND_DIRECTION + side * spread,
      phase: random() * Math.PI * 2,
      sharp: 2.0 + 1.6 * (1 - rank),
      lean:
        length >= 40
          ? 0.3
          : length >= 14
            ? 0.25 * ((length - 14) / 20 + 0.4)
            : 0,
      tier,
    };
  });
  const sums = { swell: 0, medium: 0, chop: 0 };
  for (const w of raw) sums[w.tier] += w.weight;
  return raw.map(({ weight, ...w }) => ({
    ...w,
    amplitude: (weight / sums[w.tier]) * TIER_TOTALS[w.tier] * boost,
  }));
}
/** The waves of the sea (the boats' physics and the water shader both read this table). */
export const WAVES: readonly Wave[] = drawWaves(WAVE_BOOST);

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

/**
 * Gerstner-style HORIZONTAL motion of the water surface. Each wave moves every point of the
 * sea along its heading by (q / k) cos(psi), psi the wave's (leaning) phase: the points before
 * a crest move toward it and the ones behind it move back, so the crest pinches to a point and
 * the trough widens. `q` is the wave's pinch (1 would stand the crest up to a fold): the
 * pinches of a tier add up to PINCH[tier], shared out by amplitude. The mesh is drawn with this
 * motion (vertex shader) and the physics follows it: `waveHeight` returns the height of the
 * vertex that lands at a world point (`restPoint`, Newton's method), so the hull floats on the
 * crest it sees. The Jacobian of the motion, I - M with M summed from the same loop, must stay
 * positive (the surface never folds): waves tests check its smallest determinant.
 */
export const PINCH: Record<WaveTier, number> = {
  swell: 0.45,
  medium: 0.6,
  chop: 0.3,
};
/** The most (m) the drawn surface may differ from the physics one at any point, at any sea state. */
export const HORIZONTAL_LIMIT = 0.03;
/** Metres from an island's mean coast where the horizontal motion is zero and where it is full. */
export const HORIZONTAL_FADE = { from: 70, to: 170 };

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
    pinch:
      (PINCH[wave.tier] * wave.amplitude) /
      (TIER_TOTALS[wave.tier] * WAVE_BOOST),
  };
});

/** Sum of the wave amplitudes at the roughest sea: the sea never rises or falls farther than this. */
export const MAX_WAVE_HEIGHT = WAVES.reduce((s, w) => s + w.amplitude, 0);
/** Summed amplitudes of each tier at the roughest sea. */
export const TIER_AMPLITUDE: Record<WaveTier, number> = {
  swell: WAVES.filter((w) => w.tier === "swell").reduce(
    (s, w) => s + w.amplitude,
    0,
  ),
  medium: WAVES.filter((w) => w.tier === "medium").reduce(
    (s, w) => s + w.amplitude,
    0,
  ),
  chop: WAVES.filter((w) => w.tier === "chop").reduce(
    (s, w) => s + w.amplitude,
    0,
  ),
};
/** The same at the calmest sea. */
export const CALM_WAVE_HEIGHT = WAVES.reduce(
  (s, w) => s + w.amplitude * CALM_GAIN[w.tier],
  0,
);

/**
 * The sea's height at a REST position (the point a mesh vertex starts from, before the
 * horizontal motion below): a pure vertical sum of the waves. Not what a boat feels: see
 * `waveHeight`.
 */
export function restHeight(x: number, z: number, t: number): number {
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

/** Slope of the rest surface, dh/dx and dh/dz, exact (not a finite difference). */
export function restGradient(
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
 * How much of the horizontal motion a rest position keeps: 0 within HORIZONTAL_FADE.from of
 * an island's mean coast, 1 beyond .to (smooth between). The GLSL `horizontalFade` is the
 * same function of the same island list.
 */
export function horizontalFade(x: number, z: number): number {
  return fadeAt(x, z).f;
}
/** The fade and its gradient (the Newton steps and the slope need how it changes). */
export function fadeAt(
  x: number,
  z: number,
): { f: number; gx: number; gz: number } {
  let nearest = 1e4;
  let nx = 0;
  let nz = 0;
  for (const island of SHORE_ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const length = Math.hypot(dx, dz);
    const away = length - island.radius * 0.92;
    if (away < nearest) {
      nearest = away;
      nx = dx / Math.max(length, 1e-6);
      nz = dz / Math.max(length, 1e-6);
    }
  }
  const span = HORIZONTAL_FADE.to - HORIZONTAL_FADE.from;
  const u = Math.min(1, Math.max(0, (nearest - HORIZONTAL_FADE.from) / span));
  const slope = (6 * u * (1 - u)) / span;
  return { f: u * u * (3 - 2 * u), gx: slope * nx, gz: slope * nz };
}

export interface WaveMotion {
  /** Horizontal motion (m) of the rest position, before the shore fade. */
  x: number;
  z: number;
  /** The symmetric squeeze matrix M: the motion's Jacobian is I - fade * M. */
  xx: number;
  xz: number;
  zz: number;
}
/** The horizontal motion at a rest position and its squeeze (the CPU twin of `waveMotion`). */
export function waveMotion(x: number, z: number, t: number): WaveMotion {
  const s = seaState(t);
  const gains = TIERS.map((tier) => tierGain(tier, s));
  let mx = 0;
  let mz = 0;
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const w of terms) {
    const g = gains[w.tier]!;
    const theta = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
    const bent = leanPhase(theta, w.lean);
    const move = ((g * w.pinch) / w.k) * Math.cos(bent);
    mx += move * w.dx;
    mz += move * w.dz;
    const squeeze =
      g * w.pinch * Math.sin(bent) * (1 - w.lean * Math.cos(theta));
    xx += squeeze * w.dx * w.dx;
    xz += squeeze * w.dx * w.dz;
    zz += squeeze * w.dz * w.dz;
  }
  return { x: mx, z: mz, xx, xz, zz };
}
/** The horizontal motion (m) the mesh vertex that starts at (x, z) is drawn with, shore fade included. */
export function waveDisplacement(
  x: number,
  z: number,
  t: number,
): { x: number; z: number } {
  const m = waveMotion(x, z, t);
  const f = horizontalFade(x, z);
  return { x: m.x * f, z: m.z * f };
}

/** Newton steps that find the rest position drawn at a world point (the shader does the same). */
export const REST_STEPS = 4;
/** The 2 x 2 Jacobian [[a, b], [c, d]] of the drawn position with respect to the rest position. */
export interface Jacobian {
  a: number;
  b: number;
  c: number;
  d: number;
}
function jacobianAt(x: number, z: number, t: number) {
  const m = waveMotion(x, z, t);
  const fade = fadeAt(x, z);
  const jac: Jacobian = {
    a: 1 - fade.f * m.xx + m.x * fade.gx,
    b: -fade.f * m.xz + m.x * fade.gz,
    c: -fade.f * m.xz + m.z * fade.gx,
    d: 1 - fade.f * m.zz + m.z * fade.gz,
  };
  return { m, f: fade.f, jac };
}
/**
 * The rest position (x0, z0) whose vertex is drawn at the world point (x, z): the solution of
 * x0 + fade * D(x0) = x, by Newton's method from x - D(x). `residual` is how far the last
 * step left the drawn point from (x, z), in metres; `jac` is the Jacobian at the solution.
 */
export function restPoint(
  x: number,
  z: number,
  t: number,
): { x: number; z: number; jac: Jacobian; residual: number } {
  const first = waveMotion(x, z, t);
  const f0 = horizontalFade(x, z);
  let px = x - f0 * first.x;
  let pz = z - f0 * first.z;
  let residual = 0;
  for (let i = 0; i < REST_STEPS; i++) {
    const { m, f, jac } = jacobianAt(px, pz, t);
    const rx = px + f * m.x - x;
    const rz = pz + f * m.z - z;
    residual = Math.hypot(rx, rz);
    const det = Math.max(jac.a * jac.d - jac.b * jac.c, 0.02);
    px -= (jac.d * rx - jac.b * rz) / det;
    pz -= (-jac.c * rx + jac.a * rz) / det;
  }
  return { x: px, z: pz, jac: jacobianAt(px, pz, t).jac, residual };
}

/**
 * Sea surface height in metres at world (x, z) and time t in seconds: the height of the surface
 * AS IT IS DRAWN. The mesh moves sideways (the Gerstner-style motion above), so the height at a
 * world point is the rest height of the vertex that lands there. The boats, the fishing line and
 * the shaders that need the surface all use this one.
 */
export function waveHeight(x: number, z: number, t: number): number {
  const p = restPoint(x, z, t);
  return restHeight(p.x, p.z, t);
}

/** Slope of the drawn surface, dh/dx and dh/dz: the rest slope through the inverse of the motion's Jacobian. */
export function waveGradient(
  x: number,
  z: number,
  t: number,
): { x: number; z: number } {
  const p = restPoint(x, z, t);
  const g = restGradient(p.x, p.z, t);
  const { a, b, c, d } = p.jac;
  const det = Math.max(a * d - b * c, 0.02);
  return { x: (d * g.x - c * g.z) / det, z: (-b * g.x + a * g.z) / det };
}

/**
 * How far the drawn surface is from the physics surface (m) at the point where the vertex that
 * starts at (x, z) is drawn: the drawn height is the rest height of (x, z), the physics height
 * there is `waveHeight`. Near zero by construction (the Newton residual); bounded by
 * HORIZONTAL_LIMIT (tested).
 */
export function drawnSurfaceError(x: number, z: number, t: number): number {
  const d = waveDisplacement(x, z, t);
  return Math.abs(restHeight(x, z, t) - waveHeight(x + d.x, z + d.z, t));
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
      // How much this wave squeezes the mesh along its heading (the horizontal motion, see PINCH).
      jac[${w.tier}] += ${f(w.pinch)} * (2.0 * u - 1.0)${lean ? ` * (1.0 - ${f(w.lean)} * cos(th))` : ""} * vec3(${f(w.dx * w.dx)}, ${f(w.dx * w.dz)}, ${f(w.dz * w.dz)});
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
// The slope of the analytic surface at p; \`big\` is the swell and medium part alone and \`squeeze\`
// the symmetric matrix (xx, xz, zz) the horizontal motion adds to the mesh: the drawn surface's
// slope is (I - squeeze)^-1 times this slope (the shader does that, with the shore fade).
vec2 waveSlopeSplit(vec2 p, float t, float dist, out vec2 big, out vec3 squeeze) {
  vec2 acc[3];
  acc[0] = vec2(0.0);
  acc[1] = vec2(0.0);
  acc[2] = vec2(0.0);
  vec3 jac[3];
  jac[0] = vec3(0.0);
  jac[1] = vec3(0.0);
  jac[2] = vec3(0.0);
${surface.join("\n")}
  vec3 g = tierGains(t);
  big = acc[0] * g.x + acc[1] * g.y;
  squeeze = jac[0] * g.x + jac[1] * g.y + jac[2] * g.z;
  return big + acc[2] * g.z;
}
vec2 waveSlope(vec2 p, float t, float dist) {
  vec2 big;
  vec3 squeeze;
  return waveSlopeSplit(p, t, dist, big, squeeze);
}
/** The tallest height the sea can have right now (the summed amplitudes at the current state). */
float waveReach(float t) {
  return dot(vec3(${f(TIER_AMPLITUDE.swell)}, ${f(TIER_AMPLITUDE.medium)}, ${f(TIER_AMPLITUDE.chop)}), tierGains(t));
}`;
}

/**
 * GLSL for the horizontal motion of the water mesh (needs `glslWaveHeight()` and
 * `glslHorizontalFade()` before it): `waveMotion` is the CPU's, `waveDisplace` the motion
 * alone, and `seaHeight(p, t)` the height of the drawn surface at a world point (the CPU's
 * `waveHeight`: the rest position found with `REST_STEPS` Newton steps, then `waveHeight` of
 * the shader's rest function). The sea mesh moves its vertices with `waveDisplace`; the shaders
 * that read the surface at a world point (under the water) use `seaHeight`.
 */
export function glslWaveDisplace(): string {
  const f = (n: number) => n.toFixed(6);
  const body = terms.map((w) => {
    const bent = w.lean > 0 ? `th - ${f(w.lean)} * sin(th)` : "th";
    const lean = w.lean > 0 ? ` * (1.0 - ${f(w.lean)} * cos(th))` : "";
    return `  { float th = ${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.omega)} * t + ${f(w.phase)}; float bt = ${bent};
    move[${w.tier}] += ${f(w.pinch / w.k)} * cos(bt) * vec2(${f(w.dx)}, ${f(w.dz)});
    sq[${w.tier}] += ${f(w.pinch)} * sin(bt)${lean} * vec3(${f(w.dx * w.dx)}, ${f(w.dx * w.dz)}, ${f(w.dz * w.dz)}); }`;
  });
  return `vec2 waveMotion(vec2 p, float t, out vec3 squeeze) {
  vec2 move[3];
  move[0] = vec2(0.0);
  move[1] = vec2(0.0);
  move[2] = vec2(0.0);
  vec3 sq[3];
  sq[0] = vec3(0.0);
  sq[1] = vec3(0.0);
  sq[2] = vec3(0.0);
${body.join("\n")}
  vec3 g = tierGains(t);
  squeeze = sq[0] * g.x + sq[1] * g.y + sq[2] * g.z;
  return move[0] * g.x + move[1] * g.y + move[2] * g.z;
}
vec2 waveDisplace(vec2 p, float t) {
  vec3 squeeze;
  return waveMotion(p, t, squeeze);
}
float seaHeight(vec2 p, float t) {
  vec3 sq;
  vec2 q = p - waveMotion(p, t, sq) * horizontalFade(p);
  for (int i = 0; i < ${REST_STEPS}; i++) {
    vec2 d = waveMotion(q, t, sq);
    vec2 fg;
    float fade = horizontalFadeGrad(q, fg);
    vec2 r = q + d * fade - p;
    float a = 1.0 - fade * sq.x + d.x * fg.x;
    float b = -fade * sq.y + d.x * fg.y;
    float c = -fade * sq.y + d.y * fg.x;
    float e = 1.0 - fade * sq.z + d.y * fg.y;
    float det = max(a * e - b * c, 0.02);
    q -= vec2(e * r.x - b * r.y, -c * r.x + a * r.y) / det;
  }
  return waveHeight(q, t);
}`;
}
/** GLSL `horizontalFade(p)`: 0 within HORIZONTAL_FADE.from of an island's coast, 1 beyond .to; `horizontalFadeGrad` also gives its gradient. */
export function glslHorizontalFade(): string {
  const f = (n: number) => n.toFixed(6);
  const islands = SHORE_ISLANDS.map(
    (island) =>
      `  { vec2 v = p - vec2(${f(island.x)}, ${f(island.z)}); float l = max(length(v), 1.0e-6); float away = l - ${f(island.radius * 0.92)}; if (away < nearest) { nearest = away; dir = v / l; } }`,
  );
  const span = HORIZONTAL_FADE.to - HORIZONTAL_FADE.from;
  return `float horizontalFadeGrad(vec2 p, out vec2 grad) {
  float nearest = 1.0e4;
  vec2 dir = vec2(0.0);
${islands.join("\n")}
  float u = clamp((nearest - ${f(HORIZONTAL_FADE.from)}) / ${f(span)}, 0.0, 1.0);
  grad = dir * (6.0 * u * (1.0 - u) / ${f(span)});
  return u * u * (3.0 - 2.0 * u);
}
float horizontalFade(vec2 p) {
  vec2 grad;
  return horizontalFadeGrad(p, grad);
}`;
}
