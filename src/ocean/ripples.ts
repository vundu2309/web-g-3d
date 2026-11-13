/**
 * Fine ripples on the sea: a small tileable slope map generated once at startup (no asset,
 * no fetch) and sampled by the water fragment shader. It is purely visual: ripples tilt the
 * normal but never move the geometry, so the boats (which float on `waves.ts`) do not feel
 * them.
 *
 * The map is a sum of travelling sines with whole-number wave vectors (so it tiles without a
 * seam), directions spread around the +u axis (the wind, once the shader rotates it into the
 * world) and an amplitude spectrum that falls with the wavenumber. Each texel holds the slope
 * of that sum (RG) and of the same sum a quarter period later (BA): the shader mixes the two
 * with cos/sin of a phase that grows with time, which moves every ripple along its own
 * direction instead of sliding one picture across the sea. Mipmaps average the slopes towards
 * zero far away, so distant ripples calm down instead of shimmering.
 */
export const RIPPLE_SIZE = 128;
/** Slopes are stored divided by this many standard deviations (|s| beyond it clamps). */
export const RIPPLE_RANGE = 4;

export interface RippleComponent {
  /** Whole cycles per tile along u and v. */
  m: number;
  n: number;
  amplitude: number;
  phase: number;
}

/** A small deterministic generator, so every device draws the same sea. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ripple spectrum: 3 to 22 cycles per tile, most within about 50 degrees of the wind. */
export function rippleComponents(count = 56, seed = 7): RippleComponent[] {
  const rand = random(seed);
  const used = new Set<string>();
  const out: RippleComponent[] = [];
  for (let guard = 0; out.length < count && guard < count * 50; guard++) {
    const cycles = 3 + Math.pow(rand(), 1.4) * 19;
    // A wind band (sum of two uniforms: a soft triangle about +-0.9 rad) and a few strays.
    const angle =
      rand() < 0.15
        ? (rand() - 0.5) * Math.PI * 2
        : (rand() + rand() - 1) * 0.9;
    const m = Math.round(Math.cos(angle) * cycles);
    const n = Math.round(Math.sin(angle) * cycles);
    // (m, n) and (-m, -n) are the same wave: keep one, so the energy is what we asked for.
    const key = m > 0 || (m === 0 && n > 0) ? `${m},${n}` : `${-m},${-n}`;
    if ((m === 0 && n === 0) || used.has(key)) continue;
    used.add(key);
    const k = Math.hypot(m, n);
    out.push({
      m,
      n,
      amplitude: Math.pow(k, -1.6),
      phase: rand() * Math.PI * 2,
    });
  }
  return out;
}

/** Standard deviation of each slope channel, exact for distinct wave vectors. */
export function rippleSlopeDeviation(components: readonly RippleComponent[]) {
  let su = 0;
  let sv = 0;
  for (const c of components) {
    su += (c.amplitude * c.m) ** 2 / 2;
    sv += (c.amplitude * c.n) ** 2 / 2;
  }
  return Math.sqrt((su + sv) / 2);
}

/**
 * RGBA bytes, RIPPLE_SIZE square: slope du, dv of the field, then of the field a quarter
 * period on. 128 is the zero slope; 0 and 255 are -+RIPPLE_RANGE standard deviations.
 */
export function ripplePixels(
  components: readonly RippleComponent[] = rippleComponents(),
  size = RIPPLE_SIZE,
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const scale = 1 / (RIPPLE_RANGE * rippleSlopeDeviation(components));
  const field = new Float32Array(size * size * 4);
  for (const c of components) {
    const ku = (Math.PI * 2 * c.m) / size;
    const kv = (Math.PI * 2 * c.n) / size;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const theta = ku * x + kv * y + c.phase;
        const cos = Math.cos(theta) * c.amplitude;
        const sin = Math.sin(theta) * c.amplitude;
        const i = (y * size + x) * 4;
        // d/du of a sin(theta) and of a sin(theta + pi/2) = a cos(theta), in whole cycles.
        field[i] = (field[i] ?? 0) + cos * c.m;
        field[i + 1] = (field[i + 1] ?? 0) + cos * c.n;
        field[i + 2] = (field[i + 2] ?? 0) - sin * c.m;
        field[i + 3] = (field[i + 3] ?? 0) - sin * c.n;
      }
  }
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(-1, Math.min(1, (field[i] ?? 0) * scale));
    out[i] = Math.round(127.5 + v * 127.5);
  }
  return out;
}
