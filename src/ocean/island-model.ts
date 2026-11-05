import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Procedural island: low-poly terrain, palms, rocks and an optional lighthouse. */
export interface IslandOptions {
  seed: number;
  radius: number;
  lighthouse?: boolean;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number, seed: number) {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x: number, y: number, seed: number) =>
  noise(x, y, seed) * 0.6 +
  noise(x * 2.1, y * 2.1, seed + 7) * 0.28 +
  noise(x * 4.3, y * 4.3, seed + 13) * 0.12;

export function createIsland({
  seed,
  radius,
  lighthouse = false,
}: IslandOptions) {
  const group = new THREE.Group();
  const rng = random(seed);
  const peak = radius * (0.38 + rng() * 0.18);
  const height = (x: number, z: number) => {
    const angle = Math.atan2(z, x);
    const wobble =
      1 +
      0.2 *
        (noise(Math.cos(angle) * 2 + 5, Math.sin(angle) * 2 + 5, seed) - 0.5);
    const r = Math.hypot(x, z) / (radius * 1.12 * wobble);
    const hill =
      Math.pow(Math.max(0, 1 - r * r), 1.35) *
      peak *
      (0.75 + 0.5 * fbm(x * 0.06, z * 0.06, seed));
    const shelf = -1.6 * smooth(0.82, 1.28, r);
    return (
      hill * smooth(0, 0.22, 1 - r + 0.18) +
      shelf +
      (r < 1 ? 0.55 : 0) * (1 - smooth(0.7, 1, r))
    );
  };
  function smooth(a: number, b: number, x: number) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  const extent = radius * 1.5;
  const segments = 44;
  const geometry = new THREE.PlaneGeometry(
    extent * 2,
    extent * 2,
    segments,
    segments,
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const wet = new THREE.Color(0xc9b27b);
  const sand = new THREE.Color(0xf2dca2);
  const grassLow = new THREE.Color(0x7bbf6e);
  const grassHigh = new THREE.Color(0x4b9a5a);
  const rock = new THREE.Color(0x8d9298);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = height(x, z);
    position.setY(i, Math.max(y, -1.6));
    const slope = Math.hypot(height(x + 1, z) - y, height(x, z + 1) - y);
    const c = new THREE.Color();
    if (y < 0.15) c.copy(wet);
    else if (y < 1.9) c.copy(sand).lerp(wet, 0.15);
    else if (slope > 1.25 || y > peak * 0.9) c.copy(rock);
    else c.copy(grassLow).lerp(grassHigh, Math.min(1, y / (peak * 0.7)));
    c.offsetHSL(0, 0, (rng() - 0.5) * 0.04);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.95,
      }),
    ),
  );

  // Foam ring where the water meets the beach.
  const foamCanvas = document.createElement("canvas");
  foamCanvas.width = foamCanvas.height = 128;
  const context = foamCanvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 40, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.65)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 3.1, radius * 3.1),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(foamCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.06;
  group.add(foam);

  const leaf = new THREE.MeshStandardMaterial({
    color: 0x5cba6e,
    emissive: 0x1f5a30,
    emissiveIntensity: 0.55,
    flatShading: true,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const trunk = new THREE.MeshStandardMaterial({
    color: 0x9b6b3f,
    flatShading: true,
    roughness: 0.9,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: 0x8f9499,
    flatShading: true,
    roughness: 1,
  });
  const bush = new THREE.MeshStandardMaterial({
    color: 0x4f9f5e,
    flatShading: true,
    roughness: 0.9,
  });

  function palm(x: number, z: number) {
    const y = height(x, z);
    const tree = new THREE.Group();
    const lean = (rng() - 0.5) * 1.8;
    const tall = 4.2 + rng() * 2.2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.35, tall * 0.5, 0),
      new THREE.Vector3(lean, tall, 0),
    ]);
    tree.add(
      new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.2, 6, false), trunk),
    );
    const crown = new THREE.Group();
    crown.position.set(lean, tall, 0);
    for (let i = 0; i < 8; i++) {
      const frond = new THREE.PlaneGeometry(0.85, 3, 1, 5);
      const pos = frond.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const along = (pos.getY(k) + 1.5) / 3;
        pos.setZ(k, -along * along * 1.1);
        pos.setX(k, pos.getX(k) * (1 - along * 0.75));
      }
      frond.translate(0, 1.5, 0);
      frond.computeVertexNormals();
      const mesh = new THREE.Mesh(frond, leaf);
      mesh.rotation.set(Math.PI / 2 - 0.35, 0, (i / 8) * Math.PI * 2);
      crown.add(mesh);
    }
    for (let i = 0; i < 3; i++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), trunk);
      nut.position.set(
        Math.cos(i * 2.1) * 0.28,
        -0.15,
        Math.sin(i * 2.1) * 0.28,
      );
      crown.add(nut);
    }
    tree.add(crown);
    tree.position.set(x, y - 0.1, z);
    tree.rotation.y = rng() * Math.PI * 2;
    group.add(tree);
  }
  function rockAt(x: number, z: number, size: number) {
    const geometry = new THREE.IcosahedronGeometry(size, 0);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++)
      pos.setXYZ(
        i,
        pos.getX(i) * (0.85 + rng() * 0.3),
        pos.getY(i) * (0.7 + rng() * 0.3),
        pos.getZ(i) * (0.85 + rng() * 0.3),
      );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, stone);
    mesh.position.set(x, Math.max(height(x, z), 0) + size * 0.25, z);
    mesh.rotation.y = rng() * 6;
    group.add(mesh);
  }
  function bushAt(x: number, z: number) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7 + rng() * 0.5, 0),
      bush,
    );
    mesh.position.set(x, height(x, z) + 0.2, z);
    mesh.scale.y = 0.7;
    group.add(mesh);
  }

  let palms = 0;
  let attempts = 0;
  while (palms < Math.round(radius / 3.2) && attempts++ < 400) {
    const angle = rng() * Math.PI * 2;
    const distance = radius * (0.35 + rng() * 0.6);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const y = height(x, z);
    if (y > 0.7 && y < peak * 0.55) {
      palm(x, z);
      palms++;
    }
  }
  for (let i = 0; i < 9; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = radius * (0.5 + rng() * 0.6);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (height(x, z) > 0.2) rockAt(x, z, 0.5 + rng() * 1.1);
  }
  for (let i = 0; i < 14; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = radius * (0.2 + rng() * 0.55);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (height(x, z) > 1.1) bushAt(x, z);
  }

  if (lighthouse) {
    let bestX = 0;
    let bestZ = 0;
    let best = -Infinity;
    for (let i = 0; i < 80; i++) {
      const x = (rng() - 0.5) * radius;
      const z = (rng() - 0.5) * radius;
      const y = height(x, z);
      if (y > best) {
        best = y;
        bestX = x;
        bestZ = z;
      }
    }
    const tower = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({
      color: 0xe0554b,
      flatShading: true,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xfff7e6,
      flatShading: true,
    });
    for (let i = 0; i < 4; i++) {
      const bottomR = 1.5 - i * 0.14;
      const section = new THREE.Mesh(
        new THREE.CylinderGeometry(bottomR - 0.14, bottomR, 2.3, 10),
        i % 2 ? red : white,
      );
      section.position.y = 1.15 + i * 2.3;
      tower.add(section);
    }
    const gallery = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x4b4f56, flatShading: true }),
    );
    gallery.position.y = 9.3;
    tower.add(gallery);
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfff1b0,
        emissive: 0xffd36a,
        emissiveIntensity: 1.2,
      }),
    );
    lantern.position.y = 10.0;
    tower.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.1, 10), red);
    roof.position.y = 11.15;
    tower.add(roof);
    tower.position.set(bestX, best - 0.1, bestZ);
    group.add(tower);
  }
  return mergeStatic(group);
}

/**
 * Static scenery needs no per-object transforms, so every mesh sharing a material
 * becomes one draw call. An island drops from hundreds of calls to about ten.
 */
function mergeStatic(source: THREE.Group) {
  source.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = (
      child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone()
    ) as THREE.BufferGeometry;
    for (const name of Object.keys(geometry.attributes))
      if (!["position", "normal", "color", "uv"].includes(name))
        geometry.deleteAttribute(name);
    geometry.applyMatrix4(child.matrixWorld);
    const list = buckets.get(child.material as THREE.Material) ?? [];
    list.push(geometry);
    buckets.set(child.material as THREE.Material, list);
  });
  const merged = new THREE.Group();
  for (const [material, list] of buckets) {
    const geometry = mergeGeometries(list, false);
    if (geometry) merged.add(new THREE.Mesh(geometry, material));
  }
  return merged;
}
