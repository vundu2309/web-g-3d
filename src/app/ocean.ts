import {
  PRESENCE_MS,
  SEA_BOUND,
  spawn,
  type Boat,
  type Pose,
} from "../ocean/model";
import { HubError } from "../hub/model";
import type { connectOcean } from "../platform/ocean";
import { OceanScene } from "../ocean/babylon-scene";
import { bindStick, type StickInput } from "../ocean/stick";
import { RemoteTracks, ServerClock } from "../ocean/remote";
import { stockTotal, type Inventory } from "../ocean/fishing";
import { createFishingUi } from "./fishing-ui";
import {
  connectWithRetry,
  fatalConnectionMessage,
  renewableSessionMessage,
  type RetryOptions,
} from "../ocean/connect";
import { decodeSave, encodeSave, saveKey } from "../ocean/save";

type Connection = Awaited<ReturnType<typeof connectOcean>>;
export interface OceanOptions {
  /** Replaces the network connection; used by tests to run the real scene offline. */
  connect?: typeof connectOcean;
  /** Receives the scene once it exists; lets tests read its state and frame cost. */
  onScene?: (scene: OceanScene) => void;
  /** Overrides the connection patience; tests use short values. */
  timing?: Partial<
    Pick<
      RetryOptions<never>,
      "deadlineMs" | "attemptMs" | "delaysMs" | "slowAfterMs"
    >
  > & { graphicsMs?: number };
}
export function startOcean(
  root: HTMLElement,
  back: () => void,
  options: OceanOptions = {},
) {
  const abort = new AbortController();
  const network = new AbortController();
  root.classList.add("ocean-root");
  root.innerHTML = `<main class="ocean-screen" aria-label="Map biển chung"><div class="ocean-stage"></div><div class="ocean-loading" role="status" aria-live="polite"><div class="ocean-loading-card"><div class="ocean-loading-boat" aria-hidden="true">⛵</div><h2 data-loading-title>Đang ra khơi…</h2><ol class="ocean-loading-steps"><li data-step="graphics">Tải đồ họa biển</li><li data-step="connect">Kết nối map chung</li><li data-step="enter">Vào biển</li></ol><p class="ocean-loading-note" data-loading-note></p><div class="ocean-loading-actions" hidden><button class="button primary" type="button" data-ocean="retry">Thử lại</button></div></div></div><div class="ocean-hud game-safe"><header class="ocean-top"><button class="ocean-chip" data-ocean="back" aria-label="Về hub">← <span>Về hub</span></button><div class="ocean-channel"><strong>Biển chung</strong><span>Mỗi người một thuyền</span></div><button class="ocean-chip" data-ocean="crew" aria-label="Thuyền trong kênh"><span data-count>Đang kết nối…</span></button></header><p class="ocean-status" role="status" aria-live="polite">Đang kết nối map chung…</p><section class="ocean-bottom" aria-label="Điều khiển thuyền"><div class="ocean-stick" role="group" aria-label="Cần lái: kéo lên để tiến, xuống để lùi, sang hai bên để rẽ"><span class="ocean-stick-mark" data-dir="up" aria-hidden="true">▲</span><span class="ocean-stick-mark" data-dir="down" aria-hidden="true">▼</span><span class="ocean-stick-mark" data-dir="left" aria-hidden="true">◀︎</span><span class="ocean-stick-mark" data-dir="right" aria-hidden="true">▶︎</span><span class="ocean-stick-knob" aria-hidden="true">⚓</span></div><p class="ocean-hint">Cần lái: kéo lên/xuống để chạy, sang hai bên để rẽ<br/>Bàn phím: WASD hoặc mũi tên · giữ Space để nạp lực, thả ra để ném</p><div class="ocean-actions"><button class="ocean-chip" data-ocean="catch">Kho cá <strong data-catch>0</strong></button><button class="ocean-fish" data-ocean="fish" disabled>Thả câu</button></div></section></div></main>`;
  const status = root.querySelector<HTMLElement>(".ocean-status")!;
  const loading = root.querySelector<HTMLElement>(".ocean-loading")!;
  const loadingTitle = loading.querySelector<HTMLElement>(
    "[data-loading-title]",
  )!;
  const loadingNote = loading.querySelector<HTMLElement>(
    "[data-loading-note]",
  )!;
  const loadingActions = loading.querySelector<HTMLElement>(
    ".ocean-loading-actions",
  )!;
  let wasActive = false;
  function step(
    name: "graphics" | "connect" | "enter",
    state: "active" | "done",
  ) {
    loading.querySelector(`[data-step="${name}"]`)!.className = `is-${state}`;
  }
  function showFailure(message: string) {
    loading.hidden = false;
    loading.classList.remove("is-done");
    loading.classList.add("is-failed");
    loadingTitle.textContent = wasActive
      ? "Mất kết nối biển chung"
      : "Chưa vào được biển chung";
    loadingNote.textContent = message;
    loadingActions.hidden = false;
    // An expired or revoked session cannot be fixed by retrying: offer signing in again.
    const signedOut = /đăng nhập/i.test(message);
    loadingActions.dataset.auth = String(signedOut);
    loadingActions.querySelector("[data-ocean=retry]")!.textContent = signedOut
      ? "Đăng nhập lại"
      : "Thử lại";
    // Whatever was in progress is what failed.
    for (const item of loading.querySelectorAll(".is-active"))
      item.className = "is-failed";
  }
  function hideLoading() {
    loading.classList.add("is-done");
    setTimeout(() => {
      if (!loading.classList.contains("is-failed")) loading.hidden = true;
    }, 500);
  }
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const fishButton = root.querySelector<HTMLButtonElement>(
    '[data-ocean="fish"]',
  )!;
  const stickElement = root.querySelector<HTMLElement>(".ocean-stick")!;
  const stickKnob =
    stickElement.querySelector<HTMLElement>(".ocean-stick-knob")!;
  const dialog = document.createElement("dialog");
  dialog.className = "ocean-dialog";
  document.body.append(dialog);
  let scene: OceanScene | undefined;
  let connection: Connection | undefined;
  let pose: Pose = { x: 0, z: 0, heading: 0, fishing: false };
  let boats: Boat[] = [];
  let disposed = false;
  let active = false;
  let frame = 0;
  let lastDraw = 0;
  let lastPublish = 0;
  let lastPose = "";
  let clockOffset = 0;
  let caught = 0;
  let reconnecting = false;
  let connectFn: typeof connectOcean | undefined;
  let selfUid = "";
  let lastSave = 0;
  const stored = {
    read(key: string) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key: string, value: string) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Private mode or a full disk: the game still works, it just cannot resume. */
      }
    },
  };
  /** Keeps the boat's last position and the catch count on this device. */
  function persist() {
    if (!selfUid) return;
    stored.write(
      saveKey(selfUid),
      encodeSave({
        x: pose.x,
        z: pose.z,
        heading: pose.heading,
        caught,
        fish: fishStock,
      }),
    );
  }
  /** The fish store: what is held now (and records), saved with the boat. */
  let fishStock: Inventory = {};
  const keys = new Set<string>();
  let stick: StickInput = { steer: 0, throttle: 0 };
  const releaseStick = bindStick(stickElement, stickKnob, {
    enabled: () => active && !dialog.open,
    onChange: (input) => {
      stick = input;
    },
    signal: abort.signal,
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function notify(text: string) {
    if (status.textContent !== text) status.textContent = text;
  }
  function stopFishing() {
    fishingUi.cancel();
    pose = { ...pose, fishing: false };
  }
  const fishingUi = createFishingUi({
    root,
    button: fishButton,
    dialog,
    scene: () => scene,
    boat: () => pose,
    enabled: () => active && !dialog.open && !document.hidden,
    stock: () => fishStock,
    setStock: (next, caughtOne) => {
      fishStock = next;
      if (caughtOne) caught++;
      root.querySelector("[data-catch]")!.textContent = String(
        stockTotal(fishStock),
      );
      persist();
    },
    reduced,
  });
  // Other boats are drawn slightly in the past, interpolated between received samples,
  // so they glide at any publish rate instead of jumping when a packet arrives.
  const tracks = new RemoteTracks();
  const serverClock = new ServerClock();
  function takeBoats(list: Boat[], serverTime: number) {
    boats = list;
    clockOffset = serverTime - Date.now();
    serverClock.observe(serverTime, performance.now());
    for (const boat of list)
      if (boat.uid !== selfUid && boat.updatedAt > tracks.latest(boat.uid))
        tracks.push(boat.uid, boat.updatedAt, boat);
    tracks.keepOnly(new Set(list.map((boat) => boat.uid)));
  }
  /** Boats as they are drawn now: the player's own is physics, the rest are played back. */
  function drawnBoats(list: Boat[], localNow: number) {
    const serverNow = serverClock.now(localNow);
    if (serverNow === undefined) return list;
    const at = serverNow - (connection?.delayMs ?? 1300);
    return list.map((boat) => {
      if (boat.uid === connection?.uid) return boat;
      const played = tracks.sample(boat.uid, at);
      return played ? { ...boat, ...played } : boat;
    });
  }
  const poseKey = (value: Pose) =>
    `${Math.round(value.x * 20)},${Math.round(value.z * 20)},${Math.round(value.heading * 100)},${value.fishing}`;
  /** A drop after entering: try to reconnect by itself; only give up for real reasons. */
  function connectionLost(error: unknown) {
    // Before the boat is in the sea, the start-up retry loop owns errors.
    if (disposed || reconnecting || !active) return;
    const message = error instanceof HubError ? error.message : "";
    // An expired access token ends the connection but not the session: reconnecting
    // sends a fresh one, and only a refused handshake means signing in again.
    if (
      fatalConnectionMessage.test(message) &&
      !renewableSessionMessage.test(message)
    ) {
      fail(error);
      return;
    }
    void reconnect();
  }
  async function reconnect() {
    reconnecting = true;
    active = false;
    keys.clear();
    releaseStick();
    stopFishing();
    scene?.setInput(0, 0);
    fishButton.disabled = true;
    connection?.dispose();
    connection = undefined;
    persist();
    let tries = 1;
    const say = (waking = false) =>
      notify(
        `Mất kết nối. Đang kết nối lại… (lần ${tries})${waking ? " Máy chủ có thể đang thức dậy." : ""}`,
      );
    say();
    try {
      const value = await connectWithRetry(
        (signal) => connectFn!(takeBoats, connectionLost, signal),
        network.signal,
        {
          deadlineMs: Math.min(patience.deadlineMs, 90_000),
          attemptMs: patience.attemptMs,
          delaysMs: patience.delaysMs,
          slowAfterMs: patience.slowAfterMs,
          onAttempt: (n) => {
            tries = n;
            say();
          },
          onSlow: () => say(true),
          isFatal: (e) =>
            e instanceof HubError && fatalConnectionMessage.test(e.message),
          discard: (late) => late.dispose(),
        },
      );
      if (disposed || network.signal.aborted) {
        value.dispose();
        return;
      }
      // Same boat, same place: only the network connection is new.
      connection = value;
      reconnecting = false;
      active = true;
      lastPublish = performance.now() - 500;
      lastPose = "";
      fishButton.disabled = false;
      notify("Đã kết nối lại biển chung.");
    } catch (error) {
      reconnecting = false;
      fail(error);
    }
  }
  function fail(error: unknown) {
    if (disposed) return;
    persist();
    reconnecting = false;
    wasActive ||= active;
    active = false;
    keys.clear();
    releaseStick();
    stopFishing();
    fishButton.disabled = true;
    const message =
      error instanceof HubError
        ? error.message
        : "Mất kết nối biển chung. Thử lại để vào biển lần nữa.";
    notify(message);
    showFailure(message);
    network.abort();
    connection?.dispose();
  }
  function showDialog(kind: "crew" | "catch") {
    keys.clear();
    releaseStick();
    if (kind === "catch") {
      fishingUi.showStock();
      return;
    }
    fishingUi.cancel();
    dialog.replaceChildren();
    const title = document.createElement("h2");
    title.id = "ocean-dialog-title";
    title.textContent =
      kind === "crew" ? "Thuyền trong kênh" : "Kho cá chuyến này";
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.append(title);
    if (kind === "crew") {
      const list = document.createElement("ul");
      for (const boat of visibleBoats()) {
        const li = document.createElement("li");
        li.textContent = `${boat.name}${boat.uid === connection?.uid ? " (Bạn)" : ""} · ${boat.fishing ? "Đang câu" : "Đang trên biển"}`;
        list.append(li);
      }
      dialog.append(list);
      const note = document.createElement("p");
      note.textContent =
        "Cùng một map chung. Danh sách cập nhật khi mở lại; thuyền mất kết nối sẽ ẩn sau tối đa 30 giây.";
      dialog.append(note);
    } else {
      const text = document.createElement("p");
      text.textContent = `Bạn đã bắt tổng cộng ${caught} con cá. Số cá và vị trí thuyền được lưu trên thiết bị này để lần sau bạn tiếp tục.`;
      dialog.append(text);
    }
    const close = document.createElement("button");
    close.className = "button primary";
    close.textContent = "Đóng";
    close.addEventListener("click", () => dialog.close(), { once: true });
    dialog.append(close);
    dialog.showModal();
  }
  function visibleBoats() {
    return boats.filter(
      (boat) =>
        boat.uid === connection?.uid ||
        Date.now() + clockOffset - boat.updatedAt < PRESENCE_MS,
    );
  }
  function animate(now: number) {
    if (disposed) return;
    if (!active || document.hidden || dialog.open) scene?.setInput(0, 0);
    if (active && !document.hidden && !dialog.open) {
      fishingUi.tick(now);
      // The stick is analog; keys are full deflection. The stick wins while held.
      const steer =
        stick.steer || Number(keys.has("right")) - Number(keys.has("left"));
      const throttle =
        stick.throttle || Number(keys.has("up")) - Number(keys.has("down"));
      // While casting, the boat gets no thrust and drag brings it to rest.
      scene?.setInput(pose.fishing ? 0 : steer, pose.fishing ? 0 : throttle);
      const state = scene?.selfState();
      if (state)
        pose = {
          x: Math.max(-SEA_BOUND, Math.min(SEA_BOUND, state.x)),
          z: Math.max(-SEA_BOUND, Math.min(SEA_BOUND, state.z)),
          heading: state.heading,
          fishing: fishingUi.fishing,
        };
      if (now - lastSave > 5000) {
        lastSave = now;
        persist();
      }
      // The bobbing of the hull on the waves is not movement worth sending.
      const serialized = poseKey(pose);
      if (
        now - lastPublish >= (connection?.sendMs ?? 1000) &&
        (serialized !== lastPose || now - lastPublish >= 10000)
      ) {
        lastPublish = now;
        lastPose = serialized;
        void connection?.publish(pose).catch((error: unknown) => {
          // The server's "too fast" reply is harmless; anything else ends the session.
          if (error instanceof HubError && /quá nhanh/.test(error.message))
            return;
          connectionLost(error);
        });
      }
    }
    const visible = active || reconnecting ? visibleBoats() : [];
    const text = active
      ? `${visible.length} thuyền`
      : reconnecting
        ? "Đang kết nối lại…"
        : "Chưa kết nối";
    if (count.textContent !== text) count.textContent = text;
    // Draw the sea even while connecting or offline; boats appear once connected.
    if (scene && now - lastDraw >= 33) {
      scene.update(
        drawnBoats(visible, now),
        connection?.uid ?? "",
        now / 1000,
        (now - lastDraw) / 1000,
        reduced,
      );
      lastDraw = now;
    }
    frame = requestAnimationFrame(animate);
  }
  // Browsers do not synthesize a click for a second finger while the first holds
  // the stick, so fishing acts on the press itself: press to start charging a throw (or
  // to pull when a fish is on), let go to throw. Keyboard activation lands in click.
  let fishTouchedAt = -1e9;
  let fishPointer: number | undefined;
  root.addEventListener(
    "pointerdown",
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-ocean="fish"]',
      );
      if (!button || button.disabled || fishPointer !== undefined) return;
      fishPointer = event.pointerId;
      fishTouchedAt = performance.now();
      fishingUi.press();
    },
    { signal: abort.signal },
  );
  for (const type of ["pointerup", "pointercancel"])
    root.addEventListener(
      type,
      (event) => {
        if ((event as PointerEvent).pointerId !== fishPointer) return;
        fishPointer = undefined;
        fishTouchedAt = performance.now();
        fishingUi.release();
      },
      { signal: abort.signal },
    );
  root.addEventListener(
    "click",
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-ocean]",
      )?.dataset.ocean;
      if (action === "back") back();
      // A reload re-enters the sea directly (?view=ocean) and also clears any stale state.
      if (action === "retry") {
        if (loadingActions.dataset.auth !== "true") location.reload();
        else
          void import("../platform/account")
            .then(({ logoutPlayer }) => logoutPlayer())
            .catch(() => {})
            .finally(() => location.assign("./"));
      }
      // The press already acted; only keyboard activation lands here.
      if (action === "fish" && performance.now() - fishTouchedAt > 500)
        fishingUi.click();
      if (action === "crew" || action === "catch") showDialog(action);
    },
    { signal: abort.signal },
  );
  const mapping: Record<string, string> = {
    ArrowUp: "up",
    w: "up",
    ArrowDown: "down",
    s: "down",
    ArrowLeft: "left",
    a: "left",
    ArrowRight: "right",
    d: "right",
  };
  window.addEventListener(
    "keydown",
    (event) => {
      if (dialog.open || !active) return;
      const direction = mapping[event.key] || mapping[event.key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        keys.add(direction);
      }
      if (event.code === "Space") {
        event.preventDefault();
        fishTouchedAt = performance.now();
        if (!event.repeat) fishingUi.press();
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      const direction = mapping[event.key] || mapping[event.key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        keys.delete(direction);
      }
      if (event.code === "Space") {
        event.preventDefault();
        fishTouchedAt = performance.now();
        fishingUi.release();
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "blur",
    () => {
      keys.clear();
      releaseStick();
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "offline",
    () =>
      fail(new HubError("Đã mất mạng. Hãy về hub và vào lại khi có kết nối.")),
    { signal: abort.signal },
  );
  window.addEventListener("pagehide", () => dispose(), {
    signal: abort.signal,
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      keys.clear();
      releaseStick();
      if (document.hidden) {
        stopFishing();
        // A hidden tab can be killed without a pagehide: keep the progress now.
        persist();
      }
    },
    { signal: abort.signal },
  );
  frame = requestAnimationFrame(animate);
  const patience = {
    deadlineMs: 100_000,
    attemptMs: 25_000,
    delaysMs: [1500, 2500, 4000],
    slowAfterMs: 5000,
    graphicsMs: 60_000,
    ...options.timing,
  };
  let waking = false;
  let attempts = 1;
  const connectNote = () =>
    (loadingNote.textContent =
      (waking
        ? "Máy chủ đang thức dậy, có thể mất tới 1 phút. Bạn không cần làm gì."
        : "Đang kết nối…") + (attempts > 1 ? ` (lần thử ${attempts})` : ""));
  step("graphics", "active");
  step("connect", "active");
  const graphicsTimer = setTimeout(() => {
    if (!scene)
      fail(new HubError("Tải đồ họa quá lâu. Kiểm tra mạng rồi thử lại."));
  }, patience.graphicsMs);
  // Graphics and network start together: the server wakes while the engine downloads.
  const graphics = OceanScene.create(
    root.querySelector<HTMLElement>(".ocean-stage")!,
    () => fail(new HubError("Đồ họa đã tạm dừng. Hãy thử lại để mở lại game.")),
  )
    .then((created) => {
      if (disposed) {
        created.dispose();
        throw new HubError("Đã rời biển.");
      }
      scene = created;
      options.onScene?.(created);
      clearTimeout(graphicsTimer);
      step("graphics", "done");
      // From here the live sea shows behind the card instead of a plain backdrop.
      loading.classList.add("has-scene");
      return created;
    })
    .catch((error: unknown) => {
      if (error instanceof HubError) throw error;
      console.error(error);
      throw new HubError(
        "Thiết bị chưa mở được đồ họa 3D. Hãy bật WebGL hoặc dùng trình duyệt khác.",
      );
    });
  const connecting = (async () => {
    const connect =
      options.connect ?? (await import("../platform/ocean")).connectOcean;
    connectFn = connect;
    const value = await connectWithRetry(
      (attemptSignal) => connect(takeBoats, connectionLost, attemptSignal),
      network.signal,
      {
        deadlineMs: patience.deadlineMs,
        attemptMs: patience.attemptMs,
        delaysMs: patience.delaysMs,
        slowAfterMs: patience.slowAfterMs,
        onSlow: () => {
          waking = true;
          connectNote();
        },
        onAttempt: (n) => {
          attempts = n;
          if (n > 1 || waking) connectNote();
        },
        isFatal: (error) =>
          error instanceof HubError &&
          fatalConnectionMessage.test(error.message),
        discard: (late) => late.dispose(),
      },
    );
    step("connect", "done");
    return value;
  })();
  Promise.all([graphics, connecting])
    .then(([created, value]) => {
      if (disposed || network.signal.aborted) {
        value.dispose();
        return;
      }
      connection = value;
      // Resume where the boat last was on this device, else start in the shared harbor
      // (whatever start pose the server assigns, the client's own wins once published).
      selfUid = value.uid;
      const restored = decodeSave(stored.read(saveKey(value.uid)));
      pose = restored.pose ?? spawn(value.uid);
      caught = restored.caught;
      fishStock = restored.fish;
      root.querySelector("[data-catch]")!.textContent = String(
        stockTotal(fishStock),
      );
      created.spawnSelf(value.uid, "Bạn", pose);
      step("enter", "done");
      active = true;
      // The first pose goes out about half a second after entering (not a full second),
      // late enough for the server's rate limit, early enough that others see the real spot.
      lastPublish = performance.now() - 500;
      lastPose = "";
      fishButton.disabled = false;
      hideLoading();
      notify("Đã vào biển chung. Lái thuyền và thả câu khi bạn muốn.");
    })
    .catch((error: unknown) => {
      // If only the graphics failed, the network connection that did succeed is closed.
      connecting.then(
        (value) => value.dispose(),
        () => {},
      );
      fail(error);
    });
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(graphicsTimer);
    persist();
    fishingUi.dispose();
    cancelAnimationFrame(frame);
    abort.abort();
    network.abort();
    connection?.dispose();
    scene?.dispose();
    dialog.remove();
    root.classList.remove("ocean-root");
    root.replaceChildren();
  }
  return dispose;
}
