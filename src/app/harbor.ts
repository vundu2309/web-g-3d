import "../ocean/style.css";
import { wakeApi } from "../platform/wake";
import { stockTotal } from "../ocean/fishing";
import { decodeSave, saveKey } from "../ocean/save";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const BOAT =
  '<svg viewBox="0 0 120 56" width="46" height="30" aria-hidden="true" focusable="false"><path d="M0 30h120l-18 22H20Z" fill="#e97760" stroke="#153b80" stroke-width="5" stroke-linejoin="round"/><rect x="48" y="4" width="38" height="26" rx="5" fill="#fff6e0" stroke="#153b80" stroke-width="5"/></svg>';
const INSTALL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12M7 11l5 5 5-5M5 20h14"/></svg>';
const PERSON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg>';

/** Fish the player holds on this device, for the captain's card. */
function fishHeld(uid: string) {
  try {
    return stockTotal(decodeSave(localStorage.getItem(saveKey(uid))).fish);
  } catch {
    return 0;
  }
}

/**
 * The game's front door: a still picture of the sea, the title, one big button. It loads
 * nothing of the sea itself (no engine, no models): that starts only when the player
 * sets out, behind a loading screen of its own (see startOcean).
 */
export function startHarbor(root: HTMLElement) {
  // Free hosting sleeps when idle; nudging it now overlaps its wake-up with the engine download.
  wakeApi();
  const abort = new AbortController();
  let disposed = false;
  let busy = false;
  let name = "";
  let uid = "";
  window.addEventListener(
    "account-password-recovery",
    () => {
      void import("./password-recovery").then(({ openPasswordRecovery }) => {
        if (!disposed) openPasswordRecovery(abort.signal);
      });
    },
    { signal: abort.signal },
  );
  let stopAuth: (() => void) | undefined;
  let stopGame: (() => void) | undefined;
  let playing = false;
  let error = "";
  function render() {
    if (disposed || playing) return;
    const captain = name
      ? `<div class="hub-avatar">${BOAT}</div><div class="hub-who"><strong>Thuyền trưởng ${escape(name)}</strong><span>🐟 ${fishHeld(uid)} cá trong kho</span></div><button class="hub-out" data-harbor="logout" ${busy ? "disabled" : ""}>Đăng xuất</button>`
      : `<div class="hub-who"><strong>Mỗi người một thuyền, một biển chung</strong><span>Đăng nhập để ra khơi cùng bạn bè</span></div>`;
    root.innerHTML = `<main class="hub" aria-labelledby="page-title"><div class="hub-art" aria-hidden="true"><svg class="hub-cloud c1" viewBox="0 0 150 56"><ellipse cx="46" cy="38" rx="42" ry="16"/><ellipse cx="86" cy="26" rx="34" ry="20"/><ellipse cx="112" cy="40" rx="34" ry="14"/></svg><svg class="hub-cloud c2" viewBox="0 0 150 56"><ellipse cx="50" cy="36" rx="44" ry="16"/><ellipse cx="94" cy="28" rx="36" ry="20"/></svg><svg class="hub-boat" viewBox="0 0 170 80"><path d="M118 8l44-6" stroke="#153b80" stroke-width="5" stroke-linecap="round"/><path d="M162 2v22" stroke="#fff" stroke-width="2.5"/><path d="M2 40h140l-22 34H26Z" fill="#e97760" stroke="#153b80" stroke-width="6" stroke-linejoin="round"/><path d="M14 52h122" stroke="#fff6e0" stroke-width="5" stroke-linecap="round"/><rect x="58" y="6" width="48" height="34" rx="6" fill="#fff6e0" stroke="#153b80" stroke-width="6"/><rect x="68" y="16" width="28" height="12" rx="3" fill="#8fd0f2" stroke="#153b80" stroke-width="3.5"/><path d="M82 6V-6" stroke="#153b80" stroke-width="5" stroke-linecap="round"/></svg></div><h1 id="page-title" class="hub-logo"><span>Ra khơi</span><small>cùng bạn</small></h1><div class="hub-tools"><button class="hub-round" data-pwa-install data-pwa-label aria-label="Cài lên điện thoại" title="Cài lên điện thoại">${INSTALL}</button>${name ? "" : `<button class="hub-round" data-harbor="account" aria-label="Đăng nhập / Đăng ký" title="Đăng nhập / Đăng ký" ${busy ? "disabled" : ""}>${PERSON}</button>`}</div><section class="hub-card" aria-label="Thuyền trưởng">${captain}</section><button class="hub-cta" data-harbor="play" ${busy ? "disabled" : ""}><span class="hub-anchor" aria-hidden="true">⚓</span><span class="hub-cta-text"><strong>${busy ? "Đang chuẩn bị…" : "Ra khơi"}</strong><small>${name ? "Vào thẳng biển chung" : "Đăng nhập để vào biển chung"}</small></span></button><p class="form-error hub-error" role="alert" ${error ? "" : "hidden"}>${escape(error)}</p></main>`;
  }
  async function enter() {
    if (busy || playing) return;
    wakeApi();
    busy = true;
    error = "";
    render();
    try {
      const { requirePlayer } = await import("./account");
      const user = await requirePlayer(abort.signal);
      if (!user || disposed) return;
      const { startOcean } = await import("./ocean");
      if (disposed) return;
      playing = true;
      history.replaceState(null, "", "?view=ocean");
      stopGame = startOcean(root, () => {
        stopGame?.();
        stopGame = undefined;
        playing = false;
        history.replaceState(null, "", "./");
        render();
      });
    } catch {
      error = "Chưa mở được game. Kiểm tra mạng rồi thử lại.";
    } finally {
      busy = false;
      render();
    }
  }
  root.addEventListener(
    "click",
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-harbor]",
      )?.dataset.harbor;
      if (action === "play") void enter();
      if (action === "account" && !busy) {
        busy = true;
        render();
        void import("./account")
          .then(({ requirePlayer }) => requirePlayer(abort.signal))
          .catch(() => {
            error = "Chưa mở được đăng nhập. Hãy thử lại.";
          })
          .finally(() => {
            busy = false;
            render();
          });
      }
      if (action === "logout" && !busy) {
        busy = true;
        render();
        void import("../platform/account")
          .then(({ logoutPlayer }) => logoutPlayer())
          .catch(() => {
            error = "Chưa đăng xuất được. Hãy thử lại.";
          })
          .finally(() => {
            busy = false;
            render();
          });
      }
    },
    { signal: abort.signal },
  );
  render();
  void import("../platform/account")
    .then(({ observePlayer }) => {
      if (disposed) return;
      stopAuth = observePlayer((user) => {
        name = user ? user.displayName || "Người đi biển" : "";
        uid = user ? user.uid : "";
        if (playing && !user) {
          stopGame?.();
          stopGame = undefined;
          playing = false;
          history.replaceState(null, "", "./");
        }
        render();
      });
    })
    .catch(() => {
      error = "Chưa kết nối được đăng nhập. Kiểm tra mạng rồi thử lại.";
      render();
    });
  if (new URLSearchParams(location.search).get("view") === "ocean")
    void enter();
  return () => {
    disposed = true;
    abort.abort();
    stopAuth?.();
    stopGame?.();
    root.replaceChildren();
  };
}
