import "../ocean/style.css";
import { icon } from "../ui/art";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function startHarbor(root: HTMLElement) {
  const abort = new AbortController();
  let disposed = false;
  let busy = false;
  let name = "";
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
    root.innerHTML = `<main class="home harbor-home" aria-labelledby="page-title"><section class="identity"><h1 id="page-title" class="wordmark">Ra khơi<br/>cùng bạn</h1><div class="harbor-emblem" aria-hidden="true">⛵</div></section><section class="home-actions" aria-label="Chọn game"><span class="harbor-channel">● Một kênh · Một vùng biển chung</span><h2>Thuyền đánh cá</h2><p class="tagline">Bạn là thuyền trưởng của một con thuyền riêng. Lái thuyền, thả câu và gặp bạn bè trên biển.</p><button class="button primary" data-harbor="play" ${busy ? "disabled" : ""}>${icon("play")}<span>${busy ? "Đang chuẩn bị…" : "Vào game"}</span></button><p class="mode-note">Vào thẳng map chung sau khi đăng nhập.</p><div class="account-bar">${name ? `<span>Player: ${escape(name)}</span><button class="text-button" data-harbor="logout" ${busy ? "disabled" : ""}>Đăng xuất</button>` : `<button class="text-button" data-harbor="account" ${busy ? "disabled" : ""}>Đăng nhập / Đăng ký</button>`}</div><div class="home-shortcuts"><button class="text-button" data-pwa-install>Cài lên điện thoại</button><a class="help-link" href="?view=game">Monopoly · Bản xem trước</a></div><p class="form-error" role="alert" ${error ? "" : "hidden"}>${escape(error)}</p></section></main>`;
  }
  async function enter() {
    if (busy || playing) return;
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
