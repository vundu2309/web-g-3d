/**
 * Picks how many pixels the sea draws. It starts as sharp as the screen allows and
 * only coarsens when frames are slow for a sustained stretch; it sharpens again when
 * they are comfortably fast. Intervals are measured between drawn frames, which are
 * already capped at about 30 fps, so "slow" means clearly below that cap.
 */
export interface ScaleOptions {
  /** Hardware scaling level to start from; 1 / device pixel ratio, capped by the caller. */
  sharpest: number;
  /** Coarsest level allowed (1 = one pixel per CSS pixel is already half-sharp on 2x phones). */
  coarsest?: number;
}

const WINDOW = 2; // seconds per decision
const WARMUP = 4; // shader compile, WASM start and texture uploads are not representative
const SLOW = 0.052; // average interval above this is below ~19 fps
const FAST = 0.04; // below this the 30 fps cap is being met with room to spare
const STEP = 0.25;

export class ScaleGovernor {
  private level: number;
  private elapsed = 0;
  private frames = 0;
  private window = 0;
  private slow = 0;
  private fast = 0;
  private readonly coarsest: number;
  private readonly sharpest: number;
  constructor(options: ScaleOptions) {
    this.sharpest = options.sharpest;
    this.level = options.sharpest;
    this.coarsest = options.coarsest ?? 2;
  }
  get scaling() {
    return this.level;
  }
  /** Feed the seconds since the previous drawn frame; returns a new level when it changes. */
  sample(dt: number): number | undefined {
    if (!(dt > 0) || dt > 1) return undefined; // a hidden tab is not a slow phone
    this.elapsed += dt;
    if (this.elapsed < WARMUP) return undefined;
    this.window += dt;
    this.frames++;
    if (this.window < WINDOW) return undefined;
    const average = this.window / this.frames;
    this.window = 0;
    this.frames = 0;
    if (average > SLOW) {
      this.fast = 0;
      // Two slow windows in a row, so one hiccup never costs sharpness.
      if (++this.slow >= 2 && this.level < this.coarsest) {
        this.slow = 0;
        this.level = Math.min(this.coarsest, this.level + STEP);
        return this.level;
      }
    } else if (average < FAST) {
      this.slow = 0;
      if (++this.fast >= 5 && this.level > this.sharpest) {
        this.fast = 0;
        this.level = Math.max(this.sharpest, this.level - STEP);
        return this.level;
      }
    } else {
      this.slow = 0;
      this.fast = 0;
    }
    return undefined;
  }
}
