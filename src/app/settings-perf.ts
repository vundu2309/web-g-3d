/** The device's choice to show the performance panel, kept on this device only. */
const KEY = "sea-perf-panel";

export function loadPerfPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function savePerfPref(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private window or blocked storage: the choice just is not remembered */
  }
}

/**
 * The "Khung đo hiệu năng" card of the Settings screen: a switch for the frame-numbers panel
 * (perf-panel.ts), so a player can see the fps and the quality state on production without
 * touching the address. The choice is remembered on this device.
 */
export function createPerfSection(panel: {
  shown: () => boolean;
  show: (on: boolean) => void;
}): HTMLElement {
  const section = document.createElement("section");
  section.className = "update-card weather-card";
  section.setAttribute("aria-label", "Khung đo hiệu năng");
  const head = document.createElement("div");
  head.className = "crew-head";
  const title = document.createElement("h3");
  title.textContent = "Khung đo hiệu năng";
  head.append(title);
  const note = document.createElement("p");
  note.className = "update-note";
  note.textContent =
    "Hiện số khung hình, độ trễ và chất lượng ở góc màn hình biển. Khung chuyển đỏ khi máy chạy kém.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "weather-chip";
  button.dataset.ocean = "perf";
  const refresh = () => {
    const on = panel.shown();
    button.setAttribute("aria-pressed", String(on));
    button.textContent = on ? "Đang bật" : "Đang tắt";
  };
  button.addEventListener("click", () => {
    panel.show(!panel.shown());
    refresh();
  });
  refresh();
  const row = document.createElement("div");
  row.className = "weather-row";
  row.style.gridTemplateColumns = "1fr"; // one wide switch, not a quarter of the four-chip row
  row.append(button);
  section.append(head, note, row);
  return section;
}
