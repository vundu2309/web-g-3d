import { move, PRESENCE_MS, type Boat, type Pose } from "../ocean/model";
import { HubError } from "../hub/model";
import type { connectOcean } from "../platform/ocean";
import { OceanScene } from "../ocean/scene";

type Connection = Awaited<ReturnType<typeof connectOcean>>;
export function startOcean(root: HTMLElement, back: () => void) {
  const abort = new AbortController();
  const network = new AbortController();
  root.classList.add("ocean-root");
  root.innerHTML = `<main class="ocean-screen" aria-label="Map biển chung"><div class="ocean-stage"></div><div class="ocean-hud game-safe"><header class="ocean-top"><button class="ocean-chip" data-ocean="back" aria-label="Về hub">← <span>Về hub</span></button><div class="ocean-channel"><strong>Biển chung</strong><span>Mỗi người một thuyền</span></div><button class="ocean-chip" data-ocean="crew" aria-label="Thuyền trong kênh"><span data-count>Đang kết nối…</span></button></header><p class="ocean-status" role="status" aria-live="polite">Đang kết nối map chung…</p><section class="ocean-bottom" aria-label="Điều khiển thuyền"><div class="ocean-steering" aria-label="Lái thuyền"><button data-steer="up" aria-label="Tiến">▲</button><button data-steer="left" aria-label="Rẽ trái">◀︎</button><span aria-hidden="true">⚓</span><button data-steer="right" aria-label="Rẽ phải">▶︎</button><button data-steer="down" aria-label="Lùi">▼</button></div><p class="ocean-hint">WASD / phím mũi tên để lái<br/>Space để thả câu</p><div class="ocean-actions"><button class="ocean-chip" data-ocean="catch">Kho cá <strong data-catch>0</strong></button><button class="ocean-fish" data-ocean="fish" disabled>Thả câu</button></div></section></div></main>`;
  const status = root.querySelector<HTMLElement>(".ocean-status")!;
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const fishButton = root.querySelector<HTMLButtonElement>(
    '[data-ocean="fish"]',
  )!;
  const steering = root.querySelector<HTMLElement>(".ocean-steering")!;
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
  let previous = performance.now();
  let lastDraw = 0;
  let lastPublish = 0;
  let lastPose = "";
  let clockOffset = 0;
  let caught = 0;
  let castAt = 0;
  let biteAt = 0;
  let catchTimer: ReturnType<typeof setTimeout> | undefined;
  let biteTimer: ReturnType<typeof setTimeout> | undefined;
  const keys = new Set<string>();
  const touches = new Map<number, string>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function notify(text: string) {
    if (status.textContent !== text) status.textContent = text;
  }
  function stopFishing() {
    clearTimeout(catchTimer);
    clearTimeout(biteTimer);
    pose = { ...pose, fishing: false };
    castAt = 0;
    biteAt = 0;
    fishButton.textContent = "Thả câu";
  }
  function fail(error: unknown) {
    if (disposed) return;
    active = false;
    keys.clear();
    touches.clear();
    stopFishing();
    fishButton.disabled = true;
    notify(
      error instanceof HubError
        ? error.message
        : "Mất kết nối biển chung. Hãy về hub rồi vào lại. Nếu chưa từng vào được, kết nối game có thể chưa sẵn sàng.",
    );
    network.abort();
    connection?.dispose();
  }
  function fish() {
    if (!active || dialog.open) return;
    if (pose.fishing) {
      if (biteAt && performance.now() - biteAt <= 2500) {
        caught++;
        root.querySelector("[data-catch]")!.textContent = String(caught);
        stopFishing();
        notify("Đã kéo được cá! Cá chỉ tính trong chuyến này.");
      } else {
        stopFishing();
        notify("Đã thu cần. Đợi cá cắn câu rồi kéo nhé.");
      }
      return;
    }
    keys.clear();
    touches.clear();
    pose = { ...pose, fishing: true };
    castAt = performance.now();
    fishButton.textContent = "Thu cần";
    notify("Đã thả câu… chờ cá cắn!");
    biteTimer = setTimeout(
      () => {
        if (!active || !castAt) return;
        biteAt = performance.now();
        fishButton.textContent = "Kéo cá!";
        notify("Cá cắn câu! Bấm Kéo cá ngay.");
        catchTimer = setTimeout(() => {
          stopFishing();
          notify("Cá đã bơi mất. Thử thả câu lần nữa.");
        }, 2500);
      },
      2500 + Math.random() * 2000,
    );
  }
  function showDialog(kind: "crew" | "catch") {
    keys.clear();
    touches.clear();
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
      text.textContent = `Bạn đã bắt ${caught} con cá trong chuyến này. Đây là trải nghiệm câu cá; chưa lưu cá, mua bán hoặc tiền thưởng.`;
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
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (active && !document.hidden && !dialog.open) {
      const controls = new Set([...keys, ...touches.values()]);
      const steer =
        Number(controls.has("right")) - Number(controls.has("left"));
      const throttle =
        Number(controls.has("up")) - Number(controls.has("down"));
      pose = move(pose, steer, throttle, dt);
      const serialized = JSON.stringify(pose);
      if (
        now - lastPublish >= 1000 &&
        (serialized !== lastPose || now - lastPublish >= 10000)
      ) {
        lastPublish = now;
        lastPose = serialized;
        void connection?.publish(pose).catch(fail);
      }
    }
    const visible = active ? visibleBoats() : [];
    const text = active ? `${visible.length} thuyền` : "Chưa kết nối";
    if (count.textContent !== text) count.textContent = text;
    if (connection && scene && now - lastDraw >= 33) {
      scene.update(
        visible,
        connection.uid,
        pose,
        now / 1000,
        (now - lastDraw) / 1000,
        reduced,
      );
      lastDraw = now;
    }
    frame = requestAnimationFrame(animate);
  }
  root.addEventListener(
    "click",
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-ocean]",
      )?.dataset.ocean;
      if (action === "back") back();
      if (action === "fish") fish();
      if (action === "crew" || action === "catch") showDialog(action);
    },
    { signal: abort.signal },
  );
  steering.addEventListener(
    "pointerdown",
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-steer]",
      );
      if (!button || !active) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, button.dataset.steer!);
    },
    { signal: abort.signal },
  );
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    steering.addEventListener(
      event,
      (event) => touches.delete((event as PointerEvent).pointerId),
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
      if (
        event.code === "Space" &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();
        if (!event.repeat) fish();
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
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "blur",
    () => {
      keys.clear();
      touches.clear();
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
      touches.clear();
      if (document.hidden) stopFishing();
    },
    { signal: abort.signal },
  );
  try {
    scene = new OceanScene(root.querySelector(".ocean-stage")!, () =>
      fail(new HubError("Đồ họa đã tạm dừng. Hãy về hub rồi mở lại game.")),
    );
  } catch {
    notify(
      "Thiết bị chưa mở được đồ họa 3D. Hãy bật WebGL hoặc dùng trình duyệt khác.",
    );
  }
  frame = requestAnimationFrame(animate);
  const timeout = setTimeout(() => {
    if (!active) {
      fail(new HubError("Kết nối biển chung quá lâu. Hãy về hub rồi thử lại."));
      network.abort();
    }
  }, 15000);
  if (scene)
    void import("../platform/ocean")
      .then(({ connectOcean }) =>
        connectOcean(
          (value, serverTime) => {
            boats = value;
            clockOffset = serverTime - Date.now();
          },
          fail,
          network.signal,
        ),
      )
      .then((value) => {
        if (disposed || network.signal.aborted) {
          value.dispose();
          return;
        }
        connection = value;
        pose = value.pose;
        active = true;
        lastPublish = performance.now();
        lastPose = JSON.stringify(pose);
        fishButton.disabled = false;
        clearTimeout(timeout);
        notify("Đã vào biển chung. Lái thuyền và thả câu khi bạn muốn.");
      })
      .catch(fail);
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    clearTimeout(catchTimer);
    clearTimeout(biteTimer);
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
