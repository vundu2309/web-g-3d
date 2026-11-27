/**
 * The picture behind the hub, the sign-in and the loading screen, drawn on a canvas: a
 * sunlit tropical morning sea with soft-shaded perspective waves, billowing horizon clouds,
 * and a stylized 3/4 fishing boat bobbing gently on the water (Style 1: Coastal Frosted
 * Glass). Nothing is an image file. It is deliberately not the 3D map (no islands, no
 * lighthouse): the map shows only once it is loaded. The art is laid out on an 844 x 390
 * board; `artLayout` fits that board to the canvas (pure, tested) and `drawArt` paints one
 * frame for a given time.
 */
export const ART_W = 844;
export const ART_H = 390;
export const HUB_PALETTE = {
  skyTop: "#82c4ff",
  skyMid: "#c8e8ff",
  skyHorizon: "#fff5d6",
  sunCore: "#fff8db",
  clouds: ["#ffffff", "#f1f7fd", "#fff8ec"] as const,
  waves: ["#76ddf4", "#3cbbe8", "#238fd2", "#166cb2"] as const,
  waveCrest: "rgba(255, 255, 255, 0.58)",
  glint: "#ffffff",
} as const;
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

/**
 * Draws a single seamless soft cumulus cloud (no overlapping-oval seams) by tracing a
 * unified path and filling it with a sunlit top-to-warm-shadow vertical gradient.
 */
function drawSoftCloud(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  puffs: readonly (readonly [number, number, number])[],
  topColor: string,
  bottomColor: string,
) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);

  // Measure vertical span for gradient.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, py, r] of puffs) {
    if (py - r < minY) minY = py - r;
    if (py + r > maxY) maxY = py + r;
  }
  const grad = c.createLinearGradient(0, minY, 0, maxY);
  grad.addColorStop(0, topColor);
  grad.addColorStop(0.68, "#f7fbff");
  grad.addColorStop(1, bottomColor);

  // Soft outer atmospheric bloom.
  c.shadowColor = "rgba(255, 250, 236, 0.55)";
  c.shadowBlur = 14 * scale;
  c.fillStyle = grad;
  c.beginPath();
  for (const [px, py, r] of puffs) {
    c.moveTo(px + r, py);
    c.arc(px, py, r, 0, TAU);
  }
  c.fill();
  c.restore();
}

