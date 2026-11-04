/**
 * Scene content owner: plate texture, slab, tokens with path animation, buildings, dice and card stacks.
 * It never creates a renderer. The stage owns WebGL; this class only changes meshes and reports animation.
 */
import * as THREE from "three";
import {
  Assets,
  buildCardStack,
  buildDie,
  buildHotel,
  buildHouse,
  buildToken,
} from "./models";
import { PLATE_SIZE, alongAxis, buildingSlots, tokenAnchor } from "./layout";
import { SPACE_COUNT } from "./spaces";
import { drawBoardFace } from "./texture";

export interface BoardTokenState {
  /** Player index 0–3 (fixed token model and colour). */
  readonly player: number;
  readonly space: number;
}
export interface BoardBuildingState {
  readonly space: number;
  /** 1–4 houses, 5 = hotel. */
  readonly level: number;
}
export interface BoardState {
  readonly tokens: readonly BoardTokenState[];
  readonly buildings: readonly BoardBuildingState[];
  /** Player whose token the focus camera follows; null shows the board centre. */
  readonly focus: number | null;
  /** True when the right column (task card or action tray) is open, so the board shifts left. */
  readonly sidePanel: boolean;
}

const STEP_MS = 110;
const MAX_MOVE_MS = 1000;
const HOP_HEIGHT = 0.14;
/** Token base offset along a space so two tokens can share one space. */
const TOKEN_SPREAD = 0.11;

interface TokenRig {
  readonly group: THREE.Group;
  space: number;
  /** Animation: forward steps from `fromSpace`; null when idle. */
  move: {
    fromSpace: number;
    steps: number;
    startMs: number;
    durationMs: number;
  } | null;
}

export class BoardContent {
  readonly root = new THREE.Group();
  private readonly assets = new Assets();
  private readonly texture: THREE.CanvasTexture;
  private readonly tokens = new Map<number, TokenRig>();
  private buildingsKey = "";
  private buildingGroup = new THREE.Group();
  private disposed = false;

