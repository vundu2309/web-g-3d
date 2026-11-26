import { currentPin, pinAtmosphere } from "../ocean/sea-atmosphere";
import { DEFAULT_PIN, type WeatherKind } from "../ocean/atmosphere";

/** The hours the test card offers (hour of the 24 minute game day, 12 is noon). */
export const TEST_HOURS = [
  { label: "Bình minh", hour: 6 },
  { label: "Trưa", hour: 12 },
  { label: "Hoàng hôn", hour: 18 },
  { label: "Đêm", hour: 0 },
] as const;

export const TEST_WEATHER: readonly { label: string; kind: WeatherKind }[] = [
  { label: "Quang đãng", kind: "clear" },
  { label: "U ám", kind: "overcast" },
  { label: "Mưa", kind: "rain" },
  { label: "Sương mù", kind: "fog" },
];

/**
 * The "Thử ngày đêm" card of the Settings screen: pins the time of day and the weather on this
 * device only, so they can be looked at on production without waiting for the shared clock.
 * Nothing is saved or sent: the sea follows the real shared day and weather, a button here pins
 * one part on this device, "Giờ thật" follows the shared clock again, and a reload does too.
 */
export function createWeatherTestSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "update-card weather-card";
  section.setAttribute("aria-label", "Thử ngày đêm");
  const head = document.createElement("div");
  head.className = "crew-head";
  const title = document.createElement("h3");
  title.textContent = "Thử ngày đêm";
  head.append(title);
  const note = document.createElement("p");
  note.className = "update-note";
  note.textContent =
    "Biển theo giờ thật và thời tiết chung cho mọi người (cũng là giờ quyết định cá nào dễ cắn). Chỉ đổi trên máy này; bấm “Giờ thật” hoặc tải lại trang để quay về.";

  const buttons: { el: HTMLButtonElement; test: () => boolean }[] = [];
  const chip = (label: string, test: () => boolean, apply: () => void) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "weather-chip";
    el.textContent = label;
    el.addEventListener("click", () => {
      apply();
      refresh();
    });
    buttons.push({ el, test });
    return el;
  };
  const refresh = () => {
    for (const { el, test } of buttons)
      el.setAttribute("aria-pressed", String(test()));
  };
  const setPin = (patch: {
    hour?: number | undefined;
    weather?: WeatherKind;
  }) => {
    // The first press after "Giờ thật" pins both parts, from a sunny noon: a weather picked
    // while the shared clock is at night would otherwise be drawn in the dark, and an hour picked
    // while the clock weather is rain would be drawn in the rain, so no button seemed to do what
    // it says.
    const now = currentPin() ?? DEFAULT_PIN;
    pinAtmosphere({ ...now, ...patch });
  };

  const hours = document.createElement("div");
  hours.className = "weather-row";
  hours.setAttribute("role", "group");
  hours.setAttribute("aria-label", "Giờ trong ngày");
  for (const { label, hour } of TEST_HOURS)
    hours.append(
      chip(
        label,
        () => currentPin()?.hour === hour,
        () => setPin({ hour }),
      ),
    );
  const sky = document.createElement("div");
  sky.className = "weather-row";
  sky.setAttribute("role", "group");
  sky.setAttribute("aria-label", "Thời tiết");
  for (const { label, kind } of TEST_WEATHER)
    sky.append(
      chip(
        label,
        () => currentPin()?.weather === kind,
        () => setPin({ weather: kind }),
      ),
    );
  const reset = chip(
    "Giờ thật",
    () => currentPin() === undefined,
    () => pinAtmosphere(undefined),
  );
  reset.classList.add("is-reset");
  reset.dataset.ocean = "weather-reset";
  refresh();
  section.append(head, note, hours, sky, reset);
  return section;
}
