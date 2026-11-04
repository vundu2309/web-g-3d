import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  BOARD_SPACES,
  GROUP_COLORS,
  SPACE_COUNT,
} from "../src/board/spaces.ts";
import {
  BOARD_SIZE,
  GRID,
  HOUSE_FOOTPRINT,
  HOTEL_LENGTH,
  LABEL_UP_SIGN,
  LABEL_INWARD,
  PLATE_SIZE,
  RING_DEPTH,
  SPACE_LENGTH,
  SPACES_PER_SIDE,
  STRIPE_DEPTH,
  TEXT_BAND_HALF_DEPTH,
  TOKEN_OUTWARD,
  TOKEN_RADIUS,
  buildingSlots,
  cellOf,
  isCorner,
  labelCentre,
  labelRotation,
  outwardOf,
  rectCenter,
  spaceRect,
  stripeRect,
  tokenAnchor,
  worldToPixel,
} from "../src/board/layout.ts";
import {
  CAMERA_FOV_DEG,
  focusPose,
  orbitBounds,
  overviewDistance,
  overviewPose,
} from "../src/board/camera-math.ts";

const EPS = 1e-9;
const near = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} != ${b}`);

// Names and order from docs/game/rules/board-and-properties.md (US-BOARD-001, Hasbro G0009 baseline).
const DOC_NAMES = [
  "GO",
  "Mediterranean Avenue",
  "Community Chest",
  "Baltic Avenue",
  "Income Tax",
  "Reading Railroad",
  "Rhode Island Avenue",
  "Chance",
  "Vermont Avenue",
  "Connecticut Avenue",
  "Jail / Just Visiting",
  "St. Charles Place",
  "Electric Company",
  "States Avenue",
  "Virginia Avenue",
  "Pennsylvania Railroad",
  "St. James Place",
  "Community Chest",
  "Tennessee Avenue",
  "New York Avenue",
  "Free Parking",
  "Kentucky Avenue",
  "Chance",
  "Indiana Avenue",
  "Illinois Avenue",
  "B. & O. Railroad",
  "Atlantic Avenue",
  "Ventnor Avenue",
  "Water Works",
  "Marvin Gardens",
  "Go To Jail",
  "Pacific Avenue",
  "North Carolina Avenue",
  "Community Chest",
  "Pennsylvania Avenue",
  "Short Line",
  "Chance",
  "Park Place",
  "Luxury Tax",
  "Boardwalk",
];

test("40 canonical spaces match the documented order, names and kinds", () => {
  assert.equal(SPACE_COUNT, 40);
  assert.deepEqual(
    BOARD_SPACES.map((s) => s.name),
    DOC_NAMES,
  );
  BOARD_SPACES.forEach((s, i) => assert.equal(s.index, i));
  const counts = {};
  for (const s of BOARD_SPACES) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  assert.deepEqual(counts, {
    corner: 4,
    property: 22,
    railroad: 4,
    utility: 2,
    card: 6,
    tax: 2,
  });
  for (const i of [0, 10, 20, 30]) assert.equal(BOARD_SPACES[i].kind, "corner");
});

test("colour groups have the documented sizes and every stripe colour is defined", () => {
  const groups = {};
  for (const s of BOARD_SPACES)
    if (s.group) groups[s.group] = (groups[s.group] ?? 0) + 1;
  assert.deepEqual(groups, {
    brown: 2,
    lightblue: 3,
    pink: 3,
    orange: 3,
    red: 3,
    yellow: 3,
    green: 3,
    darkblue: 2,
  });
  for (const group of Object.keys(groups))
    assert.match(GROUP_COLORS[group], /^#[0-9a-f]{6}$/);
});

test("one shared grid: deep ring, square corners equal to the ring depth, nine equal frontages per side", () => {
  assert.equal(GRID.length, 12);
  near(GRID[0], -BOARD_SIZE / 2, "outer edge");
  near(GRID[11], BOARD_SIZE / 2, "outer edge");
  near(GRID[1] - GRID[0], RING_DEPTH, "corner side equals ring depth");
  near(GRID[11] - GRID[10], RING_DEPTH, "corner side equals ring depth");
  for (let k = 2; k <= 10; k++)
    near(GRID[k] - GRID[k - 1], SPACE_LENGTH, `frontage ${k}`);
  assert.equal(SPACES_PER_SIDE, 9);
  for (let k = 0; k < 12; k++) near(GRID[k], -GRID[11 - k], `symmetry ${k}`);
  // Approved design: deep spaces, roughly twice as deep as the frontage.
  assert.ok(
    RING_DEPTH >= 2.1 && RING_DEPTH <= 2.4,
    `ring depth ${RING_DEPTH} in approved 2.1–2.4 range`,
  );
  assert.ok(PLATE_SIZE > BOARD_SIZE, "plate rim surrounds the board");
});

test("every index maps to a unique ring cell and the 40 cells cover the perimeter exactly once", () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const { col, row } = cellOf(i);
    assert.ok(
      col === 0 || col === 10 || row === 0 || row === 10,
      `index ${i} is on the ring`,
    );
    const key = `${col},${row}`;
    assert.ok(!seen.has(key), `cell ${key} repeated`);
    seen.add(key);
  }
  assert.equal(seen.size, 40);
  assert.equal(
    [...Array(40).keys()].filter((i) => isCorner(cellOf(i))).length,
    4,
  );
});

test("every space edge uses exact grid seams", () => {
  for (let i = 0; i < 40; i++) {
    const r = spaceRect(i);
    for (const v of [r.x0, r.x1])
      assert.ok(GRID.includes(v), `space ${i} x on grid`);
    for (const v of [r.z0, r.z1])
      assert.ok(GRID.includes(v), `space ${i} z on grid`);
  }
});

test("consecutive spaces share a full seam, including GO, jail, free parking and go-to-jail", () => {
  for (let i = 0; i < 40; i++) {
    const a = spaceRect(i);
    const b = spaceRect((i + 1) % 40);
    const xTouch = a.x1 === b.x0 || b.x1 === a.x0;
    const zTouch = a.z1 === b.z0 || b.z1 === a.z0;
    const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(
      (xTouch && zOverlap > EPS) || (zTouch && xOverlap > EPS),
      `spaces ${i} and ${(i + 1) % 40} share a seam`,
    );
  }
});

test("corners are equal squares; edge spaces are equal frontage × depth rectangles", () => {
  for (const i of [0, 10, 20, 30]) {
    const r = spaceRect(i);
    near(r.x1 - r.x0, RING_DEPTH, `corner ${i} width`);
    near(r.z1 - r.z0, RING_DEPTH, `corner ${i} depth`);
  }
  for (let i = 0; i < 40; i++) {
    if (isCorner(cellOf(i))) continue;
    const r = spaceRect(i);
    const out = outwardOf(i);
    // Frontage runs along the side (perpendicular to outward); depth runs outward.
    const frontage = out.x !== 0 ? r.z1 - r.z0 : r.x1 - r.x0;
    const depth = out.x !== 0 ? r.x1 - r.x0 : r.z1 - r.z0;
    near(frontage, SPACE_LENGTH, `space ${i} frontage`);
    near(depth, RING_DEPTH, `space ${i} depth`);
  }
});

test("GO sits bottom-right and movement runs left along the bottom edge, then up, right and down", () => {
  const c = (i) => rectCenter(spaceRect(i));
  assert.ok(c(0).x > 0 && c(0).z > 0, "GO bottom-right");
  assert.ok(c(10).x < 0 && c(10).z > 0, "Jail bottom-left");
  assert.ok(c(20).x < 0 && c(20).z < 0, "Free Parking top-left");
  assert.ok(c(30).x > 0 && c(30).z < 0, "Go To Jail top-right");
  assert.ok(c(1).x < c(0).x, "index 1 is left of GO");
  assert.ok(c(11).z < c(10).z, "index 11 is above Jail");
  assert.ok(c(21).x > c(20).x, "index 21 is right of Free Parking");
  assert.ok(c(31).z > c(30).z, "index 31 is below Go To Jail");
});

test("label orientation: letter tops point toward the board centre on every edge", () => {
  assert.equal(LABEL_UP_SIGN, -1, "labels are inward-facing");
  // Canvas convention: screen-up (0,-1); rotation θ maps it to (sin θ, -cos θ).
  near(labelRotation(5), 0, "bottom row upright");
  near(Math.abs(labelRotation(25)), Math.PI, "top row upside down");
  near(labelRotation(15), Math.PI / 2, "left row turned clockwise 90°");
  near(
    labelRotation(35),
    -Math.PI / 2,
    "right row turned counter-clockwise 90°",
  );
  for (let i = 0; i < 40; i++) {
    if (isCorner(cellOf(i))) continue;
    const out = outwardOf(i);
    const theta = labelRotation(i);
    // Label-up must point toward the centre: opposite of the outward unit vector.
    near(Math.sin(theta), -out.x, `label ${i} up x`);
    near(-Math.cos(theta), -out.z, `label ${i} up z`);
  }
});

test("label blocks stay inside the white band and clear the coloured stripe and token zone", () => {
  for (let i = 0; i < 40; i++) {
    if (isCorner(cellOf(i))) continue;
    const out = outwardOf(i);
    const c = rectCenter(spaceRect(i));
    const l = labelCentre(i);
    // Signed distance along the outward axis, measured from the space centre (outward positive).
    const s = (p) => (p.x - c.x) * out.x + (p.z - c.z) * out.z;
    const textOuter = s(l) + TEXT_BAND_HALF_DEPTH;
    const textInner = s(l) - TEXT_BAND_HALF_DEPTH;
    const stripeInnerEdge = -RING_DEPTH / 2 + STRIPE_DEPTH;
    const tokenInner = TOKEN_OUTWARD - TOKEN_RADIUS;
    assert.ok(textInner > stripeInnerEdge, `text clears stripe on ${i}`);
    assert.ok(textOuter < tokenInner, `text clears token zone on ${i}`);
  }
});

test("colour stripes sit on the inner side of every edge space; corners have none", () => {
  for (const space of BOARD_SPACES) {
    const stripe = stripeRect(space.index);
    if (space.kind === "corner") {
      assert.equal(stripe, null, `${space.name} has no stripe`);
      continue;
    }
    assert.ok(stripe, `${space.name} has an inner band`);
    const r = spaceRect(space.index);
    const out = outwardOf(space.index);
    assert.ok(
      stripe.x0 >= r.x0 - EPS && stripe.x1 <= r.x1 + EPS,
      `${space.name} stripe within x`,
    );
    assert.ok(
      stripe.z0 >= r.z0 - EPS && stripe.z1 <= r.z1 + EPS,
      `${space.name} stripe within z`,
    );
    const c = rectCenter(r);
    const sc = rectCenter(stripe);
    assert.ok(
      (sc.x - c.x) * -out.x + (sc.z - c.z) * -out.z > 0,
      `${space.name} stripe toward centre`,
    );
    const thickness =
      out.x !== 0 ? stripe.x1 - stripe.x0 : stripe.z1 - stripe.z0;
    near(thickness, STRIPE_DEPTH, `${space.name} stripe depth`);
  }
});

test("houses fit fully inside the stripe without overlap; a hotel spans the stripe centre", () => {
  assert.ok(
    HOUSE_FOOTPRINT <= STRIPE_DEPTH,
    "house footprint fits stripe depth",
  );
  for (let count = 1; count <= 4; count++) {
    const slots = buildingSlots(24, count);
    assert.equal(slots.length, count);
    const stripe = stripeRect(24);
    for (const s of slots) {
      // Whole footprint inside the stripe (half-footprint margin on each side).
      assert.ok(
        s.x - HOUSE_FOOTPRINT / 2 >= stripe.x0 - EPS &&
          s.x + HOUSE_FOOTPRINT / 2 <= stripe.x1 + EPS,
        "house x inside stripe",
      );
      assert.ok(
        s.z - HOUSE_FOOTPRINT / 2 >= stripe.z0 - EPS &&
          s.z + HOUSE_FOOTPRINT / 2 <= stripe.z1 + EPS,
        "house z inside stripe",
      );
    }
    for (let k = 1; k < slots.length; k++) {
      const d = Math.hypot(
        slots[k].x - slots[k - 1].x,
        slots[k].z - slots[k - 1].z,
      );
      assert.ok(
        d >= HOUSE_FOOTPRINT + 0.02,
        `houses ${k - 1}/${k} do not overlap`,
      );
    }
    // Four houses stay within the frontage.
    if (count === 4) {
      const span =
        Math.hypot(slots[3].x - slots[0].x, slots[3].z - slots[0].z) +
        HOUSE_FOOTPRINT;
      assert.ok(
        span <= SPACE_LENGTH,
        `four houses fit the frontage (${span.toFixed(2)})`,
      );
    }
  }
  const hotel = buildingSlots(24, 5);
  assert.equal(hotel.length, 1);
  assert.ok(HOTEL_LENGTH <= SPACE_LENGTH, "hotel fits the frontage");
  const c = rectCenter(stripeRect(24));
  near(hotel[0].x, c.x, "hotel x");
  near(hotel[0].z, c.z, "hotel z");
  assert.deepEqual(buildingSlots(0, 0), []);
});

test("tokens stand in the outer zone, inside the plate and outside the text band", () => {
  for (let i = 0; i < 40; i++) {
    const anchor = tokenAnchor(i);
    assert.ok(
      Math.abs(anchor.x) < BOARD_SIZE / 2 &&
        Math.abs(anchor.z) < BOARD_SIZE / 2,
      `token ${i} on board`,
    );
    if (isCorner(cellOf(i))) continue;
    const c = rectCenter(spaceRect(i));
    const out = outwardOf(i);
    const outward = (anchor.x - c.x) * out.x + (anchor.z - c.z) * out.z;
    assert.ok(
      outward - TOKEN_RADIUS > 0,
      `token ${i} sits outward of the centre`,
    );
    assert.ok(
      outward + TOKEN_RADIUS <= RING_DEPTH / 2,
      `token ${i} stays on its space`,
    );
  }
});

test("world-to-pixel maps plate corners to texture corners with +z down the canvas", () => {
  const size = 3072;
  const tl = worldToPixel({ x: -PLATE_SIZE / 2, z: -PLATE_SIZE / 2 }, size);
  const br = worldToPixel({ x: PLATE_SIZE / 2, z: PLATE_SIZE / 2 }, size);
  near(tl.px, 0, "top-left px");
  near(tl.py, 0, "top-left py");
  near(br.px, size, "bottom-right px");
  near(br.py, size, "bottom-right py");
  const go = worldToPixel(rectCenter(spaceRect(0)), size);
  assert.ok(go.px > size / 2 && go.py > size / 2, "GO appears bottom-right");
});

/** Projects the plate and slab corners through a real perspective camera, as the renderer does. */
function projectedCorners(pose, aspect) {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, aspect, 0.1, 200);
  camera.position.set(pose.x, pose.y, pose.z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const h = PLATE_SIZE / 2;
  const points = [];
  for (const x of [-h, h])
    for (const z of [-h, h])
      for (const y of [0, -0.3]) {
        points.push(new THREE.Vector3(x, y, z).project(camera));
      }
  return points;
}

test("overview projects the whole board inside the viewport for landscape and portrait aspects", () => {
  for (const [width, height] of [
    [844, 278],
    [932, 342],
    [667, 287],
    [390, 300],
    [390, 844],
  ]) {
    const aspect = width / height;
    const pose = overviewPose(aspect);
    const ndc = projectedCorners(pose, aspect);
    const maxX = Math.max(...ndc.map((p) => Math.abs(p.x)));
    const maxY = Math.max(...ndc.map((p) => Math.abs(p.y)));
    assert.ok(
      maxX <= 1 && maxY <= 1,
      `board fits viewport ${width}x${height}: ndc ${maxX.toFixed(3)}, ${maxY.toFixed(3)}`,
    );
    assert.ok(
      Math.max(maxX, maxY) >= 0.85,
      `board uses the viewport ${width}x${height}`,
    );
    const bounds = orbitBounds(aspect);
    assert.ok(
      bounds.min < overviewDistance(aspect) &&
        overviewDistance(aspect) < bounds.max,
      "overview inside orbit bounds",
    );
  }
});

test("focus faces the token's side of the board so that edge reads upright from outside", () => {
  const aspect = 844 / 390;
  // Token on the bottom edge (+z): the camera stays on the +z side, outside the edge.
  const bottom = focusPose({ x: 0, y: 0, z: 5.5 }, { x: 0, z: 5.5 }, aspect);
  assert.ok(
    bottom.z > 5.5 && Math.abs(bottom.x) < 1e-9,
    "camera outside bottom edge",
  );
  // Token on the left edge (-x): the camera moves to the -x side.
  const left = focusPose({ x: -5.5, y: 0, z: 0 }, { x: -5.5, z: 0 }, aspect);
  assert.ok(
    left.x < -5.5 && Math.abs(left.z) < 1e-9,
    "camera outside left edge",
  );
  // Corner tokens use the diagonal.
  const corner = focusPose(
    { x: 5.5, y: 0, z: 5.5 },
    { x: 5.5, z: 5.5 },
    aspect,
  );
  assert.ok(corner.x > 5.5 && corner.z > 5.5, "camera diagonal at GO corner");
  // Visible width at focus distance covers a token plus two neighbours each side.
  const tan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const dist = Math.hypot(bottom.y, bottom.z - 5.5);
  assert.ok(
    2 * dist * tan * aspect >= 6,
    "two neighbours visible in landscape",
  );
  const portrait = focusPose(
    { x: 0, y: 0, z: 5.5 },
    { x: 0, z: 5.5 },
    390 / 844,
  );
  assert.ok(portrait.y > bottom.y, "portrait pulls back");
});
