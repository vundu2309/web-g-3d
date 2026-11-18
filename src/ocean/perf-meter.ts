/**
 * The numbers behind the in-game performance panel (src/app/perf-panel.ts), as plain code with no
 * DOM so tests read it directly. Frames are recorded as they are drawn; the panel asks for a
 * summary of the last `span` seconds.
 *
 * - "drawn" frames are the ones the sea was drawn on (the pacer, frame-pacing.ts, may skip display
 *   frames); their gaps give the fps the player sees.
 * - the "display" gaps are every animation frame, drawn or not: the screen's own rate, and how
 *   often the main thread was handed a frame at all.
 * - the "cost" of a frame is the time the update and the draw took on the main thread (not the
 *   GPU: browsers do not say how long the GPU took).
 */

export interface PerfSummary {
  /** Drawn frames per second over the window. */
  fps: number;
  /** Animation frames per second (the display's rate, or lower when the page is starved). */
  displayFps: number;
  /** Gap between drawn frames (ms): the mean, the 95th percentile and the worst. */
  gapAvg: number;
  gapP95: number;
  gapMax: number;
  /** Main-thread time (ms) of the update and draw: the mean and the worst. */
  costAvg: number;
  costMax: number;
  /** Drawn frames in the window whose gap was over HITCH ms. */
  hitches: number;
}

/** The panel turns red when the frames are poor: under POOR.fps, or the slowest 5 % of gaps over POOR.p95, or a frame costing more than POOR.cost on average, or this many hitches in the window. */
export const POOR = { fps: 24, p95: 60, cost: 28, hitches: 3 };
/** Frames needed in the window before it is judged (the first moments of a page tell nothing). */
export const JUDGE_FROM = 12;

/** True when the summary of a window shows poor performance. */
export function isPoor(s: PerfSummary, frames: number): boolean {
  if (frames < JUDGE_FROM) return false;
  return (
    s.fps < POOR.fps ||
    s.gapP95 > POOR.p95 ||
    s.costAvg > POOR.cost ||
    s.hitches >= POOR.hitches
  );
}

/** A gap longer than this (ms) counts as a hitch. */
export const HITCH = 50;

const percentile = (sorted: number[], p: number) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
    : 0;

export class PerfWindow {
  private readonly span: number;
  private drawn: { at: number; gap: number; cost: number }[] = [];
  private display: number[] = [];

  constructor(span = 2000) {
    this.span = span;
  }

  /** Call for every animation frame (ms timestamp). */
  tick(now: number) {
    this.display.push(now);
    this.trim(now);
  }

  /** Call for every frame that was drawn: its time, the gap since the last one and the work it took (ms). */
  frame(now: number, gap: number, cost: number) {
    this.drawn.push({ at: now, gap, cost });
    this.trim(now);
  }

  private trim(now: number) {
    const from = now - this.span;
    let i = 0;
    while (i < this.drawn.length && this.drawn[i]!.at < from) i++;
    if (i) this.drawn = this.drawn.slice(i);
    let j = 0;
    while (j < this.display.length && this.display[j]! < from) j++;
    if (j) this.display = this.display.slice(j);
  }

  /** How many drawn frames the window holds. */
  get frames() {
    return this.drawn.length;
  }

  /** The summary of the window ending at `now` (zeros while nothing has been recorded). */
  summary(now: number): PerfSummary {
    this.trim(now);
    // Frames within the window, but gaps from before it are not counted: ignore the first frame's gap.
    const gaps = this.drawn.slice(1).map((f) => f.gap);
    const sorted = [...gaps].sort((a, b) => a - b);
    const costs = this.drawn.map((f) => f.cost);
    const mean = (a: number[]) =>
      a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const seconds =
      (this.drawn.length > 1
        ? this.drawn[this.drawn.length - 1]!.at - this.drawn[0]!.at
        : 0) / 1000;
    const displaySeconds =
      (this.display.length > 1
        ? this.display[this.display.length - 1]! - this.display[0]!
        : 0) / 1000;
    return {
      fps: seconds > 0 ? (this.drawn.length - 1) / seconds : 0,
      displayFps:
        displaySeconds > 0 ? (this.display.length - 1) / displaySeconds : 0,
      gapAvg: mean(gaps),
      gapP95: percentile(sorted, 0.95),
      gapMax: sorted.length ? sorted[sorted.length - 1]! : 0,
      costAvg: mean(costs),
      costMax: costs.length ? Math.max(...costs) : 0,
      hitches: gaps.filter((g) => g > HITCH).length,
    };
  }
}

/** The panel's lines for a summary and the scene's own numbers (pure, so a test can read them). */
export function perfLines(
  s: PerfSummary,
  extra: {
    mode: string;
    renderScale: number;
    clearWater: boolean;
    clearWaterMeshes: number;
    meshes: number;
    triangles: number;
    boats: number;
    heapMb?: number;
    poor?: boolean;
  },
): string[] {
  const f1 = (v: number) => v.toFixed(1);
  const lines = [
    `${extra.poor ? "! SLOW  " : ""}${Math.round(s.fps)} fps  (display ${Math.round(s.displayFps)})`,
    `gap ${f1(s.gapAvg)} ms  p95 ${f1(s.gapP95)}  max ${f1(s.gapMax)}`,
    `cost ${f1(s.costAvg)} ms  max ${f1(s.costMax)}  hitches ${s.hitches}`,
    `pace ${extra.mode}  scale ${extra.renderScale.toFixed(2)}`,
    `clear water ${extra.clearWater ? `on (${extra.clearWaterMeshes})` : "off"}`,
    `meshes ${extra.meshes}  tris ${Math.round(extra.triangles / 1000)}k  boats ${extra.boats}`,
  ];
  if (extra.heapMb !== undefined)
    lines.push(`heap ${Math.round(extra.heapMb)} MB`);
  return lines;
}
