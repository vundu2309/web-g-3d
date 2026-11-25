import type { SeaAudio } from "./audio";

/** The "Âm thanh" card of the Settings screen: on/off, volume and the music, saved on this device. */
export function createAudioSection(audio: SeaAudio): HTMLElement {
  const section = document.createElement("section");
  section.className = "update-card audio-card";
  section.setAttribute("aria-label", "Âm thanh");
  const head = document.createElement("div");
  head.className = "crew-head";
  const title = document.createElement("h3");
  title.textContent = "Âm thanh";
  head.append(title);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "weather-chip is-reset";
  toggle.dataset.ocean = "audio-toggle";
  const music = document.createElement("button");
  music.type = "button";
  music.className = "weather-chip is-reset";
  music.dataset.ocean = "audio-music";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.className = "audio-volume";
  slider.setAttribute("aria-label", "Âm lượng");
  slider.dataset.ocean = "audio-volume";

  const refresh = () => {
    const { enabled, volume, music: musicOn } = audio.settings();
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled ? "Âm thanh: Bật" : "Âm thanh: Tắt";
    music.setAttribute("aria-pressed", String(musicOn));
    music.textContent = musicOn ? "Nhạc nền: Bật" : "Nhạc nền: Tắt";
    music.disabled = !enabled;
    slider.value = String(Math.round(volume * 100));
    slider.disabled = !enabled;
  };
  toggle.addEventListener("click", () => {
    audio.set({ enabled: !audio.settings().enabled });
    refresh();
  });
  music.addEventListener("click", () => {
    audio.set({ music: !audio.settings().music });
    refresh();
  });
  slider.addEventListener("input", () => {
    audio.set({ volume: Number(slider.value) / 100 });
  });
  refresh();
  section.append(head, toggle, music, slider);
  return section;
}
