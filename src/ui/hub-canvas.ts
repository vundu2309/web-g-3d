/**
 * The picture behind the hub, the sign-in and the loading screen, drawn on a canvas: a
 * sunset over layered waves with the game's fishing boat bobbing on them. Nothing is an
 * image file. It is deliberately not the 3D map (no islands, no lighthouse): the map shows
 * only once it is loaded. The art is laid out on an 844 x 390 board; `artLayout` fits that
 * board to the canvas (pure, tested) and `drawHub` paints one frame for a given time.
 */
export const ART_W = 844;
export const ART_H = 390;
const INK = "#153b80";
const TAU = Math.PI * 2;

export interface ArtLayout {
  /** Canvas pixels per art unit. */
  scale: number;
  /** Where the art's top-left corner falls on the canvas (px). */
  x: number;
  y: number;
}

/**
 * Landscape: the art covers the canvas, anchored at the bottom. Portrait: the art is shown
 * wide enough for the whole boat and sun (about 2.1 times the canvas width, centred a little
 * left of the middle) and sits 18 % from the top, with the sky's top colour above it and
 * the deep sea's colour below.
 */
export function artLayout(width: number, height: number): ArtLayout {
  if (width < height) {
    const scale = (width * 2.11) / ART_W;
    return {
      scale,
      x: width * 0.5 - ART_W * scale * 0.557,
      y: height * 0.18,
    };
  }
  const scale = Math.max(width / ART_W, height / ART_H);
  return {
    scale,
    x: (width - ART_W * scale) / 2,
    y: height - ART_H * scale,
  };
}

/** A wave line: y(x) for a wave of the given centre, height and period at time t. */
export function waveY(
  x: number,
  y: number,
  amp: number,
  period: number,
  phase: number,
  shift: number,
) {
  const a = ((x - shift) / period) * TAU + phase;
  return y + amp * Math.sin(a) + amp * 0.35 * Math.sin(a * 2 + 1);
}

const BOAT_PATHS = {
  boom: "M122 12l46-10",
  line: "M168 2v26",
  mast: "M84 -10V30",
  flag: "M84 -10l24 6-24 6Z",
  hull: "M2 42h150l-24 36H28Z",
  stripe: "M2 42h150",
  roof: "M52 12h64l-4-12H56Z",
};

const stroke = (
  c: CanvasRenderingContext2D,
  path: Path2D,
  fill: string | undefined,
  width: number,
  color = INK,
) => {
  if (fill) {
    c.fillStyle = fill;
    c.fill(path);
  }
  c.lineWidth = width;
  c.strokeStyle = color;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke(path);
};

const box = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  width: number,
) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = width;
  c.strokeStyle = INK;
  c.lineJoin = "round";
  c.stroke();
};

function drawBoat(c: CanvasRenderingContext2D) {
  const P = (d: string) => new Path2D(d);
  stroke(c, P(BOAT_PATHS.boom), undefined, 5);
  stroke(c, P(BOAT_PATHS.line), undefined, 2.5, "#fff");
  stroke(c, P(BOAT_PATHS.mast), undefined, 5);
  stroke(c, P(BOAT_PATHS.flag), "#ffd35a", 3.5);
  stroke(c, P(BOAT_PATHS.hull), "#2a73b8", 6);
  stroke(c, P(BOAT_PATHS.stripe), undefined, 9, "#fff6e0");
  box(c, 108, 22, 30, 18, 3, "#d9a066", 4);
  box(c, 58, 12, 52, 30, 4, "#cfd8dc", 5);
  box(c, 66, 20, 36, 12, 3, "#8fd0f2", 3);
  stroke(c, P(BOAT_PATHS.roof), "#e97760", 5);
}

function cloud(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  fill: string,
) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.fillStyle = fill;
  for (const [cx, cy, rx, ry] of [
    [46, 38, 42, 16],
    [86, 26, 34, 20],
    [112, 40, 34, 14],
  ] as const) {
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    c.fill();
  }
  c.restore();
}

function wave(
  c: CanvasRenderingContext2D,
  y: number,
  amp: number,
  period: number,
  phase: number,
  fill: string,
  shift: number,
) {
  c.beginPath();
  c.moveTo(-10, ART_H + 10);
  for (let x = -10; x <= ART_W + 10; x += 6)
    c.lineTo(x, waveY(x, y, amp, period, phase, shift));
  c.lineTo(ART_W + 10, ART_H + 10);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.lineJoin = "round";
  c.stroke();
}

export interface HubOptions {
  /** Draw the fishing boat on the water (the hub), or not (the loading screen). */
  boat?: boolean;
}

