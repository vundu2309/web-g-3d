/**
 * Primitive-built meshes: four tokens, houses, hotel, dice and card stacks.
 * Shared geometries/materials live in `Assets` so one dispose call releases them.
 */
import * as THREE from "three";

export const PLAYER_BASE_COLORS = [
  "#f2c438",
  "#e76757",
  "#38b966",
  "#4188d8",
] as const;
export const TOKEN_KINDS = ["car", "hat", "ship", "dog"] as const;
/** Tokens are authored at 1.0 and scaled to suit the deeper spaces. */
export const TOKEN_SCALE = 1.7;

interface Disposable {
  dispose(): void;
}

export class Assets {
  private readonly owned: Disposable[] = [];
  private readonly cache = new Map<string, THREE.Material>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  material(color: string, key = color): THREE.MeshPhongMaterial {
    const cached = this.cache.get(key);
    if (cached) return cached as THREE.MeshPhongMaterial;
    const material = new THREE.MeshPhongMaterial({
      color,
      shininess: 45,
      specular: "#8796a3",
    });
    this.cache.set(key, material);
    this.owned.push(material);
    return material;
  }

  box(w: number, h: number, d: number): THREE.BoxGeometry {
    return this.geometry(
      `box:${w}:${h}:${d}`,
      () => new THREE.BoxGeometry(w, h, d),
    );
  }

  cylinder(
    top: number,
    bottom: number,
    height: number,
    segments: number,
  ): THREE.CylinderGeometry {
    return this.geometry(
      `cyl:${top}:${bottom}:${height}:${segments}`,
      () => new THREE.CylinderGeometry(top, bottom, height, segments),
    );
  }

  sphere(): THREE.SphereGeometry {
    return this.geometry(
      "sphere:unit",
      () => new THREE.SphereGeometry(1, 20, 12),
    );
  }

  cone(radius: number, height: number, segments: number): THREE.ConeGeometry {
    return this.geometry(
      `cone:${radius}:${height}:${segments}`,
      () => new THREE.ConeGeometry(radius, height, segments),
    );
  }

  private geometry<T extends THREE.BufferGeometry>(
    key: string,
    make: () => T,
  ): T {
    const cached = this.geometries.get(key);
    if (cached) return cached as T;
    const geometry = make();
    this.geometries.set(key, geometry);
    this.owned.push(geometry);
    return geometry;
  }

  /** Track an externally created resource (for example the board texture). */
  track(resource: Disposable): void {
    this.owned.push(resource);
  }

  dispose(): void {
    for (const resource of this.owned.splice(0)) resource.dispose();
    this.cache.clear();
    this.geometries.clear();
  }
}

function mesh(
  assets: Assets,
  w: number,
  h: number,
  d: number,
  color: string,
  at: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new THREE.Mesh(assets.box(w, h, d), assets.material(color));
  m.position.set(...at);
  m.rotation.set(...rotation);
  return m;
}

function cyl(
  assets: Assets,
  radius: number,
  height: number,
  color: string,
  at: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new THREE.Mesh(
    assets.cylinder(radius, radius, height, 20),
    assets.material(color),
  );
  m.position.set(...at);
  m.rotation.set(...rotation);
  return m;
}

/** Token standing on its player-coloured base. Base at y=0; about 0.3 units tall. */
export function buildToken(assets: Assets, player: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `token-${player}`;
  group.scale.setScalar(TOKEN_SCALE);
  group.add(cyl(assets, 0.17, 0.02, PLAYER_BASE_COLORS[player]!, [0, 0.01, 0]));
  switch (TOKEN_KINDS[player]) {
    case "car": {
      const silver = "#a9bdd0";
      const body = new THREE.Mesh(assets.sphere(), assets.material(silver));
      body.scale.set(0.19, 0.06, 0.085);
      body.position.set(0, 0.095, 0);
      group.add(body);
      group.add(mesh(assets, 0.14, 0.035, 0.13, "#273b4b", [-0.045, 0.145, 0]));
      const bonnet = new THREE.Mesh(assets.sphere(), assets.material(silver));
      bonnet.scale.set(0.12, 0.045, 0.074);
      bonnet.position.set(0.07, 0.13, 0);
      group.add(bonnet);
      group.add(mesh(assets, 0.015, 0.075, 0.13, "#647988", [0.175, 0.1, 0]));
      for (const x of [-0.115, 0.115])
        for (const z of [-0.09, 0.09]) {
          group.add(
            cyl(
              assets,
              0.055,
              0.035,
              "#293540",
              [x, 0.055, z],
              [Math.PI / 2, 0, 0],
            ),
          );
          group.add(
            cyl(
              assets,
              0.03,
              0.039,
              silver,
              [x, 0.055, z],
              [Math.PI / 2, 0, 0],
            ),
          );
        }
      break;
    }
    case "hat": {
      group.add(cyl(assets, 0.2, 0.03, "#c3c9d2", [0, 0.035, 0]));
      group.add(cyl(assets, 0.11, 0.24, "#c3c9d2", [0, 0.15, 0]));
      group.add(cyl(assets, 0.115, 0.05, "#2b2f38", [0, 0.07, 0]));
      break;
    }
    case "ship": {
      group.add(mesh(assets, 0.34, 0.1, 0.16, "#8e99a8", [0, 0.07, 0]));
      group.add(mesh(assets, 0.3, 0.03, 0.12, "#f4f1ea", [0, 0.14, 0]));
      group.add(mesh(assets, 0.1, 0.08, 0.09, "#f4f1ea", [-0.06, 0.2, 0]));
      group.add(cyl(assets, 0.01, 0.2, "#2b2f38", [0.05, 0.25, 0]));
      break;
    }
    default: {
      // dog
      const silver = "#c3c8d0";
      group.add(mesh(assets, 0.26, 0.12, 0.12, silver, [0, 0.12, 0]));
      group.add(mesh(assets, 0.1, 0.1, 0.1, silver, [0.15, 0.2, 0]));
      group.add(mesh(assets, 0.04, 0.05, 0.03, "#8e99a8", [0.13, 0.27, 0.05]));
      group.add(mesh(assets, 0.04, 0.05, 0.03, "#8e99a8", [0.13, 0.27, -0.05]));
      for (const x of [-0.08, 0.08])
        for (const z of [-0.04, 0.04])
          group.add(mesh(assets, 0.04, 0.1, 0.04, silver, [x, 0.05, z]));
      group.add(
        mesh(assets, 0.03, 0.03, 0.12, silver, [-0.15, 0.2, 0], [0, 0, -0.5]),
      );
    }
  }
  return group;
}

