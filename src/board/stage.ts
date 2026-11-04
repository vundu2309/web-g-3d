/**
 * BoardStage: one WebGL renderer for the life of the game view.
 * HUD redraws move the same canvas between host elements; they never create another renderer.
 * Rendering is on demand (state change, camera input, animation), and pauses when the host is offscreen or the page is hidden.
 * If WebGL is unavailable or the context is lost, a flat 2D board with the same geometry is shown instead.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  focusPose,
  orbitBounds,
  overviewPose,
  TASK_SHIFT_FRACTION,
  CAMERA_FOV_DEG,
  type CameraMode,
  type Pose,
} from "./camera-math";
import { BoardContent, type BoardState } from "./scene";
import {
  PLATE_SIZE,
  spaceCenter,
  worldToPixel,
  outwardOf,
  BOARD_SIZE,
} from "./layout";
import { drawBoardFace } from "./texture";
import { PLAYER_BASE_COLORS } from "./models";

export type BoardStatus = "idle" | "3d" | "fallback" | "lost";

const SKY = "#dceeff";
const MAX_PIXEL_RATIO = 2;
const TEXTURE_PIXELS = 3072;
const FLAT_PIXELS = 1024;
const SETTLE_RATE = 6;

export class BoardStage {
  private readonly canvas = document.createElement("canvas");
  private readonly flat = document.createElement("div");
  private readonly flatCanvas = document.createElement("canvas");
  private readonly flatNote = document.createElement("p");
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  private readonly abort = new AbortController();

  private host: HTMLElement | null = null;
  private status: BoardStatus = "idle";
  private mode: CameraMode = "overview";
  private state: BoardState = {
    tokens: [],
    buildings: [],
    focus: null,
    sidePanel: false,
  };
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private content: BoardContent | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;
  private onscreen = false;
  private frame = 0;
  private lastFrame = 0;
  private width = 0;
  private height = 0;
  private settling = false;
  private userOrbited = false;
  private disposed = false;

  constructor() {
    this.canvas.className = "board-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.addEventListener("webglcontextlost", this.onContextLost, {
      signal: this.abort.signal,
    });
    this.canvas.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      { signal: this.abort.signal },
    );
    this.flat.className = "board-flat";
    this.flatCanvas.className = "board-flat-canvas";
    this.flatCanvas.setAttribute("aria-hidden", "true");
    this.flatNote.className = "board-flat-note";
    this.flat.append(this.flatCanvas, this.flatNote);
    document.addEventListener("visibilitychange", () => this.requestRender(), {
      signal: this.abort.signal,
    });
  }

  /** Current renderer status, mirrored in the host's data attribute for tests and assistive tooling. */
  get currentStatus(): BoardStatus {
    return this.status;
  }

  /**
   * Attach the single canvas to a freshly rendered host. Reattaching the same host is a no-op.
   * Old hosts are removed by the HUD innerHTML replacement, so the canvas is simply moved.
   */
  mount(host: HTMLElement | null): void {
    if (this.disposed) return;
    if (host === this.host) return;
    this.detachObservers();
    this.host = host;
    if (!host) {
      this.cancelFrame();
      return;
    }
    host.replaceChildren(this.canvas, this.flat);
    this.ensureRenderer();
    if (this.status === "3d" && this.content) {
      this.content.applyState(
        this.state,
        performance.now(),
        !this.reducedMotion.matches,
      );
    }
    this.syncHost();
    this.attachObservers(host);
    this.resize();
    this.requestRender();
  }

  /** Releases the host and stops rendering. The renderer stays alive for the next mount. */
  unmount(): void {
    this.mount(null);
  }

  setState(state: BoardState): void {
    this.state = state;
    if (this.status === "3d" && this.content && this.scene) {
      this.content.applyState(
        state,
        performance.now(),
        !this.reducedMotion.matches,
      );
      this.updateProjection();
    }
    if (this.status !== "3d") this.drawFlat();
    this.requestRender();
  }

  setMode(mode: CameraMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.settling = mode === "overview";
    if (mode === "overview") this.userOrbited = false;
    if (this.controls)
      this.controls.enabled = mode === "overview" && this.status === "3d";
    this.syncHost();
    this.requestRender();
  }

  /** Full teardown on leaving the game view: releases the context, geometries, materials and listeners. */
  dispose(): void {
    if (this.disposed) return;
    this.unmount();
    this.disposed = true;
    this.abort.abort();
    this.controls?.dispose();
    this.content?.dispose();
    this.renderer?.dispose();
    if (this.renderer && !this.renderer.getContext().isContextLost()) {
      this.renderer.forceContextLoss();
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.content = null;
    this.canvas.remove();
  }

  private ensureRenderer(): void {
    if (this.renderer || this.status === "fallback") return;
    try {
      const context = this.canvas.getContext("webgl2", {
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      if (!context) {
        this.enterFallback("fallback");
        return;
      }
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        context,
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
      );
      renderer.setClearColor(SKY, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      this.renderer = renderer;
      const scene = new THREE.Scene();
      scene.background = null;
      scene.add(new THREE.HemisphereLight(0xffffff, 0xc2d7ed, 1.5));
      const sun = new THREE.DirectionalLight(0xfff5e4, 1.5);
      sun.position.set(-5, 12, 7);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, {
        left: -8,
        right: 8,
        top: 8,
        bottom: -8,
        near: 1,
        far: 30,
      });
      sun.shadow.bias = -0.001;
      sun.shadow.normalBias = 0.02;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene.add(sun);
      this.scene = scene;
      this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 100);
      const controls = new OrbitControls(this.camera, this.canvas);
      controls.enablePan = true;
      controls.screenSpacePanning = false;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      controls.enableDamping = false;
      controls.rotateSpeed = 0.7;
      controls.zoomSpeed = 0.8;
      controls.minPolarAngle = 0.2;
      controls.maxPolarAngle = 1.3;
      controls.target.set(0, 0, 0);
      controls.enabled = this.mode === "overview";
      controls.addEventListener("change", () => {
        controls.target.clamp(
          new THREE.Vector3(-BOARD_SIZE / 2, 0, -BOARD_SIZE / 2),
          new THREE.Vector3(BOARD_SIZE / 2, 0, BOARD_SIZE / 2),
        );
        this.requestRender();
      });
      controls.addEventListener("start", () => {
        this.userOrbited = true;
        this.settling = false;
      });
      this.controls = controls;
      this.content = new BoardContent(
        TEXTURE_PIXELS,
        renderer.capabilities.getMaxAnisotropy(),
      );
      this.scene.add(this.content.root);
      this.status = "3d";
    } catch {
      this.enterFallback("fallback");
    }
  }

  private enterFallback(status: "fallback" | "lost"): void {
    this.status = status;
    this.flatNote.textContent =
      status === "lost"
        ? "Mất ngữ cảnh 3D. Bàn cờ phẳng vẫn hiển thị đầy đủ ô; đang chờ trình duyệt khôi phục 3D."
        : "Thiết bị này không mở được 3D. Bàn cờ phẳng vẫn hiển thị đầy đủ ô và vị trí.";
    this.cancelFrame();
    this.drawFlat();
    this.syncHost();
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.cancelFrame();
    this.enterFallback("lost");
  };

  private readonly onContextRestored = (): void => {
    if (this.status !== "lost") return;
    this.status = "3d";
    this.canvas.hidden = false;
    this.flat.hidden = true;
    this.syncHost();
    this.resize();
    this.requestRender();
  };

  private attachObservers(host: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.requestRender();
    });
    this.resizeObserver.observe(host);
    this.visibilityObserver = new IntersectionObserver((entries) => {
      this.onscreen = entries.some((entry) => entry.isIntersecting);
      if (this.onscreen) this.requestRender();
      else this.cancelFrame();
    });
    this.visibilityObserver.observe(host);
    host.addEventListener("keydown", this.onKeyDown, {
      signal: this.abort.signal,
    });
  }

  private detachObservers(): void {
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.resizeObserver = null;
    this.visibilityObserver = null;
    this.onscreen = false;
    this.host?.removeEventListener("keydown", this.onKeyDown);
  }

  /** Reflect status and mode for tests, CSS and assistive attributes on the host. */
  private syncHost(): void {
    const host = this.host;
    if (!host) return;
    host.dataset.boardStatus = this.status;
    host.dataset.boardMode = this.mode;
    host.classList.toggle(
      "is-interactive",
      this.status === "3d" && this.mode === "overview",
    );
    this.canvas.hidden = this.status !== "3d";
    this.flat.hidden = this.status === "3d";
  }

  private resize(): void {
    const host = this.host;
    if (!host || !this.renderer || !this.camera) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    if (this.controls) {
      const bounds = orbitBounds(this.camera.aspect);
      this.controls.minDistance = bounds.min;
      this.controls.maxDistance = bounds.max;
    }
    if (this.mode === "overview" && !this.userOrbited) {
      const pose = overviewPose(this.camera.aspect);
      this.camera.position.set(pose.x, pose.y, pose.z);
      this.controls?.target.set(0, 0, 0);
      this.camera.lookAt(0, 0, 0);
    }
    this.updateProjection();
  }

  private updateProjection(): void {
    const camera = this.camera;
    if (!camera || this.width === 0) return;
    camera.updateProjectionMatrix();
    if (this.state.sidePanel) {
      camera.setViewOffset(
        this.width,
        this.height,
        this.width * TASK_SHIFT_FRACTION,
        0,
        this.width,
        this.height,
      );
    } else {
      camera.clearViewOffset();
    }
  }

  private requestRender(): void {
    if (this.frame || !this.host || this.status !== "3d") return;
    if (!this.onscreen || document.hidden) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private cancelFrame(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastFrame = 0;
  }

  private readonly tick = (now: number): void => {
    this.frame = 0;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    const content = this.content;
    if (!renderer || !scene || !camera || !content || this.status !== "3d")
      return;
    const dt = this.lastFrame
      ? Math.min(0.05, (now - this.lastFrame) / 1000)
      : 0.016;
    this.lastFrame = now;
    let animating = content.update(now);
    if (this.mode === "focus") animating = this.followFocus(dt) || animating;
    else if (this.settling) animating = this.settleOverview(dt) || animating;
    if (this.mode === "overview") this.controls?.update();
    renderer.render(scene, camera);
    if (animating) this.requestRender();
  };

  private focusTarget(): THREE.Vector3 {
    const player = this.state.focus;
    const p = player === null ? null : this.content?.tokenPosition(player);
    if (p) return p.clone();
    return new THREE.Vector3(0, 0, 0);
  }

  /** Smoothly follows the focused token; returns true while the camera is still moving. */
  private followFocus(dt: number): boolean {
    const camera = this.camera!;
    const controls = this.controls!;
    const target = this.focusTarget();
    const pose: Pose = focusPose(
      { x: target.x, y: target.y, z: target.z },
      outwardOf(
        this.state.tokens.find((t) => t.player === this.state.focus)?.space ??
          0,
      ),
      camera.aspect,
    );
    return this.approach(camera, controls.target, pose, target, dt);
  }

  private settleOverview(dt: number): boolean {
    const camera = this.camera!;
    const controls = this.controls!;
    const pose = overviewPose(camera.aspect);
    const done = this.approach(
      camera,
      controls.target,
      pose,
      new THREE.Vector3(0, 0, 0),
      dt,
    );
    this.settling = done;
    return done;
  }

  /** Eases camera position and look target; snaps when close. Returns true while still moving. */
  private approach(
    camera: THREE.PerspectiveCamera,
    look: THREE.Vector3,
    pose: Pose,
    lookGoal: THREE.Vector3,
    dt: number,
  ): boolean {
    const desired = new THREE.Vector3(pose.x, pose.y, pose.z);
    if (this.reducedMotion.matches) {
      camera.position.copy(desired);
      look.copy(lookGoal);
      camera.lookAt(look);
      return false;
    }
    const k = 1 - Math.exp(-dt * SETTLE_RATE);
    camera.position.lerp(desired, k);
    look.lerp(lookGoal, k);
    camera.lookAt(look);
    const settled =
      camera.position.distanceTo(desired) < 0.002 &&
      look.distanceTo(lookGoal) < 0.002;
    if (settled) {
      camera.position.copy(desired);
      look.copy(lookGoal);
      camera.lookAt(look);
    }
    return !settled;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.mode !== "overview" || this.status !== "3d" || !this.controls)
      return;
    const controls = this.controls;
    switch (event.key) {
      case "ArrowLeft":
        controls.rotateLeft(0.14);
        break;
      case "ArrowRight":
        controls.rotateLeft(-0.14);
        break;
      case "ArrowUp":
        controls.rotateUp(0.1);
        break;
      case "ArrowDown":
        controls.rotateUp(-0.1);
        break;
      case "+":
      case "=":
        controls.dollyIn(1.15);
        break;
      case "-":
      case "_":
        controls.dollyOut(1.15);
        break;
      default:
        return;
    }
    event.preventDefault();
    this.userOrbited = true;
    controls.update();
    this.requestRender();
  };

  /** Flat fallback: same plate geometry as the 3D board, with token markers drawn over it. */
  private drawFlat(): void {
    if (this.status === "3d" || this.status === "idle") return;
    const canvas = this.flatCanvas;
    canvas.width = FLAT_PIXELS;
    canvas.height = FLAT_PIXELS;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBoardFace(ctx, FLAT_PIXELS);
    for (const token of this.state.tokens) {
      const center = spaceCenter(token.space);
      const { px, py } = worldToPixel(center, FLAT_PIXELS);
      const offset = (token.player - 1.5) * 0.09 * (FLAT_PIXELS / PLATE_SIZE);
      ctx.beginPath();
      ctx.arc(px + offset, py, 11, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_BASE_COLORS[token.player] ?? "#ffffff";
      ctx.strokeStyle = "#153b80";
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
    }
  }
}
