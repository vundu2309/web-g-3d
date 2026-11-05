import { accountError, updatePassword } from "../platform/account";
let active: HTMLDialogElement | undefined;
export function openPasswordRecovery(signal: AbortSignal) {
  if (signal.aborted || active?.isConnected) return;
  const dialog = document.createElement("dialog");
  active = dialog;
  dialog.className = "account-dialog";
  dialog.setAttribute("aria-labelledby", "recovery-title");
  dialog.innerHTML = `<div class="account-heading"><h1 id="recovery-title">Đặt mật khẩu mới</h1><button type="button" class="text-button" data-close>Đóng</button></div><form id="recovery-form"><label for="recovery-password">Mật khẩu mới</label><input id="recovery-password" name="password" type="password" minlength="6" autocomplete="new-password" required /><label for="recovery-confirm">Nhập lại mật khẩu mới</label><input id="recovery-confirm" name="confirm" type="password" minlength="6" autocomplete="new-password" required /><p class="form-error" role="alert" hidden></p><p class="auth-status" role="status"></p><button class="button primary" type="submit">Lưu mật khẩu</button></form>`;
  const controller = new AbortController();
  let pending = false;
  function close() {
    controller.abort();
    dialog.close();
    dialog.remove();
    if (active === dialog) active = undefined;
  }
  const password =
    dialog.querySelector<HTMLInputElement>("#recovery-password")!;
  const confirm = dialog.querySelector<HTMLInputElement>("#recovery-confirm")!;
  dialog.querySelector("[data-close]")!.addEventListener(
    "click",
    () => {
      if (!pending) close();
    },
    { signal: controller.signal },
  );
  dialog.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      if (!pending) close();
    },
    { signal: controller.signal },
  );
  dialog.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (pending) return;
      const error = dialog.querySelector<HTMLElement>("[role=alert]")!;
      const status = dialog.querySelector<HTMLElement>("[role=status]")!;
      error.hidden = true;
      if (password.value !== confirm.value) {
        error.textContent = "Hai mật khẩu chưa trùng nhau.";
        error.hidden = false;
        return;
      }
      pending = true;
      const controls = dialog.querySelectorAll<
        HTMLInputElement | HTMLButtonElement
      >("input,button");
      controls.forEach((control) => {
        control.disabled = true;
      });
      void updatePassword(password.value)
        .then(() => {
          password.value = "";
          confirm.value = "";
          dialog.querySelector("form")!.remove();
          const result = document.createElement("p");
          result.setAttribute("role", "status");
          result.textContent = "Đã đổi mật khẩu. Bạn có thể tiếp tục chơi.";
          dialog.append(result);
        })
        .catch((reason) => {
          if (dialog.isConnected) {
            error.textContent = accountError(reason);
            error.hidden = false;
            status.textContent = "";
          }
        })
        .finally(() => {
          pending = false;
          if (dialog.isConnected)
            controls.forEach((control) => {
              control.disabled = false;
            });
        });
    },
    { signal: controller.signal },
  );
  signal.addEventListener("abort", close, {
    once: true,
    signal: controller.signal,
  });
  document.body.append(dialog);
  dialog.showModal();
  password.focus();
}