/** Draws a crisp 4-point star sparkle on sunlit water. */
function drawSparkle(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
) {
  if (alpha <= 0.02) return;
  c.save();
  c.translate(x, y);
  c.globalAlpha = alpha;
  // Soft glow halo.
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
  glow.addColorStop(0, "rgba(255, 255, 240, 0.9)");
  glow.addColorStop(0.5, "rgba(255, 248, 210, 0.25)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  c.fillStyle = glow;
  c.beginPath();
  c.arc(0, 0, size * 2.2, 0, TAU);
  c.fill();

  // 4-point star rays.
  c.fillStyle = HUB_PALETTE.glint;
  c.beginPath();
  const inner = size * 0.22;
  c.moveTo(0, -size);
  c.quadraticCurveTo(inner, -inner, size, 0);
  c.quadraticCurveTo(inner, inner, 0, size);
  c.quadraticCurveTo(-inner, inner, -size, 0);
  c.quadraticCurveTo(-inner, -inner, 0, -size);
  c.closePath();
  c.fill();
  c.restore();
}

/**
 * Draws the stylized 3/4 sunlit fishing boat (soft 3D shading, rounded cream gunwale,
 * blue hull, cozy wheelhouse cabin with recessed glass windows, coral roof, yellow flag).
 * Local origin (0, 0) is near the centre-waterline of the hull; boat faces left-forward.
 */
function drawBoat3D(c: CanvasRenderingContext2D, time: number) {
  const flagWave = Math.sin(time * 3.4) * 2.6;

  // 1. Soft water contact shadow & subtle blue reflection under the hull.
  c.save();
  const shadow = c.createRadialGradient(2, 46, 8, 2, 48, 126);
  shadow.addColorStop(0, "rgba(15, 62, 118, 0.44)");
  shadow.addColorStop(0.6, "rgba(18, 86, 152, 0.22)");
  shadow.addColorStop(1, "rgba(18, 86, 152, 0)");
  c.fillStyle = shadow;
  c.beginPath();
  c.ellipse(2, 48, 124, 17, 0, 0, TAU);
  c.fill();
  c.restore();

  // 2. Slim wooden mast & fluttering yellow pennant behind the roof.
  c.save();
  c.strokeStyle = "#d9c2a3";
  c.lineWidth = 4.5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(40, -48);
  c.lineTo(48, -94);
  c.stroke();

  const flagGrad = c.createLinearGradient(46, -92, 78, -80);
  flagGrad.addColorStop(0, "#ffe47a");
  flagGrad.addColorStop(1, "#f6be32");
  c.fillStyle = flagGrad;
  c.beginPath();
  c.moveTo(47, -93);
  c.quadraticCurveTo(63, -90 + flagWave * 0.5, 79, -82 + flagWave);
  c.quadraticCurveTo(62, -77 + flagWave * 0.4, 45, -75);
  c.closePath();
  c.fill();
  c.restore();

  // 3. Small coral stern seat / float tucked behind the cabin (right side).
  c.save();
  const sternGrad = c.createLinearGradient(52, -22, 82, 14);
  sternGrad.addColorStop(0, "#f58a6e");
  sternGrad.addColorStop(1, "#cf533d");
  c.fillStyle = sternGrad;
  c.beginPath();
  c.roundRect(48, -16, 36, 30, 12);
  c.fill();
  c.restore();

  // 4. Cozy 3/4 wheelhouse cabin (left-front wall lit by sun, right side gently shaded).
  // Front-left wall (warmer cream facing the morning sun).
  c.save();
  const frontWall = c.createLinearGradient(-56, -54, 18, 18);
  frontWall.addColorStop(0, "#fff8e4");
  frontWall.addColorStop(1, "#f2e5c7");
  c.fillStyle = frontWall;
  c.beginPath();
  c.moveTo(-54, -52);
  c.lineTo(18, -46);
  c.lineTo(14, 18);
  c.lineTo(-50, 10);
  c.closePath();
  c.fill();

  // Right-side wall (cooler shaded cream for crisp 3D volume).
  const sideWall = c.createLinearGradient(18, -46, 62, 14);
  sideWall.addColorStop(0, "#e5dac0");
  sideWall.addColorStop(1, "#cfc3a8");
  c.fillStyle = sideWall;
  c.beginPath();
  c.moveTo(18, -46);
  c.lineTo(62, -52);
  c.lineTo(58, 10);
  c.lineTo(14, 18);
  c.closePath();
  c.fill();

  // Soft shadow cast by roof eaves onto the top of both cabin walls.
  const eaveShadow = c.createLinearGradient(0, -52, 0, -34);
  eaveShadow.addColorStop(0, "rgba(75, 58, 42, 0.24)");
  eaveShadow.addColorStop(1, "rgba(75, 58, 42, 0)");
  c.fillStyle = eaveShadow;
  c.beginPath();
  c.moveTo(-54, -52);
  c.lineTo(18, -46);
  c.lineTo(62, -52);
  c.lineTo(61, -34);
  c.lineTo(17, -28);
  c.lineTo(-53, -34);
  c.closePath();
  c.fill();

  // Front-left window (rounded cobalt frame + recessed glossy glass).
  c.fillStyle = "#2b6eb8";
  c.beginPath();
  c.moveTo(-43, -39);
  c.lineTo(4, -34);
  c.quadraticCurveTo(9, -33, 8, -28);
  c.lineTo(6, -6);
  c.quadraticCurveTo(5, -1, 0, -2);
  c.lineTo(-42, -7);
  c.quadraticCurveTo(-47, -8, -47, -13);
  c.lineTo(-47, -34);
  c.quadraticCurveTo(-47, -39, -43, -39);
  c.closePath();
  c.fill();

  const glassFront = c.createLinearGradient(-44, -36, 4, -4);
  glassFront.addColorStop(0, "#66829e");
  glassFront.addColorStop(0.55, "#83a2bf");
  glassFront.addColorStop(1, "#9bc0dd");
  c.fillStyle = glassFront;
  c.beginPath();
  c.moveTo(-40, -34);
  c.lineTo(1, -30);
  c.lineTo(-1, -7);
  c.lineTo(-41, -11);
  c.closePath();
  c.fill();

  // Subtle diagonal specular highlight on front glass.
  c.fillStyle = "rgba(255, 255, 255, 0.24)";
  c.beginPath();
  c.moveTo(-36, -33);
  c.lineTo(-22, -31);
  c.lineTo(-32, -10);
  c.lineTo(-39, -11);
  c.closePath();
  c.fill();

  // Side window (right wall).
  c.fillStyle = "#245ea3";
  c.beginPath();
  c.moveTo(26, -33);
  c.lineTo(49, -36);
  c.quadraticCurveTo(53, -36, 53, -31);
  c.lineTo(52, -9);
  c.quadraticCurveTo(52, -4, 47, -4);
  c.lineTo(25, -1);
  c.quadraticCurveTo(21, -1, 21, -6);
  c.lineTo(22, -28);
  c.quadraticCurveTo(22, -33, 26, -33);
  c.closePath();
  c.fill();

  const glassSide = c.createLinearGradient(24, -31, 49, -6);
  glassSide.addColorStop(0, "#506b87");
  glassSide.addColorStop(1, "#7494b3");
  c.fillStyle = glassSide;
  c.beginPath();
  c.moveTo(26, -29);
  c.lineTo(48, -31);
  c.lineTo(47, -8);
  c.lineTo(25, -6);
  c.closePath();
  c.fill();
  c.restore();

  // 5. Chunky beveled coral-red cabin roof (#e97760) with sunlit top plane & shaded lip.
  c.save();
  // Roof top surface (warm sunlit coral-peach).
  const roofTop = c.createLinearGradient(-64, -70, 74, -54);
  roofTop.addColorStop(0, "#ffa086");
  roofTop.addColorStop(0.55, "#ee7c63");
  roofTop.addColorStop(1, "#df6a52");
  c.fillStyle = roofTop;
  c.beginPath();
  c.moveTo(-64, -62);
  c.quadraticCurveTo(-63, -68, -56, -68);
  c.lineTo(66, -72);
  c.quadraticCurveTo(73, -72, 74, -66);
  c.lineTo(74, -58);
  c.lineTo(18, -51);
  c.lineTo(-64, -57);
  c.closePath();
  c.fill();

  // Roof front-left lip (slightly deeper coral).
  c.fillStyle = "#dc654d";
  c.beginPath();
  c.moveTo(-64, -59);
  c.lineTo(18, -53);
  c.lineTo(18, -44);
  c.quadraticCurveTo(18, -42, 14, -42);
  c.lineTo(-60, -49);
  c.quadraticCurveTo(-64, -50, -64, -54);
  c.closePath();
  c.fill();

  // Roof right-side lip (deepest shaded coral).
  c.fillStyle = "#c9533d";
  c.beginPath();
  c.moveTo(18, -53);
  c.lineTo(74, -60);
  c.lineTo(73, -51);
  c.quadraticCurveTo(73, -48, 69, -48);
  c.lineTo(18, -42);
  c.closePath();
  c.fill();
  c.restore();

  // 6. Curved 3/4 hull (sunlit blue bow sweeping to deeper cobalt stern).
  c.save();
  const hullGrad = c.createLinearGradient(-102, -4, 96, 52);
  hullGrad.addColorStop(0, "#4ea0eb");
  hullGrad.addColorStop(0.32, "#2f7dd4");
  hullGrad.addColorStop(0.72, "#1f61b5");
  hullGrad.addColorStop(1, "#164c94");
  c.fillStyle = hullGrad;
  c.beginPath();
  c.moveTo(-104, -10);
  c.quadraticCurveTo(-100, 26, -74, 46);
  c.quadraticCurveTo(10, 56, 84, 40);
  c.quadraticCurveTo(108, 30, 118, 6);
  c.lineTo(24, 14);
  c.lineTo(-104, -10);
  c.closePath();
  c.fill();

  // Subtle sunlit bow highlight on the left curved nose.
  const bowLight = c.createLinearGradient(-102, -4, -56, 36);
  bowLight.addColorStop(0, "rgba(180, 228, 255, 0.42)");
  bowLight.addColorStop(1, "rgba(180, 228, 255, 0)");
  c.fillStyle = bowLight;
  c.beginPath();
  c.moveTo(-102, -8);
  c.quadraticCurveTo(-98, 24, -74, 44);
  c.lineTo(-50, 44);
  c.quadraticCurveTo(-72, 20, -76, -2);
  c.closePath();
  c.fill();

  // 7. Chunky rounded cream gunwale (deck rim) wrapping smoothly from bow to stern.
  // Outer bevel (lower shaded edge of rim).
  c.fillStyle = "#dfd2b4";
  c.beginPath();
  c.moveTo(-109, -15);
  c.quadraticCurveTo(-48, 5, 22, 13);
  c.quadraticCurveTo(78, 17, 123, 2);
  c.quadraticCurveTo(127, 0, 125, 6);
  c.quadraticCurveTo(123, 12, 116, 14);
  c.quadraticCurveTo(74, 27, 20, 22);
  c.quadraticCurveTo(-50, 14, -104, -4);
  c.quadraticCurveTo(-110, -7, -109, -15);
  c.closePath();
  c.fill();

  // Top sunlit surface of gunwale.
  const rimTop = c.createLinearGradient(-108, -18, 120, 8);
  rimTop.addColorStop(0, "#fffdf2");
  rimTop.addColorStop(0.55, "#fff4d9");
  rimTop.addColorStop(1, "#f0e3c4");
  c.fillStyle = rimTop;
  c.beginPath();
  c.moveTo(-109, -16);
  c.quadraticCurveTo(-106, -22, -98, -20);
  c.quadraticCurveTo(-44, -3, 22, 5);
  c.quadraticCurveTo(76, 9, 118, -4);
  c.quadraticCurveTo(125, -6, 125, 1);
  c.quadraticCurveTo(78, 16, 22, 13);
  c.quadraticCurveTo(-48, 5, -109, -16);
  c.closePath();
  c.fill();

  // Soft white bow-stem ridge highlight.
  c.strokeStyle = "rgba(255, 250, 232, 0.85)";
  c.lineWidth = 4.5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-104, -10);
  c.quadraticCurveTo(-98, 22, -78, 43);
  c.stroke();
  c.restore();
}

