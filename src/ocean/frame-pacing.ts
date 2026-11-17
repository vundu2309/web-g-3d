/**
 * How often the sea is drawn, as plain numbers (no DOM, no Babylon, so tests read it directly).
 * The sea used to be drawn at most every 33 ms (about 30 fps) on every screen; a boat doing 12 m/s
 * then jumps about 0.4 m per frame, which reads as judder on a 60 to 144 Hz screen while the slow
 * things around it look fine. Now the pacer draws on the display's own frames, and falls back to the
 * old 30 fps rhythm when the device cannot keep up:
 *
 * - "full": draw every animation frame, but never more often than MIN_INTERVAL apart (about 100 fps
 *   at most, so a 144 Hz screen draws every second frame, 72 fps, and a 120 Hz phone 60 fps: the
 *   battery is not spent on frames nobody can tell apart);
 * - "eco": the old rhythm, a frame at least ECO_INTERVAL after the last one (about 30 fps).
 *
 * The pacer starts in "full" and judges after a warm-up (shader compile, WASM start and texture
 * uploads are not representative). If the average gap between drawn frames over a window is
 * longer than SLOW_GAP (below about 42 fps, an uneven mix of 16 and 33 ms frames) it drops to
 * "eco" because a steady 30 is smoother than a ragged 40. After a while it tries "full" again for
 * one window; each failed try doubles the wait (up to RETRY_MAX), a success resets it.
 *
 * The quality governors in render-scale.ts and clear-water.ts read the gaps between drawn frames
 * with limits meant for the 30 fps rhythm: they only coarsen below about 19 fps, so in "full" they
 * never do (the pacer gives up first), and in "eco" they behave exactly as before.
 */

/** No two drawn frames closer than this (ms): about 100 fps at most. */
export const MIN_INTERVAL = 10;
/** The fallback rhythm (ms between drawn frames): about 30 fps. */
export const ECO_INTERVAL = 31;
/** Mean gap between drawn frames (ms) above which "full" is not being kept up. */
export const SLOW_GAP = 24;
/** Seconds of frames not judged at the start. */
export const WARMUP = 3;
/** Seconds per judgement. */
export const WINDOW = 1.5;
/** Seconds in "eco" before the first try of "full", and the longest wait. */
export const RETRY_FIRST = 10;
export const RETRY_MAX = 120;
/** A gap longer than this (ms) is a hidden tab, not a slow device. */
const HIDDEN = 250;

export type PaceMode = "full" | "eco";

export class FramePacer {
  private current: PaceMode = "full";
  private lastDraw = -Infinity;
  private started = -1;
  private windowStart = -1;
  private windowSum = 0;
  private windowFrames = 0;
  private ecoSince = 0;
  private retryAfter = RETRY_FIRST;
  private retried = false;

  get mode(): PaceMode {
    return this.current;
  }

  /**
   * Call on every animation frame with its timestamp (ms). Returns true when this frame is
   * to be drawn.
   */
  frame(now: number): boolean {
    if (this.started < 0) {
      this.started = now;
      this.windowStart = now;
    }
    const gap = now - this.lastDraw;
    const interval = this.current === "full" ? MIN_INTERVAL : ECO_INTERVAL;
    if (gap < interval) return false;
    const drawn = Number.isFinite(gap) ? gap : 0;
    this.lastDraw = now;
    this.judge(now, drawn);
    return true;
  }

  private judge(now: number, gap: number) {
    if (gap > HIDDEN) {
      // A hidden tab: start counting again, and give the warm-up its time again.
      this.started = now;
      this.windowStart = now;
      this.windowSum = 0;
      this.windowFrames = 0;
      return;
    }
    if (this.current === "eco") {
      if ((now - this.ecoSince) / 1000 >= this.retryAfter) {
        this.current = "full";
        this.windowStart = now;
        this.windowSum = 0;
        this.windowFrames = 0;
        // The try gets a short warm-up too: the first frames after a switch are not typical.
        this.started = now - (WARMUP - 0.5) * 1000;
      }
      return;
    }
    if ((now - this.started) / 1000 < WARMUP) {
      this.windowStart = now;
      return;
    }
    this.windowSum += gap;
    this.windowFrames++;
    if ((now - this.windowStart) / 1000 < WINDOW) return;
    const mean = this.windowSum / Math.max(1, this.windowFrames);
    this.windowStart = now;
    this.windowSum = 0;
    this.windowFrames = 0;
    if (mean > SLOW_GAP) {
      this.current = "eco";
      this.ecoSince = now;
      // The next try comes after the wait so far, doubled once it has failed before.
      this.retryAfter = Math.min(
        RETRY_MAX,
        this.retried ? this.retryAfter * 2 : this.retryAfter,
      );
      this.retried = true;
    } else {
      this.retryAfter = RETRY_FIRST;
      this.retried = false;
    }
  }
}
