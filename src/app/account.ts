import {
  accountError,
  currentPlayer,
  loginPlayer,
  registerPlayer,
  resetPassword,
} from "../platform/account";
import type { PlayerAccount as User } from "../platform/account";
async function openAccount(signal?: AbortSignal): Promise<User | null> {
  const user = await currentPlayer();
  if (user) return user;
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "account-dialog";
    dialog.setAttribute("aria-labelledby", "account-title");
    dialog.setAttribute("aria-describedby", "account-intro");
    let mode: "login" | "register" | "reset" = "login";
    let pending = false;
    const controller = new AbortController();
    function close(user: User | null) {
      controller.abort();
      dialog.close();
      dialog.remove();
      resolve(user);
    }
    function render() {
      const title =
        mode === "login"
          ? "Đăng nhập"
          : mode === "register"
            ? "Tạo tài khoản"
            : "Quên mật khẩu";
      dialog.innerHTML = `<div class="account-heading"><h1 id="account-title">${title}</h1><button type="button" class="text-button account-close" data-auth="close" aria-label="Đóng">Đóng</button></div><p id="account-intro" class="account-intro">Tài khoản của bạn, cùng chơi ở mọi thiết bị.</p><form id="account-form">${mode === "register" ? '<label for="account-name">Tên người chơi</label><input id="account-name" name="displayName" maxlength="24" autocomplete="nickname" required />' : ""}<label for="account-email">Email</label><input id="account-email" name="email" type="email" autocomplete="email" required />${mode !== "reset" ? `<label for="account-password">Mật khẩu</label><div class="password-field"><input id="account-password" name="password" type="password" autocomplete="${mode === "register" ? "new-password" : "current-password"}" ${mode === "register" ? 'minlength="6"' : ""} required /><button class="text-button" type="button" data-auth="show" aria-pressed="false" aria-label="Hiện mật khẩu">Hiện</button></div>${mode === "register" ? '<p class="field-hint">Ít nhất 6 ký tự. Không dùng lại mật khẩu của dịch vụ khác.</p>' : ""}` : '<p class="field-hint">Nhập email để nhận hướng dẫn đặt lại mật khẩu.</p>'}<p class="form-error" role="alert" hidden></p><p class="auth-status" role="status"></p><button class="button primary" type="submit">${mode === "reset" ? "Gửi hướng dẫn" : title}</button></form><div class="account-links"><button class="text-button" data-auth="switch">${mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}</button>${mode === "login" ? '<button class="text-button" data-auth="reset">Quên mật khẩu?</button>' : ""}</div>`;
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    }
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        if (!pending) close(null);
      },
      { signal: controller.signal },
    );
    dialog.addEventListener(
      "click",
      (event) => {
        if (pending) return;
        const action = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-auth]",
        )?.dataset.auth;
        if (action === "close") close(null);
        if (action === "switch") {
          mode = mode === "login" ? "register" : "login";
          render();
        }
        if (action === "reset") {
          mode = "reset";
          render();
        }
        if (action === "show") {
          const input =
            dialog.querySelector<HTMLInputElement>("#account-password")!;
          const show = input.type === "password";
          input.type = show ? "text" : "password";
          const button =
            dialog.querySelector<HTMLButtonElement>('[data-auth="show"]')!;
          button.textContent = show ? "Ẩn" : "Hiện";
          button.setAttribute("aria-pressed", String(show));
          button.setAttribute(
            "aria-label",
            show ? "Ẩn mật khẩu" : "Hiện mật khẩu",
          );
        }
      },
      { signal: controller.signal },
    );
    dialog.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        if (pending) return;
        const form = dialog.querySelector<HTMLFormElement>("form")!;
        const data = new FormData(form);
        const email = String(data.get("email") || "");
        const password = String(data.get("password") || "");
        const error = dialog.querySelector<HTMLElement>("[role=alert]")!;
        const status = dialog.querySelector<HTMLElement>(".auth-status")!;
        error.hidden = true;
        status.textContent = "Đang xử lý…";
        pending = true;
        dialog
          .querySelectorAll<
            HTMLInputElement | HTMLButtonElement
          >("input,button")
          .forEach((el) => {
            el.disabled = true;
          });
        void (async () => {
          try {
            if (mode === "reset") {
              await resetPassword(email);
              status.textContent =
                "Nếu email có tài khoản, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.";
            } else {
              const signedIn =
                mode === "login"
                  ? await loginPlayer(email, password)
                  : await registerPlayer(
                      email,
                      password,
                      String(data.get("displayName") || ""),
                    );
              if (signedIn) close(signedIn);
              else {
                form.reset();
                status.textContent =
                  "Hãy kiểm tra email để xác nhận tài khoản, rồi quay lại đăng nhập. Tài khoản cũ cần đăng ký lại trên hệ thống mới.";
              }
            }
          } catch (e) {
            error.textContent = accountError(e);
            error.hidden = false;
            status.textContent = "";
          } finally {
            pending = false;
            if (dialog.isConnected)
              dialog
                .querySelectorAll<
                  HTMLInputElement | HTMLButtonElement
                >("input,button")
                .forEach((el) => {
                  el.disabled = false;
                });
          }
        })();
      },
      { signal: controller.signal },
    );
    signal?.addEventListener("abort", () => close(null), {
      once: true,
      signal: controller.signal,
    });
    if (signal?.aborted) {
      close(null);
      return;
    }
    document.body.append(dialog);
    render();
    dialog.showModal();
  });
}

let active: Promise<User | null> | undefined;
export function requirePlayer(signal?: AbortSignal): Promise<User | null> {
  if (!active)
    active = openAccount(signal).finally(() => {
      active = undefined;
    });
  return active;
}