/** One frame of the art on the 844 x 390 board (the caller has set the transform). */
export function drawArt(
  c: CanvasRenderingContext2D,
  time: number,
  options: HubOptions = {},
) {
  // Sky.
  const sky = c.createLinearGradient(0, 0, 0, ART_H);
  sky.addColorStop(0, "#4b3a8f");
  sky.addColorStop(0.45, "#e0597a");
  sky.addColorStop(0.78, "#ffb35a");
  sky.addColorStop(1, "#ffe29a");
  c.fillStyle = sky;
  c.fillRect(-2, -2, ART_W + 4, ART_H + 4);
  // A few stars in the violet at the top, twinkling.
  c.fillStyle = "#fff";
  for (let i = 0; i < 16; i++) {
    const x = (i * 211 + 37) % ART_W;
    const y = 6 + ((i * 97) % 90);
    c.globalAlpha =
      (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(time * 1.6 + i * 1.7))) *
      (1 - y / 120);
    c.fillRect(x, y, 2, 2);
  }
  c.globalAlpha = 1;
  // The sun and its breathing glow.
  const glow = 0.24 + 0.06 * Math.sin(time * 1.57);
  c.globalAlpha = glow;
  c.fillStyle = "#ffd35a";
  c.beginPath();
  c.arc(560, 226, 108 + 4 * Math.sin(time * 1.57), 0, TAU);
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  c.arc(560, 226, 74, 0, TAU);
  c.fillStyle = "#ffd35a";
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = INK;
  c.stroke();
  // Clouds drifting slowly to the right, wrapping around.
  for (const [x, y, s, fill, speed] of [
    [60, 86, 0.8, "#ffb3b8", 4],
    [300, 150, 0.6, "#ffc9a8", 3],
    [640, 70, 0.7, "#ff9aa8", 5],
  ] as const) {
    const span = ART_W + 260;
    const at = ((x + 130 + time * speed) % span) - 130;
    cloud(c, at, y, s, fill);
  }
  // Two gulls, wings beating, gliding to and fro.
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  const glide = 26 * (0.5 - 0.5 * Math.cos(time * 0.7));
  for (const [x, y, size, beat] of [
    [250, 92, 16, 0],
    [290, 114, 12, 1.4],
  ] as const) {
    const flap = 6 * Math.sin(time * 5 + beat);
    const bx = x + glide;
    const by = y - glide * 0.3;
    c.moveTo(bx, by);
    c.quadraticCurveTo(bx + size / 4, by - 10 + flap, bx + size / 2, by);
    c.quadraticCurveTo(bx + (size * 3) / 4, by - 10 + flap, bx + size, by);
  }
  c.stroke();
  // Waves: each drifts sideways at its own speed.
  wave(c, 232, 5, 260, 0, "#ff8a6a", time * 18);
  // The sun's reflection glints on the farthest sea.
  c.fillStyle = "#fff3c4";
  for (let i = 0; i < 7; i++) {
    const w = 18 + ((i * 13) % 26);
    const x = 560 - 60 + ((i * 41) % 120) + 5 * Math.sin(time * 1.3 + i);
    c.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2.1 + i * 1.3) ** 2;
    c.fillRect(x - w / 2, 240 + i * 4, w, 2);
  }
  c.globalAlpha = 1;
  wave(c, 262, 8, 200, 1.1, "#7a3f9a", -time * 24);
  if (options.boat) {
    // The boat rises and falls and rolls a little on the swell.
    const bob = 0.5 - 0.5 * Math.cos((time / 3.2) * TAU);
    c.save();
    c.translate(305, 142 - 7 * bob);
    c.scale(1.25, 1.25);
    c.translate(77, 62);
    c.rotate((-1 + 3 * bob) * (Math.PI / 180));
    c.translate(-77, -62);
    drawBoat(c);
    c.restore();
  }
  wave(c, 300, 9, 170, 2.3, "#3a2f7a", time * 28);
  wave(c, 342, 8, 210, 3.5, "#1d2a66", -time * 20);
}

/** Paints the whole canvas: the bands of portrait, then the art laid out for its size. */
export function paintHub(
  c: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  options: HubOptions = {},
) {
  const layout = artLayout(width, height);
  if (width < height) {
    const bands = c.createLinearGradient(0, 0, 0, height);
    bands.addColorStop(0, "#4b3a8f");
    bands.addColorStop(0.25, "#4b3a8f");
    bands.addColorStop(0.45, "#1d2a66");
    bands.addColorStop(1, "#1d2a66");
    c.fillStyle = bands;
    c.fillRect(0, 0, width, height);
  }
  c.save();
  c.translate(layout.x, layout.y);
  c.scale(layout.scale, layout.scale);
  c.beginPath();
  // A little past the board on every side, so no seam shows against the bands.
  c.rect(-3, -3, ART_W + 6, ART_H + 6);
  c.clip();
  drawArt(c, time, options);
  c.restore();
}

const FRAME = 1000 / 30;

/**
 * Fills `canvas` with the art and animates it (about 30 frames a second, paused while the
 * page is hidden, a single still frame when the player prefers reduced motion). Returns
 * the function that stops it.
 */
export function mountHubArt(
  canvas: HTMLCanvasElement,
  options: HubOptions = {},
): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let width = 0;
  let height = 0;
  let frame = 0;
  let last = 0;
  let stopped = false;
  const started = performance.now();
  const fit = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    width = w;
    height = h;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const draw = (now: number) => {
    paintHub(
      context,
      width,
      height,
      reduced ? 0 : (now - started) / 1000,
      options,
    );
  };
  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (document.hidden || now - last < FRAME) return;
    last = now;
    draw(now);
  };
  fit();
  draw(started);
  const observer = new ResizeObserver(() => {
    fit();
    draw(performance.now());
  });
  observer.observe(canvas);
  if (!reduced) frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

/** The same picture as a still CSS background (for a dialog that rebuilds its content). */
export function hubArtUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = ART_W * 2;
  canvas.height = ART_H * 2;
  const c = canvas.getContext("2d");
  if (!c) return "none";
  c.scale(2, 2);
  drawArt(c, 0);
  return `url("${canvas.toDataURL("image/jpeg", 0.88)}")`;
}
