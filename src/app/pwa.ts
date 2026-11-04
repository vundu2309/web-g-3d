import { registerShell } from "../platform/pwa";
/** Installation and static-shell lifecycle. Never stores user/account/game data. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function startPwa(root: HTMLElement): () => void {
  const abort = new AbortController();
  const display = window.matchMedia("(display-mode: standalone)");
  let prompt: InstallPrompt | undefined;
  let installed = false;
  let disposed = false;
  const dialog = document.createElement("dialog");
  dialog.className = "pwa-dialog";
  dialog.setAttribute("aria-labelledby", "pwa-title");
  dialog.innerHTML = `<h2 id="pwa-title" tabindex="-1" autofocus>Cài Phố Tỷ Phú</h2><p>Thêm game vào màn hình chính để mở trong cửa sổ ứng dụng.</p><ol><li><strong>Android · Chrome</strong><p>Mở menu ⋮ → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.</p></li><li><strong>iPhone / iPad · Safari</strong><p>Chọn Chia sẻ → Thêm vào Màn hình chính → Thêm.</p></li></ol><p class="pwa-hint">Nếu đang mở trong ứng dụng chat, hãy mở liên kết bằng Chrome hoặc Safari trước. Giao diện và HUD mẫu có thể mở lại sau khi đã tải; tài khoản và multiplayer vẫn cần mạng.</p><button class="button primary" type="button" data-pwa-close>Đã hiểu</button>`;
  const update = document.createElement("aside");
  update.className = "pwa-update";
  update.setAttribute("role", "status");
  update.hidden = true;
  update.textContent =
    "Có phiên bản mới. Đóng các cửa sổ game rồi mở lại để cập nhật; phiên đang mở không bị tải lại.";
  document.body.append(dialog, update);
  function standalone() {
    return (
      installed ||
      display.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }
  function refreshButtons() {
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-pwa-install]",
    )) {
      button.hidden = standalone();
      const text = prompt ? "Cài game" : "Cài lên điện thoại";
      if (button.textContent !== text) button.textContent = text;
    }
  }
  const observer = new MutationObserver(refreshButtons);
  observer.observe(root, { childList: true, subtree: true });
  const capture = (event: Event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    refreshButtons();
  };
  window.addEventListener("beforeinstallprompt", capture, {
    signal: abort.signal,
  });
  window.addEventListener(
    "appinstalled",
    () => {
      installed = true;
      prompt = undefined;
      refreshButtons();
      if (dialog.open) dialog.close();
    },
    { signal: abort.signal },
  );
  display.addEventListener("change", refreshButtons, { signal: abort.signal });
  root.addEventListener(
    "click",
    (event) => {
      if (!(event.target as HTMLElement).closest("[data-pwa-install]")) return;
      const pending = prompt;
      if (!pending) {
        dialog.showModal();
        return;
      }
      prompt = undefined;
      refreshButtons();
      void pending
        .prompt()
        .then(() => pending.userChoice)
        .catch(() => {
          if (!disposed) dialog.showModal();
        });
    },
    { signal: abort.signal },
  );
  dialog.addEventListener(
    "click",
    (event) => {
      if ((event.target as HTMLElement).closest("[data-pwa-close]"))
        dialog.close();
    },
    { signal: abort.signal },
  );
  const stopShell = registerShell((waiting) => {
    if (!disposed) update.hidden = !waiting;
  });
  refreshButtons();
  return () => {
    disposed = true;
    stopShell();
    observer.disconnect();
    abort.abort();
    dialog.remove();
    update.remove();
  };
}
