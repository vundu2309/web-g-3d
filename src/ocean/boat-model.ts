import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Procedural fishing boat. The bow points to -Z, like the game's movement model.
 * Everything is drawn from code: no external asset, no licence to track.
 */
export interface BoatPalette {
  hull: number;
  trim: number;
}
export const boatPalettes: BoatPalette[] = [
  { hull: 0x2a6fb8, trim: 0xffd35a },
  { hull: 0xe0654f, trim: 0xfff1c9 },
  { hull: 0x2f9a8a, trim: 0xffd35a },
  { hull: 0x7a5bb5, trim: 0xfff1c9 },
];

const LENGTH = 7.4;
const HALF_BEAM = 1.5;
const DECK_Y = 0.78;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Half beam along the hull, 0 at the stern and 1 at the bow. */
const beam = (u: number) => {
  const t = Math.min(1, Math.max(0, (u - 0.42) / 0.58));
  return HALF_BEAM * (0.84 + 0.16 * smooth(0, 0.4, u)) * (1 - Math.pow(t, 2.2));
};
/** Gunwale height: the bow rises in a sheer curve. */
const top = (u: number) => 1.05 + 0.62 * Math.pow(u, 2.3);
const bottom = (u: number) => -0.66 + 0.4 * Math.pow(u, 3);
const zAt = (u: number) => LENGTH / 2 - u * LENGTH;

