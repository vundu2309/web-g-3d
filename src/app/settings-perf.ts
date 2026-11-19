import { PROBES, WAVE_CHOICES, probe, setProbe } from "../ocean/probe";

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

/**
 * "Thử tắt từng phần": switches that leave one part of the sea out, so the performance panel shows
 * what that part costs on this phone. They apply after a reload and stay until switched back.
 */
export function createProbeSection(beforeReload: () => void): HTMLElement {
  const section = document.createElement("section");
  section.className = "update-card weather-card";
  section.setAttribute("aria-label", "Thử tắt từng phần");
  const head = document.createElement("div");
  head.className = "crew-head";
  const title = document.createElement("h3");
  title.textContent = "Thử tắt từng phần";
  head.append(title);
  const note = document.createElement("p");
  note.className = "update-note";
  note.textContent =
    "Để tìm phần nào làm tụt khung hình: tắt một phần (hoặc ép độ phân giải 1x), bấm Áp dụng, đứng yên rồi đọc khung đo. Xong thì bật lại hết.";
  const row = document.createElement("div");
  row.className = "weather-row";
  row.style.gridTemplateColumns = "1fr";
  for (const item of PROBES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "weather-chip";
    chip.dataset.probe = item.name;
    const refresh = () => {
      const changed = probe(item.name) === item.off;
      // A part shows "bật" while the game draws it; a forced setting shows "bật" while forced.
      const on = item.feature ? !changed : changed;
      chip.setAttribute("aria-pressed", String(on));
      chip.textContent = `${item.label}: ${on ? "bật" : "tắt"}`;
    };
    chip.addEventListener("click", () => {
      setProbe(item.name, probe(item.name) === item.off ? null : item.off);
      refresh();
    });
    refresh();
    row.append(chip);
  }
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "button settings-update";
  apply.textContent = "Áp dụng (tải lại game)";
  apply.addEventListener("click", () => {
    beforeReload();
    window.location.reload();
  });
  section.append(head, note, row, apply);
  return section;
}

/**
 * "Thử sóng biển": makes every wave of the sea 2, 3 or 4 times taller (waves.ts reads `waves` from
 * the page address or from here), to try the boat in a violent sea: a hull lifted out of the water,
 * the camera, the wake. The sea table is built when the page loads, so the choice applies after a
 * reload and stays on this device until set back to 1.
 */
export function createWavesSection(beforeReload: () => void): HTMLElement {
  const section = document.createElement("section");
  section.className = "update-card weather-card";
  section.setAttribute("aria-label", "Thử sóng biển");
  const head = document.createElement("div");
  head.className = "crew-head";
  const title = document.createElement("h3");
  title.textContent = "Thử sóng biển";
  head.append(title);
  const note = document.createElement("p");
  note.className = "update-note";
  note.textContent =
    "Làm mọi con sóng cao gấp 2, 3 hoặc 4 lần để thử thuyền khi bị nhấc khỏi mặt nước. Chọn mức, bấm Áp dụng, xong thì chọn lại 1x. Chỉ đổi trên máy này.";
  const row = document.createElement("div");
  row.className = "weather-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Độ cao sóng");
  const chosen = () => {
    const value = Number(probe("waves"));
    return WAVE_CHOICES.find((choice) => choice === value) ?? 1;
  };
  const chips: { el: HTMLButtonElement; value: number }[] = [];
  const refresh = () => {
    for (const { el, value } of chips)
      el.setAttribute("aria-pressed", String(value === chosen()));
  };
  for (const value of WAVE_CHOICES) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "weather-chip";
    el.dataset.waves = String(value);
    el.textContent = `${value}x`;
    el.addEventListener("click", () => {
      setProbe("waves", value === 1 ? null : String(value));
      refresh();
    });
    chips.push({ el, value });
    row.append(el);
  }
  refresh();
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "button settings-update";
  apply.textContent = "Áp dụng (tải lại game)";
  apply.addEventListener("click", () => {
    beforeReload();
    window.location.reload();
  });
  section.append(head, note, row, apply);
  return section;
}
