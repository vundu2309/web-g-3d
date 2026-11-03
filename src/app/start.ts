import { canStart, HubError, playerName, roomCode } from "../hub/model";
import type { Capacity, Room } from "../hub/model";
import type { RoomStore } from "../hub/store";
import { emblem, icon, pawn } from "../ui/art";

type Page = "home" | "create" | "join" | "help" | "lobby" | "rooms";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const message = (error: unknown) => {
  if (error instanceof HubError) return error.message;
  const code = (error as { code?: string })?.code;
  if (
    code === "auth/operation-not-allowed" ||
    code === "auth/admin-restricted-operation"
  )
    return "Chơi online chưa sẵn sàng: cần bật đăng nhập Email/Password trong Firebase. Bạn có thể thử giao diện trên thiết bị này.";
  if (code === "auth/unauthorized-domain")
    return "Tên miền này chưa được cho phép trong Firebase Authentication.";
  if (
    code === "PERMISSION_DENIED" ||
    code === "permission-denied" ||
    code === "database/permission-denied"
  )
    return "Chưa truy cập được dữ liệu player/phòng. Hãy kiểm tra Cloud Firestore và Security Rules.";
  if (code === "failed-precondition")
    return "Cloud Firestore chưa sẵn sàng hoặc thiếu index danh sách phòng. Hãy kiểm tra cấu hình Firestore.";
  return "Chưa kết nối được phòng online. Kiểm tra mạng hoặc thử lại. Bạn cũng có thể thử trên thiết bị này.";
};
export function start(root: HTMLElement): () => void {
  let page: Page = "home";
  let mode: "online" | "demo" =
    sessionStorage.getItem("hub:mode") === "demo" ? "demo" : "online";
  let store: RoomStore | undefined;
  let connecting: Promise<RoomStore> | undefined;
  let connectionGeneration = 0;
  let room: Room | null = null;
  let code = sessionStorage.getItem("hub:room") || "";
  let stopWatch: (() => void) | undefined;
  let busy = false;
  let disposed = false;
  let leaving = false;
  let errorText = "";
  let confirmLeave = false;
  let draftName = localStorage.getItem("hub:name") || "";
  let draftCode = "";
  let capacity: Capacity = 4;
  let draftTitle = "";
  let accountName = "";
  let listing: { code: string; room: Room }[] = [];
  let listingLoading = false;
  let stopList: (() => void) | undefined;
  let stopAuth: (() => void) | undefined;
  const abort = new AbortController();
  const toast = document.querySelector<HTMLElement>("#announcement")!;
  const announce = (text: string) => {
    toast.textContent = text;
  };
  const button = (
    action: string,
    label: string,
    glyph: string,
    style = "primary",
    disabled = false,
  ) =>
    `<button class="button ${style}" data-action="${action}" ${disabled ? "disabled" : ""}>${icon(glyph)}<span>${label}</span></button>`;
  const brand = `<a class="mini-brand" href="#home" aria-label="Phố Tỷ Phú, trang chính">Phố<br/>Tỷ Phú</a>`;
  function header() {
    return `<header class="topbar">${button(page === "lobby" ? "leave" : "back", page === "lobby" ? "Rời phòng" : "Quay lại", "back", "compact secondary")} ${brand}</header>`;
  }
  const notice = () =>
    `<p class="form-error" role="alert" ${errorText ? "" : "hidden"}>${escape(errorText)}</p>`;
  const modeLabel = () =>
    `<span class="mode-label">${mode === "demo" ? "Bản thử · Chỉ cùng trình duyệt" : "Chơi online · Firebase"}</span>`;
  function render(focus = false) {
    if (disposed) return;
    const activeAction = (document.activeElement as HTMLElement | null)?.dataset
      .action;
    let content: string;
    if (page === "home") {
      content = `<main class="home" aria-labelledby="page-title"><section class="identity"><h1 id="page-title" class="wordmark">Phố<br/>Tỷ Phú</h1>${emblem}</section><section class="home-actions" aria-label="Chọn cách vào phòng"><p class="tagline">Cùng bạn bè làm chủ cuộc chơi</p>${button("create", "Tạo phòng", "plus")}${button("join", "Tham gia phòng", "door", "secondary")}<a class="help-link" href="#help">${icon("help")}Cách chơi</a>${mode === "online" ? `<div class="account-bar">${accountName ? `<span>Player: ${escape(accountName)}</span><button class="text-button" data-action="logout">Đăng xuất</button>` : `<button class="text-button" data-action="account">Đăng nhập / Đăng ký</button>`}</div>` : ""}${modeLabel()}<button class="mode-switch" data-action="mode">${mode === "online" ? "Thử trên thiết bị này" : "Chuyển sang chơi online"}</button><p class="mode-note">${mode === "demo" ? "Mở thêm tab để thử cùng nhau. Không kết nối người chơi trên thiết bị khác." : "Tạo phòng riêng và gửi mã cho bạn bè."}</p>${notice()}</section></main>`;
    } else if (page === "rooms") {
      content = `${header()}<main class="rooms-page"><h1 id="page-title">Chọn phòng</h1><p>Chọn phòng của bạn bè hoặc nhập mã phòng.</p><div class="room-directory" aria-live="polite">${
        listingLoading
          ? "<p>Đang tải danh sách phòng…</p>"
          : listing.length
            ? listing
                .map(({ code, room }) => {
                  const count = Object.keys(room.players).length;
                  return `<article class="room-row"><div><h2>${escape(room.title || "Phòng bạn bè")}</h2><p>Chủ phòng: ${escape(room.players[room.hostId]?.name || "Người chơi")}</p></div><span>${count}/${room.capacity}</span><button class="button secondary" data-action="pick-room" data-code="${escape(code)}" ${busy || count >= room.capacity ? "disabled" : ""}>${count >= room.capacity ? "Đã đầy" : "Vào phòng"}</button></article>`;
                })
                .join("")
            : "<p>Chưa có phòng đang chờ. Hãy tạo phòng để mời bạn bè.</p>"
      }</div>${notice()}<div class="directory-actions">${button("join-code", "Nhập mã phòng", "door", "secondary")}${button("create", "Tạo phòng", "plus")}</div></main>`;
    } else if (page === "create" || page === "join") {
      const create = page === "create";
      content = `${header()}<main class="form-page" aria-labelledby="page-title"><h1 id="page-title">${icon(create ? "plus" : "door")}${create ? "Tạo phòng" : "Tham gia phòng"}</h1><form id="room-form" novalidate><div class="form-row"><label for="player-name">Tên của bạn</label><input id="player-name" name="name" autocomplete="nickname" maxlength="24" required placeholder="Bạn tên là gì?" value="${escape(draftName)}" ${mode === "online" ? "readonly" : ""} ${busy ? "disabled" : ""}/></div>${create ? `<div class="form-row"><label for="room-title">Tên phòng</label><input id="room-title" name="title" maxlength="24" placeholder="Ví dụ: Hội bạn cuối tuần" value="${escape(draftTitle)}" ${busy ? "disabled" : ""}/></div><fieldset class="form-row"><legend>Số người chơi</legend><div class="capacity" aria-label="Số người chơi">${[2, 3, 4].map((n) => `<label><input type="radio" name="capacity" value="${n}" ${capacity === n ? "checked" : ""} ${busy ? "disabled" : ""}/><span>${n}</span></label>`).join("")}</div></fieldset>` : `<div class="form-row"><label for="room-code">Mã phòng</label><div><input id="room-code" name="code" class="code-input" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="6" placeholder="Nhập mã 6 ký tự" value="${escape(draftCode)}" aria-describedby="code-hint" ${busy ? "disabled" : ""}/><p id="code-hint" class="field-hint">Nhờ bạn bè gửi mã phòng để tham gia.</p></div></div>`}${notice()}<button class="button primary" type="submit" ${busy ? "disabled" : ""}>${icon(create ? "plus" : "door")}<span>${busy ? "Đang kết nối…" : create ? "Tạo phòng" : "Vào phòng"}</span></button><button class="text-button cancel" data-action="back" type="button" ${busy ? "disabled" : ""}>Hủy</button></form>${modeLabel()}<button class="mode-switch" data-action="mode" ${busy ? "disabled" : ""}>${mode === "online" ? "Thử trên thiết bị này" : "Chuyển sang chơi online"}</button></main>`;
    } else if (page === "help") {
      content = `${header()}<main class="help-page" aria-labelledby="page-title"><h1 id="page-title">Cách chơi</h1><ol class="instructions"><li><strong>Tạo phòng</strong><p>Nhập tên và chọn tối đa 2–4 người chơi.</p></li><li><strong>Mời bạn bè</strong><p>Gửi mã 6 ký tự. Bạn bè chọn “Tham gia phòng”, nhập tên và mã.</p></li><li><strong>Cùng sẵn sàng</strong><p>Khi có ít nhất 2 người và tất cả đã sẵn sàng, chủ phòng có thể bắt đầu.</p></li></ol><p class="scope-note">Hiện tại là bản hub: tạo phòng, tham gia và sẵn sàng. Bàn chơi, xúc xắc và mua bán đất sẽ được phát triển ở bước tiếp theo.</p>${button("back", "Về trang chính", "back")}</main>`;
    } else {
      const self = store && room?.players[store.uid];
      const host = room?.hostId === store?.uid;
      const players = Object.entries(room?.players || {}).sort(
        (a, b) => a[1].seat - b[1].seat,
      );
      const started = room?.status === "started";
      const reason = !room
        ? "Đang tải phòng…"
        : players.length < 2
          ? "Mời thêm ít nhất một người bạn"
          : players.some(([, p]) => !p.ready)
            ? `Chờ ${players
                .filter(([, p]) => !p.ready)
                .map(([, p]) => p.name)
                .join(", ")} sẵn sàng`
            : "Mọi người đã sẵn sàng!";
      content = `${header()}<main class="lobby-page" aria-labelledby="page-title"><h1 id="page-title">${started ? "Phòng đã sẵn sàng" : "Phòng chờ"}</h1><div class="invite-strip"><span>Mã phòng: <strong class="room-code">${escape(code)}</strong></span><button class="copy-button" data-action="copy">${icon("copy")}Sao chép mã</button><span>${players.length}/${room?.capacity || capacity} người chơi</span><span class="room-mode">${mode === "demo" ? "Bản thử" : "Online"}</span></div><div class="players" aria-label="Người chơi">${Array.from(
        { length: room?.capacity || capacity },
        (_, i) => {
          const entry = players[i];
          if (!entry)
            return `<div class="player-slot empty">${pawn(4)}<p>Đang chờ bạn…</p></div>`;
          const [uid, player] = entry;
          return `<article class="player-slot">${pawn(player.seat)}<h2>${escape(player.name)}${uid === store?.uid ? "<small> (Bạn)</small>" : ""}</h2><p class="host-label">${uid === room?.hostId ? "♛ Chủ phòng" : "&nbsp;"}</p><span class="ready-status ${player.ready ? "is-ready" : ""}">${icon(player.ready ? "check" : "clock")}${player.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}</span></article>`;
        },
      ).join(
        "",
      )}</div>${notice()}<div class="lobby-controls">${started ? `<p class="session-note">Hub đã hoàn tất. Bàn chơi đang được phát triển.</p>${button("leave", "Rời phòng", "back", "secondary")}` : host ? `${button("start", busy ? "Đang bắt đầu…" : "Bắt đầu", "play", "primary", busy || !room || !canStart(room))}<p class="waiting-reason" role="status">${escape(reason)}</p>` : `${button("ready", busy ? "Đang cập nhật…" : self?.ready ? "Hủy sẵn sàng" : "Sẵn sàng", "check", self?.ready ? "secondary" : "primary", busy || !self)}<p class="waiting-reason">Chủ phòng sẽ bắt đầu khi mọi người sẵn sàng.</p>`}</div></main>`;
    }
    root.innerHTML =
      content +
      (confirmLeave
        ? `<div class="dialog-scrim"><section class="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title"><h2 id="leave-title">${room?.hostId === store?.uid ? "Đóng phòng này?" : "Rời phòng này?"}</h2><p>${room?.hostId === store?.uid ? "Bạn là chủ phòng. Rời phòng sẽ đóng phòng với tất cả người chơi." : "Bạn có thể tham gia lại bằng mã phòng nếu còn chỗ."}</p>${button("cancel-leave", "Ở lại", "back", "secondary")}${button("confirm-leave", "Rời phòng", "door", "primary", busy)}</section></div>`
        : "");
    root.setAttribute("aria-busy", String(busy));
    if (confirmLeave)
      root
        .querySelector<HTMLButtonElement>('[data-action="cancel-leave"]')
        ?.focus();
    else if (focus) {
      const title = root.querySelector<HTMLElement>("h1");
      if (title) {
        title.tabIndex = -1;
        title.focus();
      }
    } else if (activeAction)
      root
        .querySelector<HTMLButtonElement>(`[data-action="${activeAction}"]`)
        ?.focus();
  }
  function navigate(next: Page) {
    if (busy) return;
    stopList?.();
    stopList = undefined;
    page = next;
    announce("");
    errorText = "";
    confirmLeave = false;
    history.pushState(null, "", `#${next}`);
    render(true);
  }
  async function enter(next: "create" | "rooms" | "join") {
    if (mode === "online") {
      const { requirePlayer } = await import("./account");
      const user = await requirePlayer(abort.signal);
      if (!user || disposed) return;
      accountName =
        user.displayName || user.email?.split("@")[0] || "Người chơi";
      draftName = accountName;
    }
    navigate(next);
    if (next === "rooms") {
      listing = [];
      listingLoading = true;
      render();
      try {
        const connected = await connect();
        if (disposed || page !== "rooms") return;
        stopList = connected.list(
          (rooms) => {
            listing = rooms.sort((a, b) => b.room.createdAt - a.room.createdAt);
            listingLoading = false;
            if (page === "rooms") render();
          },
          (error) => {
            listingLoading = false;
            errorText = message(error);
            if (page === "rooms") render();
          },
        );
      } catch (error) {
        listingLoading = false;
        errorText = message(error);
        render();
      }
    }
  }
  async function connect(): Promise<RoomStore> {
    if (store) return store;
    if (connecting) return connecting;
    const generation = connectionGeneration;
    const requestedMode = mode;
    connecting = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const candidate = await Promise.race([
          requestedMode === "demo"
            ? import("../platform/demo").then((module) =>
                module.createDemoStore(),
              )
            : import("../platform/firebase").then((module) =>
                module.createFirebaseStore(),
              ),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new HubError("Kết nối quá lâu. Kiểm tra mạng rồi thử lại."),
                ),
              25000,
            );
          }),
        ]);
        if (disposed || generation !== connectionGeneration) {
          candidate.dispose();
          throw new HubError("Chế độ chơi đã thay đổi. Hãy thử lại.");
        }
        store = candidate;
        return candidate;
      } finally {
        clearTimeout(timer);
        if (generation === connectionGeneration) connecting = undefined;
      }
    })();
    return connecting;
  }
  function clearRoom() {
    stopWatch?.();
    stopWatch = undefined;
    room = null;
    code = "";
    sessionStorage.removeItem("hub:room");
    confirmLeave = false;
  }
  function watchRoom() {
    page = "lobby";
    sessionStorage.setItem("hub:room", code);
    history.replaceState(null, "", "#lobby");
    stopWatch?.();
    stopWatch = store!.watch(
      code,
      (value) => {
        if (disposed || leaving) return;
        if (!value || !value.players[store!.uid]) {
          clearRoom();
          page = "home";
          errorText =
            "Phòng đã đóng hoặc bạn không còn trong phòng. Hãy tạo phòng mới hoặc tham gia lại.";
          history.replaceState(null, "", "#home");
        } else {
          room = value;
          errorText = "";
        }
        render();
      },
      (error) => {
        errorText = message(error);
        render();
      },
    );
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    announce("");
    errorText = "";
    render();
    try {
      await action();
    } catch (error) {
      errorText = message(error);
    } finally {
      busy = false;
      render();
    }
  }
  root.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (busy) return;
      const form = event.target as HTMLFormElement;
      const data = new FormData(form);
      draftName = String(data.get("name") || "");
      draftCode = String(data.get("code") || "");
      capacity = Number(data.get("capacity") || capacity) as Capacity;
      draftTitle = String(data.get("title") || draftTitle);
      try {
        draftName = playerName(draftName);
        if (page === "create")
          draftTitle = playerName(draftTitle || "Phòng bạn bè");
        if (page === "join") draftCode = roomCode(draftCode);
      } catch (error) {
        errorText = message(error);
        render();
        root
          .querySelector<HTMLInputElement>(
            draftName.trim() ? "#room-code" : "#player-name",
          )
          ?.focus();
        return;
      }
      const creating = page === "create";
      void perform(async () => {
        const connected = await connect();
        if (creating)
          code = await connected.create(draftName, capacity, draftTitle);
        else {
          await connected.join(draftCode, draftName);
          code = draftCode;
        }
        localStorage.setItem("hub:name", draftName);
        watchRoom();
      });
    },
    { signal: abort.signal },
  );
  root.addEventListener(
    "input",
    (event) => {
      const input = event.target as HTMLInputElement;
      if (errorText) {
        errorText = "";
        root
          .querySelector<HTMLElement>(".form-error")
          ?.setAttribute("hidden", "");
      }
      if (input.name === "title") draftTitle = input.value;
      if (input.name === "name") draftName = input.value;
      if (input.name === "code") draftCode = input.value;
      if (input.name === "capacity") capacity = Number(input.value) as Capacity;
    },
    { signal: abort.signal },
  );
  root.addEventListener(
    "click",
    (event) => {
      const control = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      const action = control?.dataset.action;
      if (!action || busy) return;
      if (action === "create" || action === "join" || action === "join-code")
        void enter(
          action === "join"
            ? "rooms"
            : action === "join-code"
              ? "join"
              : "create",
        ).catch((error) => {
          errorText = message(error);
          render();
        });
      if (action === "account")
        void import("./account")
          .then(({ requirePlayer }) => requirePlayer(abort.signal))
          .then((user) => {
            if (user && !disposed) {
              accountName =
                user.displayName || user.email?.split("@")[0] || "Người chơi";
              draftName = accountName;
              render();
            }
          })
          .catch((error) => {
            errorText = message(error);
            render();
          });
      if (action === "logout")
        void perform(async () => {
          const { logoutPlayer } = await import("../platform/account");
          connectionGeneration++;
          connecting = undefined;
          await logoutPlayer();
          accountName = "";
          draftName = "";
          store?.dispose();
          store = undefined;
        });
      if (action === "pick-room") {
        const selected = control?.dataset.code;
        if (selected)
          void perform(async () => {
            const connected = await connect();
            await connected.join(selected, draftName);
            stopList?.();
            stopList = undefined;
            code = selected;
            watchRoom();
          });
      }
      if (action === "back") navigate("home");
      if (action === "mode") {
        stopList?.();
        stopList = undefined;
        store?.dispose();
        store = undefined;
        connectionGeneration++;
        connecting = undefined;
        mode = mode === "online" ? "demo" : "online";
        sessionStorage.setItem("hub:mode", mode);
        errorText = "";
        render();
        announce(
          mode === "demo"
            ? "Đã chuyển sang bản thử trên thiết bị này."
            : "Đã chuyển sang chơi online.",
        );
      }
      if (action === "copy") {
        void navigator.clipboard.writeText(code).then(
          () => announce("Đã sao chép mã phòng."),
          () => announce(`Không sao chép được. Mã phòng: ${code}`),
        );
      }
      if (action === "leave") {
        confirmLeave = true;
        render();
      }
      if (action === "cancel-leave") {
        confirmLeave = false;
        render();
      }
      if (action === "confirm-leave")
        void perform(async () => {
          leaving = true;
          try {
            await store!.command(code, { type: "leave", uid: store!.uid });
            clearRoom();
            page = "home";
            history.replaceState(null, "", "#home");
          } finally {
            leaving = false;
            confirmLeave = false;
          }
        });
      if (action === "ready")
        void perform(() =>
          store!.command(code, {
            type: "ready",
            uid: store!.uid,
            ready: !room!.players[store!.uid]!.ready,
          }),
        );
      if (action === "start")
        void perform(() =>
          store!.command(code, { type: "start", uid: store!.uid }),
        );
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "hashchange",
    () => {
      if (code) {
        history.replaceState(null, "", "#lobby");
        return;
      }
      if (busy) return;
      const next = location.hash.slice(1);
      if (["create", "join", "rooms"].includes(next)) {
        void enter(next as "create" | "join" | "rooms").catch((error) => {
          errorText = message(error);
          render();
        });
        return;
      }
      stopList?.();
      stopList = undefined;
      page = next === "help" ? "help" : "home";
      errorText = "";
      render(true);
    },
    { signal: abort.signal },
  );
  root.addEventListener(
    "keydown",
    (event) => {
      if (!confirmLeave) return;
      if (event.key === "Escape" && !busy) {
        confirmLeave = false;
        render();
      }
      if (event.key === "Tab") {
        const buttons = Array.from(
          root.querySelectorAll<HTMLButtonElement>(
            ".leave-dialog button:not(:disabled)",
          ),
        );
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    },
    { signal: abort.signal },
  );
  render();
  if (code)
    void perform(async () => {
      await connect();
      watchRoom();
    });
  else {
    const requested = location.hash.slice(1);
    if (["create", "join", "help"].includes(requested)) {
      if (requested === "help") {
        page = "help";
        render();
      } else
        void enter(requested as "create" | "join").catch((error) => {
          errorText = message(error);
          render();
        });
    }
  }
  if (mode === "online")
    void import("../platform/account").then(({ observePlayer }) => {
      if (disposed) return;
      stopAuth = observePlayer((user) => {
        if (disposed || mode !== "online") return;
        if (store && user?.uid !== store.uid) {
          clearRoom();
          stopList?.();
          stopList = undefined;
          store.dispose();
          store = undefined;
          page = "home";
        }
        accountName = user?.displayName || user?.email?.split("@")[0] || "";
        if (accountName) draftName = accountName;
        if (page === "home") render();
      });
    });
  return () => {
    disposed = true;
    connectionGeneration++;
    stopAuth?.();
    stopList?.();
    abort.abort();
    stopWatch?.();
    store?.dispose();
    root.innerHTML = "";
  };
}
