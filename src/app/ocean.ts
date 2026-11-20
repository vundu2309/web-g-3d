import { createPerfPanel } from "./perf-panel.ts";
import {
  PRESENCE_MS,
  SEA_BOUND,
  spawn,
  type Boat,
  type Pose,
} from "../ocean/model";
import { HubError } from "../platform/errors";
import type { connectOcean } from "../platform/ocean";
import { OceanScene } from "../ocean/babylon-scene";
import { createStick, type StickInput } from "../ocean/stick";
import { createBoatControl } from "../ocean/boat-control";
import { FramePacer } from "../ocean/frame-pacing";
import { bindInputLayer, type InputTarget } from "../ocean/input-layer";
import { RemoteTracks, ServerClock } from "../ocean/remote";
import { releaseOne, stockTotal, type Inventory } from "../ocean/fishing";
import { inventoryFrom } from "../ocean/server-store";
import { createFishingUi } from "./fishing-ui";
import { createMarketUi } from "./market-ui";
import { createWeatherTestSection } from "./settings-weather";
import { createSeaAudio } from "./audio";
import { createAudioSection } from "./settings-audio";
import { SEA } from "../ocean/sea-atmosphere";
import {
  createPerfSection,
  createProbeSection,
  createWavesSection,
  loadPerfPref,
  savePerfPref,
} from "./settings-perf";
import { probeSummary } from "../ocean/probe";
import { createUpdateSection } from "./settings-update";
import {
  economyEnabled,
  supabaseEconomy,
  type EconomyApi,
} from "../platform/economy";
import { mountHubArt } from "../ui/hub-canvas";
import { createHubShell, type HubNav } from "./hub-shell";
import { CHROME_COLORS, setChromeColor } from "./chrome-color";
import { createMinimap } from "./minimap";
import { hullCss } from "../ocean/palette";
import {
  connectWithRetry,
  fatalConnectionMessage,
  renewableSessionMessage,
  type RetryOptions,
} from "../ocean/connect";
import {
  decodeSave,
  encodeSave,
  safePose,
  saveKey,
  type RestoredSea,
} from "../ocean/save";

