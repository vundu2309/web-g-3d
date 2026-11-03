// Deterministic wind spectrum. No renderer dependencies: CPU buoyancy and GPU
// textures consume the same displacement, normal and compression samples.
export const SPECTRUM_SIZE = 128;
export const SPECTRUM_LENGTH = 64;

export class OceanSpectrum {
  readonly size = SPECTRUM_SIZE;
  readonly length = SPECTRUM_LENGTH;
  readonly displacement = new Float32Array(this.size ** 2 * 4);
  readonly surface = new Float32Array(this.size ** 2 * 4);
  private readonly initial = new Float64Array(this.size ** 2 * 2);
  private readonly fields = Array.from(
    { length: 3 },
    () => new Float64Array(this.size ** 2 * 2),
  );
  private readonly line = new Float64Array(this.size * 2);
  private scale = 1;

  constructor(seed = 42) {
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return (state + 0.5) / 4294967296;
    };
    for (let z = 0; z < this.size; z++)
      for (let x = 0; x < this.size; x++) {
        const kx = this.waveNumber(x),
          kz = this.waveNumber(z),
          k = Math.hypot(kx, kz);
        if (k === 0) continue;
        const wind = (kx * 0.94 + kz * 0.34) / k;
        // Phillips spectrum: broad directional energy, suppressed tiny wavelengths.
        const power =
          Math.exp(-1 / (k * k * 1.4 ** 2)) *
          ((0.22 + 0.78 * wind * wind) / k ** 4) *
          Math.exp(-k * k * 0.13);
        const radius = Math.sqrt(-2 * Math.log(random()) * power * 0.5),
          angle = random() * Math.PI * 2;
        const i = (z * this.size + x) * 2;
        this.initial[i] = radius * Math.cos(angle);
        this.initial[i + 1] = radius * Math.sin(angle);
      }
    this.update(0, 1);
    let energy = 0;
    for (let i = 0; i < this.displacement.length; i += 4)
      energy += this.displacement[i]! ** 2;
    this.scale = 0.3 / Math.sqrt(energy / this.size ** 2);
    this.update(0, 1);
  }

  private waveNumber(i: number): number {
    return (
      ((i <= this.size / 2 ? i : i - this.size) * Math.PI * 2) / this.length
    );
  }

  // Inverse radix-2 FFT; row/column storage is reused each update.
  private inverseLine(): void {
    const n = this.size,
      a = this.line;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        for (let c = 0; c < 2; c++) {
          const v = a[i * 2 + c]!;
          a[i * 2 + c] = a[j * 2 + c]!;
          a[j * 2 + c] = v;
        }
      }
    }
    for (let width = 2; width <= n; width *= 2) {
      const angle = (2 * Math.PI) / width,
        cr = Math.cos(angle),
        ci = Math.sin(angle);
      for (let start = 0; start < n; start += width) {
        let wr = 1,
          wi = 0;
        for (let j = 0; j < width / 2; j++) {
          const p = (start + j) * 2,
            q = (start + j + width / 2) * 2;
          const r = a[q]! * wr - a[q + 1]! * wi,
            im = a[q]! * wi + a[q + 1]! * wr;
          a[q] = a[p]! - r;
          a[q + 1] = a[p + 1]! - im;
          a[p] = a[p]! + r;
          a[p + 1] = a[p + 1]! + im;
          const next = wr * cr - wi * ci;
          wi = wr * ci + wi * cr;
          wr = next;
        }
      }
    }
    for (let i = 0; i < a.length; i++) a[i] = a[i]! / n;
  }

  update(time: number, strength: number): void {
    const n = this.size,
      [height, dx, dz] = this.fields as [
        Float64Array,
        Float64Array,
        Float64Array,
      ];
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = (z * n + x) * 2,
          j = (((n - z) % n) * n + ((n - x) % n)) * 2;
        const kx = this.waveNumber(x),
          kz = this.waveNumber(z),
          k = Math.hypot(kx, kz);
        const angle = Math.sqrt(9.81 * k) * time,
          c = Math.cos(angle),
          s = Math.sin(angle);
        const real =
          (this.initial[i]! + this.initial[j]!) * c -
          (this.initial[i + 1]! + this.initial[j + 1]!) * s;
        const imaginary =
          (this.initial[i]! - this.initial[j]!) * s +
          (this.initial[i + 1]! - this.initial[j + 1]!) * c;
        height[i] = real;
        height[i + 1] = imaginary;
        dx[i] = k ? (-kx / k) * imaginary : 0;
        dx[i + 1] = k ? (kx / k) * real : 0;
        dz[i] = k ? (-kz / k) * imaginary : 0;
        dz[i + 1] = k ? (kz / k) * real : 0;
      }
    for (const field of this.fields) {
      for (let z = 0; z < n; z++) {
        this.line.set(field.subarray(z * n * 2, (z + 1) * n * 2));
        this.inverseLine();
        field.set(this.line, z * n * 2);
      }
      for (let x = 0; x < n; x++) {
        for (let z = 0; z < n; z++) {
          this.line[z * 2] = field[(z * n + x) * 2]!;
          this.line[z * 2 + 1] = field[(z * n + x) * 2 + 1]!;
        }
        this.inverseLine();
        for (let z = 0; z < n; z++) {
          field[(z * n + x) * 2] = this.line[z * 2]!;
          field[(z * n + x) * 2 + 1] = this.line[z * 2 + 1]!;
        }
      }
    }
    const gain = this.scale * strength;
    // Keep the horizontal map invertible even in rough mode. A global bound
    // avoids local folds/teleporting buoyancy without clipping individual waves.
    let dxx = 0,
      dxz = 0,
      dzx = 0,
      dzz = 0;
    const spacing = this.length / n;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = (z * n + x) * 2,
          r = (z * n + ((x + 1) % n)) * 2,
          t = (((z + 1) % n) * n + x) * 2;
        dxx = Math.max(dxx, Math.abs(dx[r]! - dx[i]!) / spacing);
        dxz = Math.max(dxz, Math.abs(dx[t]! - dx[i]!) / spacing);
        dzx = Math.max(dzx, Math.abs(dz[r]! - dz[i]!) / spacing);
        dzz = Math.max(dzz, Math.abs(dz[t]! - dz[i]!) / spacing);
      }
    const gradientBound = Math.max(dxx + dxz, dzx + dzz);
    const horizontalGain = Math.min(
      gain * 0.8,
      0.8 / Math.max(gradientBound, 1e-12),
    );
    for (let i = 0; i < n * n; i++) {
      const h = height[i * 2]! * gain;
      this.displacement[i * 4] = h + 0.15 * h * h;
      this.displacement[i * 4 + 1] = dx[i * 2]! * horizontalGain;
      this.displacement[i * 4 + 2] = dz[i * 2]! * horizontalGain;
    }
    const delta = (this.length / n) * 2;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = (z * n + x) * 4,
          l = (z * n + ((x + n - 1) % n)) * 4,
          r = (z * n + ((x + 1) % n)) * 4;
        const b = (((z + n - 1) % n) * n + x) * 4,
          t = (((z + 1) % n) * n + x) * 4;
        const d = this.displacement;
        const hx = (d[r]! - d[l]!) / delta,
          hz = (d[t]! - d[b]!) / delta;
        const xx = 1 + (d[r + 1]! - d[l + 1]!) / delta,
          xz = (d[t + 1]! - d[b + 1]!) / delta;
        const zx = (d[r + 2]! - d[l + 2]!) / delta,
          zz = 1 + (d[t + 2]! - d[b + 2]!) / delta;
        const nx = hz * zx - zz * hx,
          ny = zz * xx - xz * zx,
          nz = xz * hx - hz * xx,
          len = Math.hypot(nx, ny, nz);
        this.surface[i] = nx / len;
        this.surface[i + 1] = ny / len;
        this.surface[i + 2] = nz / len;
        // Whitecaps follow compressed crests of the actual displaced surface.
        const compressed = Math.max(0, Math.min(1, (0.84 - ny) / 0.32));
        this.surface[i + 3] =
          compressed *
          compressed *
          Math.max(0, Math.min(1, (d[i]! + 0.05) / 0.35));
      }
  }

  sample(x: number, z: number, channel: number): number {
    const n = this.size,
      u = ((((x / this.length) * n) % n) + n) % n,
      v = ((((z / this.length) * n) % n) + n) % n;
    const ix = Math.floor(u),
      iz = Math.floor(v),
      fx = u - ix,
      fz = v - iz,
      a = this.displacement;
    const x1 = (ix + 1) % n,
      z1 = (iz + 1) % n;
    return (
      (a[(iz * n + ix) * 4 + channel]! * (1 - fx) +
        a[(iz * n + x1) * 4 + channel]! * fx) *
        (1 - fz) +
      (a[(z1 * n + ix) * 4 + channel]! * (1 - fx) +
        a[(z1 * n + x1) * 4 + channel]! * fx) *
        fz
    );
  }

  heightAt(x: number, z: number): number {
    let u = x,
      v = z;
    for (let i = 0; i < 24; i++) {
      u = x - this.sample(u, v, 1);
      v = z - this.sample(u, v, 2);
    }
    return this.sample(u, v, 0);
  }
}