  constructor(pixels: number, anisotropy: number) {
    const canvas = document.createElement("canvas");
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable for board texture");
    drawBoardFace(ctx, pixels);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.assets.track(this.texture);

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATE_SIZE, PLATE_SIZE),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.name = "board-plate";
    // Keep printed colours stable; a separate receiver supplies soft contact shadows.
    const receiver = new THREE.Mesh(
      plate.geometry,
      new THREE.ShadowMaterial({ opacity: 0.18 }),
    );
    receiver.rotation.x = -Math.PI / 2;
    receiver.position.y = 0.002;
    receiver.receiveShadow = true;
    receiver.name = "board-shadow";
    this.assets.track(receiver.material);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(PLATE_SIZE, 0.3, PLATE_SIZE),
      this.assets.material("#153b80"),
    );
    slab.position.y = -0.15 - 0.002;
    slab.name = "board-slab";
    this.assets.track(plate.geometry);
    this.assets.track(plate.material as THREE.Material);
    this.assets.track(slab.geometry);
    this.root.add(slab, plate, receiver);

    // Four dice and two card stacks sit in the mint centre, kept small.
    const chance = buildCardStack(this.assets, "#f5a547");
    chance.scale.setScalar(3.5);
    chance.position.set(-1.5, 0, -0.5);
    chance.rotation.y = 0.2;
    const chest = buildCardStack(this.assets, "#5ab5e8");
    chest.scale.setScalar(3.5);
    chest.position.set(1.5, 0, -0.5);
    chest.rotation.y = -0.25;
    const dieA = buildDie(this.assets, 5);
    dieA.scale.setScalar(3.5);
    dieA.position.set(-0.4, 0, 1.1);
    dieA.rotation.y = 0.5;
    const dieB = buildDie(this.assets, 3);
    dieB.scale.setScalar(3.5);
    dieB.position.set(0.4, 0, 1.3);
    dieB.rotation.y = -0.3;
    this.root.add(chance, chest, dieA, dieB, this.buildingGroup);
  }

  /** Four token rigs are created once; per-space positions are refreshed in applyState. */
  applyState(state: BoardState, nowMs: number, animate = true): void {
    this.applyTokens(state.tokens, nowMs, animate);
    this.applyBuildings(state.buildings);
    this.root.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.name !== "board-plate" &&
        object.name !== "board-shadow"
      )
        object.castShadow = true;
    });
  }

  private applyTokens(
    tokens: readonly BoardTokenState[],
    nowMs: number,
    animate: boolean,
  ): void {
    for (const token of tokens) {
      let rig = this.tokens.get(token.player);
      if (!rig) {
        const group = buildToken(this.assets, token.player);
        this.root.add(group);
        rig = { group, space: token.space, move: null };
        this.tokens.set(token.player, rig);
        this.placeToken(rig, token.player, token.space);
        continue;
      }
      if (!animate) {
        rig.space = token.space;
        rig.move = null;
        this.placeToken(rig, token.player, token.space);
        continue;
      }
      if (rig.space === token.space) continue;
      const steps = (token.space - rig.space + SPACE_COUNT) % SPACE_COUNT;
      if (steps === 0) continue;
      // Forward movement only, along the board's direction of play.
      rig.move = {
        fromSpace: rig.space,
        steps,
        startMs: nowMs,
        durationMs: Math.min(MAX_MOVE_MS, steps * STEP_MS),
      };
      rig.space = token.space;
    }
  }

  private placeToken(rig: TokenRig, player: number, space: number): void {
    const anchor = tokenAnchor(space, (player - 1.5) * TOKEN_SPREAD);
    rig.group.position.set(anchor.x, 0, anchor.z);
  }

  private applyBuildings(buildings: readonly BoardBuildingState[]): void {
    const key = buildings
      .map((b) => `${b.space}:${b.level}`)
      .sort()
      .join("|");
    if (key === this.buildingsKey) return;
    this.buildingsKey = key;
    this.root.remove(this.buildingGroup);
    this.buildingGroup = new THREE.Group();
    this.root.add(this.buildingGroup);
    for (const building of buildings) {
      const level = Math.max(0, Math.min(5, Math.floor(building.level)));
      if (level === 0) continue;
      const slots = buildingSlots(building.space, level);
      for (const slot of slots) {
        const model =
          level >= 5 ? buildHotel(this.assets) : buildHouse(this.assets);
        model.position.set(slot.x, 0, slot.z);
        if (level >= 5) {
          // Hotel's long axis follows the frontage of its space.
          const along = alongAxis(building.space);
          model.rotation.y = Math.atan2(-along.z, along.x);
        }
        this.buildingGroup.add(model);
      }
    }
  }

  /**
   * Advances animations to `nowMs`. Returns true while any token is moving,
   * so the stage keeps rendering only when the picture changes.
   */
  update(nowMs: number): boolean {
    let animating = false;
    for (const [player, rig] of this.tokens) {
      const move = rig.move;
      if (!move) continue;
      const t = (nowMs - move.startMs) / move.durationMs;
      if (t >= 1) {
        rig.move = null;
        this.placeToken(rig, player, rig.space);
        continue;
      }
      animating = true;
      const progress = Math.max(0, t) * move.steps;
      const i = Math.floor(progress);
      const f = progress - i;
      const from = tokenAnchor(
        (move.fromSpace + i) % SPACE_COUNT,
        (player - 1.5) * TOKEN_SPREAD,
      );
      const to = tokenAnchor(
        (move.fromSpace + i + 1) % SPACE_COUNT,
        (player - 1.5) * TOKEN_SPREAD,
      );
      rig.group.position.set(
        from.x + (to.x - from.x) * f,
        Math.sin(f * Math.PI) * HOP_HEIGHT,
        from.z + (to.z - from.z) * f,
      );
    }
    return animating;
  }

  /** Current world position of a player's token (follows animation). */
  tokenPosition(player: number): THREE.Vector3 | null {
    return this.tokens.get(player)?.group.position ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.clear();
    this.assets.dispose();
  }
}