/** Small green house, square footprint of HOUSE_FOOTPRINT. Base at y=0. */
export function buildHouse(assets: Assets): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(assets, 0.19, 0.12, 0.19, "#2f9e5a", [0, 0.06, 0]));
  const roof = new THREE.Mesh(
    assets.cone(0.14, 0.1, 4),
    assets.material("#1f7a43"),
  );
  roof.position.set(0, 0.17, 0);
  roof.rotation.set(0, Math.PI / 4, 0);
  group.add(roof);
  return group;
}

/** Red hotel, longer than a house. Base at y=0. */
export function buildHotel(assets: Assets): THREE.Group {
  const group = new THREE.Group();
  // Long axis along x; the scene rotates it to lie along the space frontage.
  group.add(mesh(assets, 0.5, 0.16, 0.19, "#d8323c", [0, 0.08, 0]));
  group.add(mesh(assets, 0.36, 0.06, 0.15, "#a8242d", [0, 0.19, 0]));
  return group;
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [-1, 1],
    [0, 0],
    [1, -1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
};

/** Die with the given value on top. Opposite faces sum to 7. Size is the edge length. */
export function buildDie(
  assets: Assets,
  top: number,
  size = 0.16,
): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(assets, size, size, size, "#fbfbf7", [0, size / 2, 0]));
  const faces: Array<{ n: THREE.Vector3; value: number }> = [
    { n: new THREE.Vector3(0, 1, 0), value: top },
    { n: new THREE.Vector3(0, -1, 0), value: 7 - top },
    { n: new THREE.Vector3(1, 0, 0), value: 3 },
    { n: new THREE.Vector3(-1, 0, 0), value: 4 },
    { n: new THREE.Vector3(0, 0, 1), value: 2 },
    { n: new THREE.Vector3(0, 0, -1), value: 5 },
  ];
  const pipGeometry = assets.cylinder(0.014, 0.014, 0.006, 12);
  const pipMaterial = assets.material("#20242e");
  const up = new THREE.Vector3(0, 1, 0);
  for (const face of faces) {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, face.n);
    // Tangent axes for this face, in the face's local frame.
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const center = new THREE.Vector3(0, size / 2, 0).add(
      face.n.clone().multiplyScalar(size / 2 + 0.002),
    );
    for (const [a, b] of PIPS[face.value] ?? []) {
      const pip = new THREE.Mesh(pipGeometry, pipMaterial);
      pip.position
        .copy(center)
        .add(u.clone().multiplyScalar(a * 0.04))
        .add(v.clone().multiplyScalar(b * 0.04));
      pip.quaternion.copy(quaternion);
      group.add(pip);
    }
  }
  return group;
}

/** Stack of cards with a coloured top card. Height about 0.03. */
export function buildCardStack(assets: Assets, color: string): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 6; i++)
    group.add(
      mesh(assets, 0.3, 0.008, 0.44, "#f7f7f4", [0, 0.004 + i * 0.008, 0]),
    );
  group.add(mesh(assets, 0.3, 0.008, 0.44, color, [0, 0.004 + 6 * 0.008, 0]));
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = color;
  ctx.fillRect(12, 12, 232, 360);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, 212, 340);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 25px Arial";
  const chance = color === "#f5a547";
  ctx.fillText(chance ? "CHANCE" : "COMMUNITY", 128, 75);
  if (!chance) ctx.fillText("CHEST", 128, 108);
  ctx.font = "bold 150px Arial";
  ctx.fillText(chance ? "?" : "◇", 128, 265);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.44),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.057;
  assets.track(texture);
  assets.track(face.geometry);
  assets.track(face.material);
  group.add(face);
  return group;
}
