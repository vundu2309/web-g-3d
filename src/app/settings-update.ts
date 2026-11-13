import { shellUpdates, shellVersion } from "../platform/pwa";
import type { UpdateResult } from "../platform/update-check";

/** What the Settings card says for each state; plain data so a test can pin the wording. */
export const UPDATE_TEXT = {
  idle: "Bấm để xem có bản mới không.",
  checking: "Đang kiểm tra…",
  latest: "Bạn đang dùng bản mới nhất.",
  ready: "Đã tải xong bản mới. Game sẽ tải lại và đưa thuyền về chỗ cũ.",
  failed: "Chưa kiểm tra được. Hãy kiểm tra mạng rồi thử lại.",
  unsupported: "Bản này chưa hỗ trợ cập nhật tự động.",
} as const;

export interface UpdateSectionOptions {
  /** Runs just before the page reloads for an update, e.g. to save the boat's position. */
  beforeApply?: () => void;
}

/**
 * The "Phiên bản" card of the Settings screen: which version runs, and a button that asks
 * whether a newer one exists. It reloads only after the player taps "Cập nhật ngay".
 */
export function createUpdateSection({
  beforeApply,
}: UpdateSectionOptions = {}): HTMLElement {
  const updates = shellUpdates();
  const section = document.createElement("section");
  section.className = "update-card";
  section.setAttribute("aria-label", "Phiên bản");

  const head = document.createElement("div");
  head.className = "crew-head";
  const title = document.createElement("h3");
  title.textContent = "Phiên bản";
  const version = document.createElement("span");
  version.className = "crew-count update-version";
  version.textContent = "…";
  head.append(title, version);

  const note = document.createElement("p");
  note.className = "update-note";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");
  note.textContent = updates ? UPDATE_TEXT.idle : UPDATE_TEXT.unsupported;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button settings-update";
  button.dataset.ocean = "update";
  button.textContent = "Kiểm tra cập nhật";
  button.disabled = !updates;

  void shellVersion().then((value) => {
    version.textContent = value ?? "—";
  });

  let ready = false;
  const show = (result: UpdateResult) => {
    note.textContent = UPDATE_TEXT[result];
    button.disabled = false;
    ready = result === "ready";
    button.textContent = ready ? "Cập nhật ngay" : "Kiểm tra lại";
    button.classList.toggle("is-ready", ready);
  };
  button.addEventListener("click", () => {
    if (!updates) return;
    if (ready) {
      button.disabled = true;
      beforeApply?.();
      updates.apply();
      return;
    }
    button.disabled = true;
    note.textContent = UPDATE_TEXT.checking;
    void updates.check().then(show, () => show("failed"));
  });

  section.append(head, note, button);
  return section;
}