type Connection = Awaited<ReturnType<typeof connectOcean>>;
export interface OceanOptions {
  /** Replaces the network connection; used by tests to run the real scene offline. */
  connect?: typeof connectOcean;
  /** Receives the scene once it exists; lets tests read its state and frame cost. */
  onScene?: (scene: OceanScene) => void;
  /** Runs the tug of war faster; tests on a software renderer would take minutes. */
  fightSpeed?: number;
  /** Hold the drawing rhythm ("eco" is about 30 fps) instead of following the display; for tests. */
  rhythm?: "full" | "eco";
  /** Replaces the server economy (tests use an in-memory one); none means no market. */
  economy?: EconomyApi;
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
  // The loading screen shares the harbor sky; the bar turns sea-sky once the sea is shown.
  const barBefore = setChromeColor(CHROME_COLORS.harbor);
  root.innerHTML = `<main class="ocean-screen" aria-label="Map biển chung"><div class="ocean-stage"></div><div class="ocean-stick-zone" aria-hidden="true"></div><div class="ocean-loading" role="status" aria-live="polite"><div class="hub-art" aria-hidden="true"><canvas class="hub-canvas"></canvas></div><div class="ocean-loading-card"><svg class="ocean-loading-boat" viewBox="0 0 120 56" width="76" height="36" aria-hidden="true" focusable="false"><path d="M0 30h120l-18 22H20Z" fill="#e97760" stroke="#153b80" stroke-width="5" stroke-linejoin="round"/><rect x="48" y="4" width="38" height="26" rx="5" fill="#fff6e0" stroke="#153b80" stroke-width="5"/></svg><h2 data-loading-title>Đang ra khơi…</h2><ol class="ocean-loading-steps"><li data-step="graphics">Tải đồ họa biển</li><li data-step="connect">Kết nối map chung</li><li data-step="enter">Vào biển</li></ol><div class="ocean-loading-bar" aria-hidden="true"><i></i></div><p class="ocean-loading-note" data-loading-note></p><div class="ocean-loading-actions" hidden><button class="button primary" type="button" data-ocean="retry">Thử lại</button></div></div></div><div class="ocean-hud game-safe"><header class="ocean-top"><button class="ocean-chip ocean-glass ocean-round" data-ocean="settings" aria-label="Cài đặt"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/></svg><span class="sr-only" data-count role="status">Đang kết nối…</span></button></header><canvas class="ocean-minimap" role="img" aria-label="Bản đồ nhỏ: thuyền của bạn, các đảo và thuyền khác"></canvas><p class="ocean-status" role="status" aria-live="polite">Đang kết nối map chung…</p><section class="ocean-bottom" aria-label="Điều khiển thuyền"><div class="ocean-stick" role="group" aria-label="Cần lái: kéo lên để tiến, xuống để lùi, sang hai bên để rẽ"><span class="ocean-stick-mark" data-dir="up" aria-hidden="true">▲</span><span class="ocean-stick-mark" data-dir="down" aria-hidden="true">▼</span><span class="ocean-stick-mark" data-dir="left" aria-hidden="true">◀︎</span><span class="ocean-stick-mark" data-dir="right" aria-hidden="true">▶︎</span><span class="ocean-stick-knob" aria-hidden="true">⚓</span></div><div class="ocean-actions"><button class="ocean-chip ocean-glass ocean-market" data-ocean="market" aria-label="Bán cá" hidden><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="#ffd35a" stroke="currentColor" stroke-width="2.4"/><path d="M6.5 12c1.6-2.6 4.6-3 7-1.4l3-1.6v6l-3-1.6c-2.4 1.6-5.4 1.2-7-1.4Z" fill="currentColor"/></svg><strong>Bán</strong></button><button class="ocean-chip ocean-glass" data-ocean="catch" aria-label="Kho cá 0"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3Z"/><circle cx="8" cy="11" r=".6" fill="currentColor"/></svg><strong data-catch>0</strong></button><button class="ocean-fish" data-ocean="fish" aria-label="Thả câu" disabled></button></div></section></div><div class="ocean-input" aria-hidden="true"></div></main>`;
  const status = root.querySelector<HTMLElement>(".ocean-status")!;
  const loading = root.querySelector<HTMLElement>(".ocean-loading")!;
  const loadingTitle = loading.querySelector<HTMLElement>(
    "[data-loading-title]",
  )!;
  const loadingNote = loading.querySelector<HTMLElement>(
    "[data-loading-note]",
  )!;
  // The sunset behind the loading card is animated only while the card is up.
  let stopLoadingArt: (() => void) | undefined = mountHubArt(
    loading.querySelector<HTMLCanvasElement>(".hub-canvas")!,
  );
  const loadingActions = loading.querySelector<HTMLElement>(
    ".ocean-loading-actions",
  )!;
  let wasActive = false;
  function step(
    name: "graphics" | "connect" | "enter",
    state: "active" | "done",
  ) {
    loading.querySelector(`[data-step="${name}"]`)!.className = `is-${state}`;
    const done = loading.querySelectorAll(".is-done").length;
    const active = loading.querySelectorAll(".is-active").length;
    loading.style.setProperty(
      "--progress",
      String(Math.min(1, (done + active * 0.4) / 3)),
    );
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
      if (!loading.classList.contains("is-failed")) {
        loading.hidden = true;
        stopLoadingArt?.();
        stopLoadingArt = undefined;
      }
    }, 500);
  }
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const minimap = createMinimap(
    root.querySelector<HTMLCanvasElement>(".ocean-minimap")!,
  );
  let lastMap = 0;
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
  const seaAudio = createSeaAudio();
  let active = false;
  let frame = 0;
  let lastDraw = 0;
  const pacer = new FramePacer(options.rhythm);
  const perfLog = new URLSearchParams(window.location.search).has("perf");
  const hitches: Record<string, number | string | boolean>[] = [];
  if (perfLog)
    (window as unknown as { __seaHitches: unknown }).__seaHitches = hitches;
  // The frame numbers panel (perf-panel.ts): `?perf` shows it, F3 or a tap toggles it.
  const perfPanel = createPerfPanel(
    root.querySelector<HTMLElement>(".ocean-screen") ?? root,
    {
      mode: () => pacer.mode,
      stats: () =>
        scene?.stats() ?? {
          renderScale: 1,
          clearWater: false,
          clearWaterMeshes: 0,
          meshes: 0,
          triangles: 0,
        },
      boats: () => boats.length,
      groups: () => scene?.trianglesByGroup() ?? [],
      switches: probeSummary,
    },
    {
      visible: perfLog || loadPerfPref(),
      signal: abort.signal,
      onToggle: savePerfPref,
    },
  );
  let lastControl = 0;
  const boatControl = createBoatControl();
  const noKeys = { left: false, right: false, up: false, down: false };
  const noStick = { steer: 0, throttle: 0 };
  let lastPublish = 0;
  let lastPose = "";
  let clockOffset = 0;
  let caught = 0;
  // The server economy (none without VITE_ECONOMY: then no market and the store stays on the device).
  const economy =
    options.economy ?? (economyEnabled() ? supabaseEconomy() : undefined);
  /**
   * True when the SERVER keeps the fish store, the records, the catch count and the boat's
   * position (decision 0016). False without an economy, or when the profile could not be read
   * (migration not applied, no network): then the store stays on the device as before.
   */
  let serverStore = false;
  let lastPoseSave = 0;
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
        // The server holds the store: no second copy here that could be imported again.
        fish: serverStore ? {} : fishStock,
      }),
    );
    // The boat's position goes to the server too, at most every 30 s (it keeps one per 10 s).
    const now = performance.now();
    if (serverStore && economy && now - lastPoseSave > 30_000) {
      lastPoseSave = now;
      void economy.savePose(pose).catch(() => {});
    }
  }

  /** Reads the store, records and count from the server again (after a failed call). */
  async function refreshStore() {
    if (!economy || !serverStore || disposed) return;
    try {
      const [profile, state] = await Promise.all([
        economy.profile(),
        economy.state(),
      ]);
      if (disposed) return;
      fishStock = inventoryFrom(state.ledger, profile.records);
      caught = profile.caught;
      showStockCount();
    } catch {
      /* The device copy stays; the next refresh tries again. */
    }
  }

  /**
   * Enters with the server's store: the profile and the unsold fish. The first time, the fish
   * store kept on this device is moved to the server (once per account, see the migration).
   * Undefined when the server cannot say (the store then stays on the device).
   */
  async function loadServerStore(local: RestoredSea) {
    if (!economy) return undefined;
    try {
      const read = async () =>
        Promise.all([economy.profile(), economy.state()]);
      let [profile, state] = await read();
      if (!profile.imported) {
        await economy.importLocal(local.fish, local.caught);
        [profile, state] = await read();
      }
      return {
        caught: profile.caught,
        fish: inventoryFrom(state.ledger, profile.records),
        pose: profile.pose
          ? safePose(profile.pose.x, profile.pose.z, profile.pose.heading)
          : undefined,
      };
    } catch {
      return undefined;
    }
  }
  /** The fish store: what is held now (and records), saved with the boat. */
  let fishStock: Inventory = {};
  const keys = new Set<string>();
  let stick: StickInput = { steer: 0, throttle: 0 };
  const stickController = createStick(stickElement, stickKnob, {
    enabled: () => active && !dialog.open,
    onChange: (input) => {
      stick = input;
    },
  });
  const releaseStick = stickController.release;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  /** `brief` messages are good news: they fade after a few seconds (still read aloud). */
  function notify(text: string, brief = false) {
    clearTimeout(quietTimer);
    status.classList.remove("is-quiet");
    if (status.textContent !== text) status.textContent = text;
    if (brief)
      quietTimer = setTimeout(() => status.classList.add("is-quiet"), 4000);
  }
  function stopFishing() {
    fishingUi.cancel();
    pose = { ...pose, fishing: false };
  }
  // The rail of the hub shell: one tap goes from the fish store to the market, crew or settings.
  const hubNav: HubNav = {
    available: (id) => id !== "market" || marketUi.available,
    go(id) {
      keys.clear();
      releaseStick();
      if (id === "stock") fishingUi.showStock();
      else if (id === "market") void marketUi.openNearest();
      else if (id === "crew") showCrew();
      else showSettings();
    },
  };
  const fishingUi = createFishingUi({
    root,
    button: fishButton,
    dialog,
    fightSpeed: options.fightSpeed,
    scene: () => scene,
    boat: () => pose,
    enabled: () => active && !dialog.open && !document.hidden,
    stock: () => fishStock,
    setStock: (next, caughtOne) => {
      fishStock = next;
      if (caughtOne) caught++;
      showStockCount();
      persist();
    },
    reduced,
    hubs: hubNav,
    onKeep: (fish) => marketUi.recordCatch(fish),
    onPutBack: (species) => {
      if (serverStore)
        void economy?.release(species).catch(() => void refreshStore());
    },
    sound: (cue) => seaAudio.play(cue),
  });
  // The fish markets: a Bán button near a pier and the hub it opens (server economy only).
  const marketUi = createMarketUi({
    button: root.querySelector<HTMLButtonElement>('[data-ocean="market"]')!,
    dialog,
    economy,
    onRejected: (fish, failure) => {
      // The server will not hold this fish: take it out of the store and say why.
      fishStock = releaseOne(fishStock, fish.species);
      caught = Math.max(0, caught - 1);
      showStockCount();
      persist();
      notify(
        failure === "full"
          ? "Kho đã đầy (200 con): hãy bán bớt cá ở chợ."
          : "Con cá này chưa vào kho được.",
      );
      void refreshStore();
    },
    sound: (cue) => seaAudio.play(cue),
    stock: () => fishStock,
    setStock: (next, caughtOne) => {
      fishStock = next;
      if (caughtOne) caught++;
      showStockCount();
      persist();
    },
    beforeOpen: () => {
      keys.clear();
      releaseStick();
      fishingUi.cancel();
    },
    hubs: hubNav,
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
      notify("Đã kết nối lại biển chung.", true);
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
  /** The store button shows only the number; its name carries the count for assistive tech. */
  function showStockCount() {
    const total = String(stockTotal(fishStock));
    root.querySelector("[data-catch]")!.textContent = total;
    root
      .querySelector('[data-ocean="catch"]')
      ?.setAttribute("aria-label", `Kho cá ${total}`);
  }

  function showDialog(kind: "catch") {
    keys.clear();
    releaseStick();
    if (kind === "catch") fishingUi.showStock();
  }

  /** Crew: the boats in the sea, who is online and what they are doing. */
  function showCrew() {
    keys.clear();
    releaseStick();
    fishingUi.cancel();
    const page = createHubShell(dialog, hubNav, "crew");
    dialog.setAttribute("aria-label", "Thủy thủ");
    const here = visibleBoats().map((boat) => ({
      boat,
      you: boat.uid === connection?.uid,
      meters: Math.round(Math.hypot(boat.x - pose.x, boat.z - pose.z)),
    }));
    here.sort((a, b) => Number(b.you) - Number(a.you) || a.meters - b.meters);
    const head = document.createElement("header");
    head.className = "fish-store-head";
    const title = document.createElement("h2");
    title.textContent = "Thủy thủ";
    const total = document.createElement("span");
    total.className = "crew-count";
    total.textContent = String(here.length);
    total.setAttribute("aria-label", `${here.length} thuyền trong kênh`);
    head.append(title, total);
    const body = document.createElement("div");
    body.className = "fish-store-body";
    const list = document.createElement("ul");
    list.className = "crew-list";
    for (const { boat, you, meters } of here) {
      const li = document.createElement("li");
      li.className = `crew-row${you ? " is-you" : ""}`;
      const avatar = document.createElement("span");
      avatar.className = "crew-avatar";
      avatar.style.background = hullCss(boat.uid);
      avatar.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="#fff"><path d="M3 14h18l-3 5H6zM11 4h2v8h-2zM7 9l4-3v6H7z"/></svg>';
      const info = document.createElement("span");
      info.className = "crew-info";
      const name = document.createElement("strong");
      name.textContent = boat.name;
      const state = document.createElement("small");
      state.className = boat.fishing ? "is-fishing" : "";
      state.textContent = boat.fishing ? "Đang câu" : "Đang trên biển";
      info.append(name, state);
      li.append(avatar, info);
      if (you) {
        const mark = document.createElement("span");
        mark.className = "crew-you";
        mark.textContent = "Bạn";
        li.append(mark);
      } else {
        const far = document.createElement("span");
        far.className = "crew-far";
        far.textContent = `${meters} m`;
        li.append(far);
      }
      list.append(li);
    }
    body.append(list);
    page.append(head, body);
    if (!dialog.open) dialog.showModal();
  }

  /**
   * Settings: everything that is not part of playing. The way back to the harbor, the day and
   * weather test and the version live here, so the sea's screen has only what the game needs:
   * the stick, the rod, the fish store, the market and the map.
   */
  function showSettings() {
    keys.clear();
    releaseStick();
    fishingUi.cancel();
    const page = createHubShell(dialog, hubNav, "settings");
    dialog.setAttribute("aria-label", "Cài đặt");
    const head = document.createElement("header");
    head.className = "fish-store-head";
    const title = document.createElement("h2");
    title.textContent = "Cài đặt";
    head.append(title);
    const body = document.createElement("div");
    body.className = "fish-store-body settings-body";
    body.append(
      createAudioSection(seaAudio),
      createWeatherTestSection(),
      createPerfSection(perfPanel),
      createProbeSection(persist),
      createWavesSection(persist),
      createUpdateSection({ beforeApply: persist }),
    );
    const foot = document.createElement("footer");
    foot.className = "settings-foot";
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "button settings-leave";
    leave.dataset.ocean = "back";
    leave.textContent = "Về sảnh";
    leave.addEventListener("click", () => {
      dialog.close();
      back();
    });
    foot.append(leave);
    page.append(head, body, foot);
    if (!dialog.open) dialog.showModal();
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
    const frameStart = lastControl;
    lastControl = now;
    const playable = active && !document.hidden && !dialog.open;
    if (!playable) {
      boatControl.update(0, noKeys, noStick, false, false);
      scene?.setInput(0, 0);
    }
    if (playable) {
      fishingUi.tick(now);
      // Stick, keys and the fishing pause become one command in boat-control.ts. While casting,
      // the boat gets no thrust and drag brings it to rest.
      const command = boatControl.update(
        (now - frameStart) / 1000,
        {
          left: keys.has("left"),
          right: keys.has("right"),
          up: keys.has("up"),
          down: keys.has("down"),
        },
        stick,
        true,
        pose.fishing,
      );
      scene?.setInput(command.steer, command.throttle);
      const state = scene?.selfState();
      if (state)
        pose = {
          x: Math.max(-SEA_BOUND, Math.min(SEA_BOUND, state.x)),
          z: Math.max(-SEA_BOUND, Math.min(SEA_BOUND, state.z)),
          heading: state.heading,
          fishing: fishingUi.fishing,
        };
      marketUi.update(pose.x, pose.z, !pose.fishing);
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
    perfPanel.tick(now);
    // Draw the sea even while connecting or offline; boats appear once connected.
    if (scene && pacer.frame(now)) {
      const shown = drawnBoats(visible, now);
      // The minimap is redrawn ten times a second, not every frame.
      if (now - lastMap >= 100) {
        lastMap = now;
        minimap.update(
          active && connection ? { ...pose, uid: connection.uid } : undefined,
          shown.filter((boat) => boat.uid !== connection?.uid),
          now / 1000,
        );
      }
      const own = scene.selfState();
      seaAudio.update({
        speed: own ? Math.hypot(own.forwardSpeed, own.sideSpeed) : 0,
        rain: SEA.weather.z,
        gloom: SEA.weather.y,
        tension: fishingUi.lineTension(now),
      });
      const began = performance.now();
      scene.update(
        shown,
        connection?.uid ?? "",
        now / 1000,
        (now - lastDraw) / 1000,
        reduced,
      );
      if (perfLog) {
        // With ?perf in the address: every long frame (the gap since the last drawn frame, and how
        // long the update itself took) goes to window.__seaHitches, for a bug report.
        const gap = now - lastDraw;
        if (lastDraw > 0 && gap > 80) {
          const stats = scene.stats();
          const self = scene.selfState();
          hitches.push({
            at: Math.round(now),
            gapMs: Math.round(gap),
            updateMs: Math.round(performance.now() - began),
            mode: pacer.mode,
            speed: self
              ? +Math.hypot(self.forwardSpeed, self.sideSpeed).toFixed(1)
              : 0,
            renderScale: +stats.renderScale.toFixed(2),
            clearWater: stats.clearWater,
          });
          if (hitches.length > 60) hitches.shift();
        }
      }
      perfPanel.frame(now, now - lastDraw, performance.now() - began);
      lastDraw = now;
    }
    frame = requestAnimationFrame(animate);
  }
  // Every touch goes through one transparent layer (see ocean/input-layer.ts): the
  // controls are only drawn, so a long press has nothing to turn into a browser menu and
  // nothing that can cancel a held action. Fishing acts on the press itself (press to
  // charge a throw, or to pull when a fish is on; let go to throw). Keyboard and
  // assistive activation still arrive as `click`.
  let fishTouchedAt = -1e9;
  const control = (name: string) =>
    root.querySelector<HTMLElement>(`[data-ocean="${name}"]`)!;
  const inputTargets: InputTarget[] = [
    {
      element: fishButton,
      kind: "press",
      down: () => {
        fishTouchedAt = performance.now();
        fishingUi.press();
      },
      up: () => {
        fishTouchedAt = performance.now();
        fishingUi.release();
      },
    },
    {
      element: control("market"),
      kind: "tap",
      tap: () => void marketUi.openNearest(),
    },
    {
      element: control("settings"),
      kind: "tap",
      tap: () => showSettings(),
    },
    {
      element: control("catch"),
      kind: "tap",
      tap: () => showDialog("catch"),
    },
  ];
  const releaseInput = bindInputLayer(
    root.querySelector<HTMLElement>(".ocean-input")!,
    {
      targets: () => [
        ...fishingUi
          .hangTargets()
          .map((target): InputTarget => ({ ...target, kind: "tap" })),
        ...inputTargets,
      ],
      stick: {
        controller: stickController,
        ring: stickElement,
        zone: root.querySelector<HTMLElement>(".ocean-stick-zone")!,
        enabled: () => active && !dialog.open,
      },
      // Dragging on open sea looks around the boat; the view eases back when it moves.
      look: {
        enabled: () => active && !dialog.open,
        hold: (on) => scene?.orbitHold(on),
        drag: (dx, dy) => scene?.orbitBy(dx, dy),
      },
      signal: abort.signal,
    },
  );
  for (const surface of [root, dialog])
    surface.addEventListener("contextmenu", (event) => event.preventDefault(), {
      signal: abort.signal,
    });
  root.addEventListener(
    "click",
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-ocean]",
      )?.dataset.ocean;
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
      if (action === "settings") showSettings();
      if (action === "catch") showDialog(action);
      if (action === "market") void marketUi.openNearest();
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
      releaseInput();
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
      releaseInput();
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
    .then(async (created) => {
      if (disposed) {
        created.dispose();
        throw new HubError("Đã rời biển.");
      }
      scene = created;
      options.onScene?.(created);
      // The loading screen stays until the sea, the boats and their shaders are really
      // ready, so the map never pops in half built (bounded: a stuck shader must not
      // keep the player here for ever).
      await Promise.race([
        created.ready(),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      clearTimeout(graphicsTimer);
      step("graphics", "done");
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
    .then(async ([created, value]) => {
      if (disposed || network.signal.aborted) {
        value.dispose();
        return;
      }
      connection = value;
      // Resume where the boat last was on this device, else start in the shared harbor
      // (whatever start pose the server assigns, the client's own wins once published).
      selfUid = value.uid;
      const restored = decodeSave(stored.read(saveKey(value.uid)));
      const remote = await loadServerStore(restored);
      if (disposed) return;
      serverStore = remote !== undefined;
      pose = remote?.pose ?? restored.pose ?? spawn(value.uid);
      caught = remote ? remote.caught : restored.caught;
      fishStock = remote ? remote.fish : restored.fish;
      if (serverStore) persist();
      showStockCount();
      created.spawnSelf(value.uid, "Bạn", pose);
      step("enter", "done");
      setChromeColor(CHROME_COLORS.sea);
      active = true;
      // The first pose goes out about half a second after entering (not a full second),
      // late enough for the server's rate limit, early enough that others see the real spot.
      lastPublish = performance.now() - 500;
      lastPose = "";
      fishButton.disabled = false;
      hideLoading();
      notify("Đã vào biển chung. Lái thuyền và thả câu khi bạn muốn.", true);
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
    clearTimeout(quietTimer);
    // Leaving: save the boat now, whatever was saved a moment ago.
    lastPoseSave = 0;
    persist();
    marketUi.dispose();
    fishingUi.dispose();
    seaAudio.dispose();
    cancelAnimationFrame(frame);
    stopLoadingArt?.();
    abort.abort();
    network.abort();
    connection?.dispose();
    scene?.dispose();
    perfPanel.dispose();
    dialog.remove();
    root.classList.remove("ocean-root");
    if (barBefore) setChromeColor(barBefore);
    root.replaceChildren();
  }
  return dispose;
}
