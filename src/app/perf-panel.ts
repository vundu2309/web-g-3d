import { PerfWindow, isPoor, perfLines } from "../ocean/perf-meter.ts";

/** What the panel reads from the scene each time it refreshes. */
export interface PerfSource {
  mode: () => string;
  stats: () => {
    renderScale: number;
    clearWater: boolean;
    clearWaterMeshes: number;
    meshes: number;
    triangles: number;
  };
  boats: () => number;
  /** The biggest groups of drawn triangles. */
  groups?: () => [string, number][];
}

/**
 * A small panel in a corner of the sea screen with the frame numbers (perf-meter.ts): fps, gaps,
 * the main-thread cost of a frame, the pacing mode, the render scale, whether the see-through
 * water is on, and how much is being drawn. Shown with `?perf` in the address, and toggled with
 * F3 (a keyboard) or by tapping it (a phone: it takes taps only while shown). It refreshes twice
 * a second, so it costs next to nothing, and it never blocks the game's own touches.
 */
export function createPerfPanel(
  parent: HTMLElement,
  source: PerfSource,
  options: {
    visible: boolean;
    signal: AbortSignal;
    /** Called when the player toggles it (F3 or a tap), to remember the choice. */
    onToggle?: (shown: boolean) => void;
  },
) {
  const window_ = new PerfWindow(2000);
  const el = document.createElement("pre");
  el.className = "perf-panel";
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    left: "max(8px, env(safe-area-inset-left))",
    top: "max(8px, env(safe-area-inset-top))",
    zIndex: "60",
    margin: "0",
    padding: "6px 8px",
    font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#e8fff4",
    background: "rgba(8, 24, 40, 0.72)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: "8px",
    pointerEvents: "none",
    whiteSpace: "pre",
    maxWidth: "min(300px, 60vw)",
    overflow: "hidden",
  } satisfies Partial<CSSStyleDeclaration>);
  parent.append(el);
  let shown = options.visible;
  let lastDraw = 0;
  const show = (on: boolean, notify = false) => {
    shown = on;
    if (notify) options.onToggle?.(on);
    el.style.display = on ? "block" : "none";
    // Taps toggle it only while shown (a hidden panel must not catch touches).
    el.style.pointerEvents = on ? "auto" : "none";
  };
  show(shown);
  el.addEventListener("click", () => show(false, true), {
    signal: options.signal,
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "F3") {
        event.preventDefault();
        show(!shown, true);
      }
    },
    { signal: options.signal },
  );
  const heap = () => {
    const memory = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;
    return memory ? memory.usedJSHeapSize / 1048576 : undefined;
  };
  return {
    shown: () => shown,
    show: (on: boolean) => show(on, true),
    /** Every animation frame (ms timestamp). */
    tick(now: number) {
      window_.tick(now);
    },
    /** Every drawn frame: its time, the gap since the previous one and the work it took (ms). */
    frame(now: number, gap: number, cost: number) {
      window_.frame(now, gap, cost);
      if (!shown || now - lastDraw < 500) return;
      lastDraw = now;
      const stats = source.stats();
      const summary = window_.summary(now);
      const poor = isPoor(summary, window_.frames);
      // Poor performance turns the panel red (and says SLOW, for those who cannot tell the colours apart).
      el.style.background = poor
        ? "rgba(170, 20, 20, 0.88)"
        : "rgba(8, 24, 40, 0.72)";
      el.style.borderColor = poor ? "#ff6b6b" : "rgba(255,255,255,0.18)";
      el.textContent = perfLines(summary, {
        mode: source.mode(),
        ...stats,
        boats: source.boats(),
        heapMb: heap(),
        poor,
        top: source.groups?.(),
      }).join("\n");
    },
    dispose() {
      el.remove();
    },
  };
}