function hullGeometry(palette: BoatPalette) {
  const stations = 28;
  const ring = 12;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const hull = new THREE.Color(palette.hull);
  const trim = new THREE.Color(0xc98a4b);
  const boot = new THREE.Color(0xfff3d6);
  const paint = new THREE.Color(0x8c3a35);
  const put = (x: number, y: number, z: number, s: number) => {
    positions.push(x, y, z);
    const c = s > 0.96 ? trim : y < -0.06 ? paint : y < 0.2 ? boot : hull;
    colors.push(c.r, c.g, c.b);
  };
  for (const side of [1, -1])
    for (let i = 0; i <= stations; i++) {
      const u = i / stations;
      const half = beam(u);
      for (let j = 0; j <= ring; j++) {
        const s = j / ring;
        const angle = (s * Math.PI) / 2;
        const x =
          side * half * Math.pow(Math.sin(angle), 0.8) * (1 + 0.12 * s * u);
        const y =
          bottom(u) +
          (top(u) - bottom(u)) * Math.pow(1 - Math.cos(angle), 0.85);
        put(x, y, zAt(u), s);
      }
    }
  const perSide = (stations + 1) * (ring + 1);
  for (let side = 0; side < 2; side++)
    for (let i = 0; i < stations; i++)
      for (let j = 0; j < ring; j++) {
        const a = side * perSide + i * (ring + 1) + j;
        const b = a + 1;
        const c = a + ring + 1;
        const d = c + 1;
        if (side === 0) index.push(a, b, c, b, d, c);
        else index.push(a, c, b, b, c, d);
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFishingBoat(palette: BoatPalette = boatPalettes[0]!) {
  const group = new THREE.Group();
  const standard = (
    color: number,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      flatShading: true,
      ...extra,
    });
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  add(
    hullGeometry(palette),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  // Stern plate closes the hull behind the deck.
  const transom = new THREE.Shape();
  const sternHalf = beam(0);
  for (let j = 0; j <= 12; j++) {
    const angle = ((12 - j) / 12) * (Math.PI / 2);
    const y =
      bottom(0) + (top(0) - bottom(0)) * Math.pow(1 - Math.cos(angle), 0.85);
    const x = sternHalf * Math.pow(Math.sin(angle), 0.8);
    if (j === 0) transom.moveTo(-x, y);
    else transom.lineTo(-x, y);
  }
  for (let j = 0; j <= 12; j++) {
    const angle = (j / 12) * (Math.PI / 2);
    transom.lineTo(
      sternHalf * Math.pow(Math.sin(angle), 0.8),
      bottom(0) + (top(0) - bottom(0)) * Math.pow(1 - Math.cos(angle), 0.85),
    );
  }
  add(
    new THREE.ShapeGeometry(transom),
    standard(palette.hull, { side: THREE.DoubleSide }),
    0,
    0,
    LENGTH / 2,
  );

  // Deck, planked in two tones.
  const deck = new THREE.Shape();
  for (let i = 0; i <= 20; i++) {
    const u = (i / 20) * 0.97;
    const x = beam(u) * 0.86;
    if (i === 0) deck.moveTo(-x, zAt(u));
    else deck.lineTo(-x, zAt(u));
  }
  for (let i = 20; i >= 0; i--) {
    const u = (i / 20) * 0.97;
    deck.lineTo(beam(u) * 0.86, zAt(u));
  }
  const deckMesh = add(
    new THREE.ShapeGeometry(deck),
    standard(0xb98757, { side: THREE.DoubleSide }),
  );
  deckMesh.rotation.x = Math.PI / 2;
  deckMesh.position.y = DECK_Y;
  for (let i = -3; i <= 3; i++) {
    const plank = add(
      new THREE.BoxGeometry(0.05, 0.012, LENGTH * 0.72),
      standard(0x8d6238),
      i * 0.38,
      DECK_Y + 0.008,
      0.2,
    );
    plank.scale.x = 1;
  }

  // Gunwale rail follows the sheer line on both sides and meets at the bow.
  for (const side of [1, -1]) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = (i / 24) * 0.985;
      points.push(
        new THREE.Vector3(side * beam(u) * 1.02, top(u) + 0.02, zAt(u)),
      );
    }
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        48,
        0.075,
        6,
        false,
      ),
      standard(0xc98a4b),
    );
  }

  // Wheelhouse with windows and an overhanging roof.
  const houseZ = LENGTH * 0.22;
  const cabin = add(
    new RoundedBoxGeometry(2, 1.55, 2.0, 3, 0.12),
    standard(0xfff7e0, { flatShading: false }),
    0,
    DECK_Y + 0.78,
    houseZ,
  );
  cabin.castShadow = true;
  add(
    new RoundedBoxGeometry(2.4, 0.16, 2.4, 3, 0.06),
    standard(0xef866a, { flatShading: false }),
    0,
    DECK_Y + 1.62,
    houseZ,
  );
  const glass = standard(0x1d4e73, {
    roughness: 0.15,
    metalness: 0.3,
    flatShading: false,
  });
  add(
    new THREE.BoxGeometry(1.5, 0.5, 0.04),
    glass,
    0,
    DECK_Y + 0.98,
    houseZ - 1.01,
  );
  for (const side of [1, -1])
    add(
      new THREE.BoxGeometry(0.04, 0.5, 1.15),
      glass,
      side * 1.01,
      DECK_Y + 0.98,
      houseZ - 0.1,
    );
  add(
    new THREE.CylinderGeometry(0.1, 0.13, 0.6, 8),
    standard(0xb23a32),
    0.55,
    DECK_Y + 2.1,
    houseZ + 0.55,
  );
  add(
    new THREE.CylinderGeometry(0.015, 0.015, 1.4, 5),
    standard(0x4b4f56),
    -0.6,
    DECK_Y + 2.4,
    houseZ + 0.4,
  );

  // Mast, derrick boom, stays and a flag.
  const mastZ = -LENGTH * 0.12;
  add(
    new THREE.CylinderGeometry(0.07, 0.1, 3.3, 8),
    standard(0x9b6b3f),
    0,
    DECK_Y + 1.65,
    mastZ,
  );
  const boom = add(
    new THREE.CylinderGeometry(0.05, 0.07, 1.9, 6),
    standard(0x9b6b3f),
    0.85,
    DECK_Y + 2.3,
    mastZ - 0.55,
  );
  boom.rotation.set(Math.PI / 2.6, 0, -Math.PI / 4);
  const flag = add(
    new THREE.PlaneGeometry(0.55, 0.3),
    standard(palette.trim, { side: THREE.DoubleSide }),
    0.3,
    DECK_Y + 3.05,
    mastZ,
  );
  flag.rotation.y = 0.25;
  const lamp = add(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfff1b0,
      emissive: 0xffd36a,
      emissiveIntensity: 1.4,
    }),
    0,
    DECK_Y + 3.38,
    mastZ,
  );
  lamp.name = "lamp";

  // Catch crates, a net heap, a life ring and rod holders.
  for (const [x, y, z] of [
    [-0.85, 0, LENGTH * 0.42],
    [0.85, 0, LENGTH * 0.42],
    [-0.85, 0.36, LENGTH * 0.42],
  ] as const) {
    add(
      new THREE.BoxGeometry(0.72, 0.34, 0.55),
      standard(0xffb93d),
      x,
      DECK_Y + 0.18 + y,
      z,
    );
    add(
      new THREE.BoxGeometry(0.74, 0.05, 0.57),
      standard(0xc77f1b),
      x,
      DECK_Y + 0.36 + y,
      z,
    );
  }
  const net = add(
    new THREE.SphereGeometry(0.5, 7, 5),
    standard(0x7ea0b8),
    -0.7,
    DECK_Y + 0.2,
    -LENGTH * 0.05,
  );
  net.scale.set(1.2, 0.55, 1);
  const ring = add(
    new THREE.TorusGeometry(0.3, 0.075, 8, 18),
    standard(0xe5534b),
    1.015,
    DECK_Y + 1.05,
    houseZ + 0.6,
  );
  ring.rotation.y = Math.PI / 2;
  const rod = add(
    new THREE.CylinderGeometry(0.03, 0.05, 3.1, 6),
    standard(0x3a3f46),
    1.9,
    DECK_Y + 1.45,
    LENGTH * 0.34,
  );
  rod.rotation.z = -0.95;
  const line = add(
    new THREE.CylinderGeometry(0.012, 0.012, 2.6, 4),
    standard(0xffffff),
    3.15,
    DECK_Y - 0.4,
    LENGTH * 0.34,
  );
  line.name = "fishing-line";
  line.visible = false;

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = false;
  });
  return group;
}

/** Soft white foam under the stern and along the bow, drawn flat on the water. */
export function createWake() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const fade = context.createRadialGradient(
    size / 2,
    size / 2,
    4,
    size / 2,
    size / 2,
    size / 2,
  );
  fade.addColorStop(0, "rgba(255,255,255,0.85)");
  fade.addColorStop(0.55, "rgba(255,255,255,0.35)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = fade;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const group = new THREE.Group();
  const stern = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), material);
  stern.rotation.x = -Math.PI / 2;
  stern.position.set(0, 0.04, LENGTH / 2 + 1.9);
  group.add(stern);
  for (const side of [1, -1]) {
    const bow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.2), material);
    bow.rotation.x = -Math.PI / 2;
    bow.rotation.z = side * 0.32;
    bow.position.set(side * 1.2, 0.045, -LENGTH * 0.18);
    group.add(bow);
  }
  return group;
}