/** Draws a perspective-foreshortened shimmering ocean with sunlit reflection & wave ribbons. */
function drawSunlitSea(
  c: CanvasRenderingContext2D,
  time: number,
  sunX: number,
  horizonY: number,
) {
  // 1. Base ocean perspective gradient.
  const seaGrad = c.createLinearGradient(0, horizonY, 0, ART_H);
  seaGrad.addColorStop(0, HUB_PALETTE.waves[0]);
  seaGrad.addColorStop(0.28, HUB_PALETTE.waves[1]);
  seaGrad.addColorStop(0.68, HUB_PALETTE.waves[2]);
  seaGrad.addColorStop(1, HUB_PALETTE.waves[3]);
  c.fillStyle = seaGrad;
  c.fillRect(-4, horizonY, ART_W + 8, ART_H - horizonY + 8);

  // 2. Broad sunlit golden-aqua reflection path across the water under the morning sun.
  c.save();
  const sunPath = c.createRadialGradient(
    sunX,
    horizonY + 8,
    12,
    sunX,
    horizonY + 70,
    250,
  );
  sunPath.addColorStop(0, "rgba(255, 252, 224, 0.82)");
  sunPath.addColorStop(0.35, "rgba(255, 248, 210, 0.36)");
  sunPath.addColorStop(0.7, "rgba(175, 240, 255, 0.14)");
  sunPath.addColorStop(1, "rgba(175, 240, 255, 0)");
  c.fillStyle = sunPath;
  c.fillRect(-4, horizonY, ART_W + 8, ART_H - horizonY + 8);
  c.restore();

  // 3. Soft perspective wave bands (shaded troughs + luminous crests).
  const bands: readonly (readonly [
    number,
    number,
    number,
    number,
    number,
    number,
  ])[] = [
    // [y, amp, period, phase, speed, thickness]
    [234, 1.8, 210, 0.2, 12, 5],
    [244, 2.4, 240, 1.5, -14, 7],
    [256, 3.0, 220, 2.8, 16, 9],
    [270, 3.8, 260, 0.7, -18, 12],
    [288, 4.8, 230, 2.1, 20, 16],
    [310, 5.8, 280, 3.4, -22, 20],
    [336, 6.8, 250, 1.0, 24, 24],
    [366, 7.6, 300, 2.6, -20, 28],
  ];

  for (const [i, band] of bands.entries()) {
    const [y, amp, period, phase, speed, thick] = band;
    const shift = time * speed;
    const depth = i / (bands.length - 1);

    // Soft shaded trough ribbon.
    c.save();
    c.beginPath();
    for (let x = -10; x <= ART_W + 10; x += 12) {
      const py = waveY(x, y, amp, period, phase, shift);
      if (x === -10) c.moveTo(x, py);
      else c.lineTo(x, py);
    }
    for (let x = ART_W + 10; x >= -10; x -= 12) {
      const py = waveY(x, y + thick, amp * 0.8, period, phase + 0.6, shift);
      c.lineTo(x, py);
    }
    c.closePath();
    const troughAlpha = 0.08 + depth * 0.14;
    c.fillStyle = `rgba(12, 74, 140, ${troughAlpha.toFixed(3)})`;
    c.fill();

    // Soft sunlit highlight along the wave crest (brighter near sunX).
    const crestGrad = c.createLinearGradient(0, y, ART_W, y);
    crestGrad.addColorStop(0, "rgba(220, 248, 255, 0.14)");
    crestGrad.addColorStop(
      Math.max(0.15, Math.min(0.85, sunX / ART_W)),
      `rgba(255, 253, 235, ${(0.56 - depth * 0.24).toFixed(2)})`,
    );
    crestGrad.addColorStop(1, "rgba(220, 248, 255, 0.14)");
    c.beginPath();
    for (let x = -10; x <= ART_W + 10; x += 12) {
      const py = waveY(x, y, amp, period, phase, shift);
      if (x === -10) c.moveTo(x, py);
      else c.lineTo(x, py);
    }
    c.lineWidth = 1.6 + depth * 2.2;
    c.strokeStyle = crestGrad;
    c.lineCap = "round";
    c.stroke();
    c.restore();
  }

  // 4. Crisp twinkling 4-point sparkles on the sunlit water.
  const sparkles: readonly (readonly [number, number, number, number])[] = [
    [324, 248, 4.5, 0.0],
    [388, 260, 6.2, 1.1],
    [432, 246, 4.2, 2.4],
    [474, 272, 5.5, 0.7],
    [522, 294, 5.8, 1.9],
    [352, 286, 4.8, 3.0],
    [608, 268, 4.0, 2.2],
  ];
  for (const [sx, sy, size, phase] of sparkles) {
    const twinkle = 0.28 + 0.72 * Math.sin(time * 2.2 + phase) ** 2;
    drawSparkle(c, sx + Math.sin(time + phase) * 3, sy, size, twinkle);
  }
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
  const horizonY = 228;
  const sunX = 385;
  const sunY = 216;

  // 1. Bright tropical morning sky.
  const sky = c.createLinearGradient(0, 0, 0, horizonY + 12);
  sky.addColorStop(0, HUB_PALETTE.skyTop);
  sky.addColorStop(0.56, HUB_PALETTE.skyMid);
  sky.addColorStop(1, HUB_PALETTE.skyHorizon);
  c.fillStyle = sky;
  c.fillRect(-4, -4, ART_W + 8, horizonY + 20);

  // 2. Soft radiant morning sun bloom behind the horizon.
  const pulse = Math.sin(time * 1.3);
  const bloom = c.createRadialGradient(
    sunX,
    sunY,
    18,
    sunX,
    sunY,
    240 + 10 * pulse,
  );
  bloom.addColorStop(0, "rgba(255, 250, 220, 0.92)");
  bloom.addColorStop(0.32, "rgba(255, 238, 175, 0.45)");
  bloom.addColorStop(0.68, "rgba(255, 245, 210, 0.14)");
  bloom.addColorStop(1, "rgba(255, 245, 210, 0)");
  c.fillStyle = bloom;
  c.fillRect(-4, -4, ART_W + 8, horizonY + 20);

  // 3. Soft horizon cumulus cloud banks (left & right) + drifting sky puffs.
  const driftA = Math.sin(time * 0.18) * 10;
  const driftB = Math.cos(time * 0.14) * 8;

  // Left horizon cloud bank.
  drawSoftCloud(
    c,
    46 + driftA * 0.5,
    218,
    1.0,
    [
      [-36, 12, 48],
      [20, -4, 60],
      [88, 6, 52],
      [148, 18, 42],
      [196, 26, 34],
    ],
    "#ffffff",
    "#ffefd2",
  );

  // Right horizon cloud bank.
  drawSoftCloud(
    c,
    732 - driftB * 0.5,
    216,
    1.0,
    [
      [-92, 22, 42],
      [-32, 4, 58],
      [34, -14, 68],
      [98, 4, 62],
    ],
    "#ffffff",
    "#e9f3fc",
  );

  // Two gentle floating clouds in the upper sky.
  const span = ART_W + 240;
  const c1 = ((218 + 120 + time * 2.8) % span) - 120;
  const c2 = ((548 + 120 + time * 3.6) % span) - 120;
  drawSoftCloud(
    c,
    c1,
    126,
    0.72,
    [
      [-28, 10, 24],
      [0, -4, 30],
      [30, 8, 22],
    ],
    "#ffffff",
    "#e6f1fb",
  );
  drawSoftCloud(
    c,
    c2,
    84,
    0.86,
    [
      [-34, 12, 26],
      [-2, -6, 34],
      [32, 8, 26],
      [56, 14, 18],
    ],
    "#ffffff",
    "#e4f0fb",
  );

  // 4. Sunlit shimmering ocean.
  drawSunlitSea(c, time, sunX, horizonY);

  // 5. Stylized 3/4 sunlit fishing boat bobbing gently on the waves.
  if (options.boat) {
    const bob = 0.5 - 0.5 * Math.cos((time / 3.4) * TAU);
    c.save();
    c.translate(524, 220 - 5.5 * bob);
    c.rotate((-0.8 + 1.8 * bob) * (Math.PI / 180));
    drawBoat3D(c, time);
    c.restore();
  }
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
    bands.addColorStop(0, HUB_PALETTE.skyTop);
    bands.addColorStop(0.25, HUB_PALETTE.skyTop);
    bands.addColorStop(0.45, HUB_PALETTE.waves[3]);
    bands.addColorStop(1, HUB_PALETTE.waves[3]);
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
