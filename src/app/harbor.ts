import "../ocean/style.css";
import { CHROME_COLORS, setChromeColor } from "./chrome-color";
import { wakeApi } from "../platform/wake";
import { HubError } from "../platform/errors";
import { mountHubArt } from "../ui/hub-canvas";
import { decodeSave, saveKey } from "../ocean/save";
import { seaAt, type Band } from "../ocean/fishing-conditions";
import { eventAt } from "../ocean/world-event";
import { countdownText } from "../ocean/game-clock";
import type { WeatherKind } from "../ocean/atmosphere";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const BOAT =
  '<svg viewBox="0 0 120 56" width="40" height="26" aria-hidden="true" focusable="false"><path d="M0 30h120l-18 22H20Z" fill="#e97760" stroke="#153b80" stroke-width="5" stroke-linejoin="round"/><rect x="48" y="4" width="38" height="26" rx="5" fill="#fff6e0" stroke="#153b80" stroke-width="5"/></svg>';
const INSTALL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12M7 11l5 5 5-5M5 20h14"/></svg>';
const PERSON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg>';
const LOGOUT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>';
const ANCHOR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="5.5" r="2.5"/><path d="M12 8v12M8 11h8M5 14a7 7 0 0 0 14 0"/></svg>';
const ROTATE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="7" width="16" height="10" rx="2.5"/><path d="M17 4l2.5 1.5L18 8M7 20l-2.5-1.5L6 16"/></svg>';
const BOLT =
  '<svg viewBox="0 0 24 24" fill="#d97706" stroke="#153b80" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z"/></svg>';

const BAND_ICON: Record<Band, string> = {
  day: '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="#ffd35a"/><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>',
  twilight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 17h16"/><path d="M7 17a5 5 0 0 1 10 0" fill="#ffd35a"/><path d="M12 6v2.5M6.2 9.2l1.7 1.7M17.8 9.2l-1.7 1.7"/></svg>',
  night:
    '<svg viewBox="0 0 24 24" fill="#ffd35a" stroke="#153b80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/></svg>',
};
const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: "",
  overcast:
    '<svg viewBox="0 0 24 24" fill="#dceeff" stroke="#153b80" stroke-width="2.1" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.5 17.5h11a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.7-1.2A3.8 3.8 0 0 0 6.5 17.5Z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.5 14.5h11a3.8 3.8 0 0 0 .4-7.6A5.2 5.2 0 0 0 7.7 5.8a3.6 3.6 0 0 0-1.2 8.7Z" fill="#dceeff"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="#153b80" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 9h14M6 13h14M4 17h12"/></svg>',
};

const BAND_LABEL: Record<Band, string> = {
  day: "Ban ngày",
  twilight: "Chạng vạng",
  night: "Ban đêm",
};
const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "Trời quang",
  overcast: "Nhiều mây",
  rain: "Có mưa",
  fog: "Có sương mù",
};

/** Whether the player has a resumable voyage saved on this device. */
function hasSavedVoyage(uid: string): boolean {
  try {
    return decodeSave(localStorage.getItem(saveKey(uid))).pose !== undefined;
  } catch {
    return false;
  }
}

function seaPillMarkup(now: number): { html: string; label: string } {
  const sea = seaAt(now);
  const ev = eventAt(now);
  const leftMs = ev.active ? Math.max(0, ev.endsAtMs - now) : 0;
  const weather = WEATHER_ICON[sea.weather];
  const baseLabel = `${BAND_LABEL[sea.band]} · ${WEATHER_LABEL[sea.weather]}`;
  const label = ev.active
    ? `${baseLabel} · Vòng cá lớn ${countdownText(leftMs)}`
    : baseLabel;
  const eventHtml = ev.active
    ? `<span class="hub-event" aria-hidden="true">${BOLT}<time>${countdownText(leftMs)}</time></span>`
    : "";
  return {
    label,
    html: `<span class="hub-sea-icons" aria-hidden="true">${BAND_ICON[sea.band]}${weather}</span>${eventHtml}`,
  };
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
  let stopArt: (() => void) | undefined;
  let stopClock: number | undefined;
  let lastSeaLabel = "";
  let stopGame: (() => void) | undefined;
  let playing = false;
  let error = "";

  function clearClock() {
    if (stopClock !== undefined) {
      window.clearInterval(stopClock);
      stopClock = undefined;
    }
  }

  function refreshSeaPill() {
    if (document.hidden) return;
    const pill = root.querySelector<HTMLElement>(".hub-sea");
    if (!pill) return;
    const { html, label } = seaPillMarkup(Date.now());
    if (label === lastSeaLabel) return;
    lastSeaLabel = label;
    pill.innerHTML = html;
    pill.setAttribute("aria-label", label);
    pill.title = label;
  }

  function render() {
    if (disposed || playing) return;
    setChromeColor(CHROME_COLORS.harbor);
    stopArt?.();
    stopArt = undefined;
    clearClock();
    const sea = seaPillMarkup(Date.now());
    lastSeaLabel = sea.label;
    const captain = name
      ? `<section class="hub-card" aria-label="Thuyền trưởng"><div class="hub-avatar">${BOAT}</div><strong class="hub-name">${escape(name)}</strong></section>`
      : "";
    const accountTool = name
      ? `<button class="hub-round" data-harbor="logout" aria-label="Đăng xuất" title="Đăng xuất" ${busy ? "disabled" : ""}>${LOGOUT}</button>`
      : `<button class="hub-round" data-harbor="account" aria-label="Đăng nhập / Đăng ký" title="Đăng nhập / Đăng ký" ${busy ? "disabled" : ""}>${PERSON}</button>`;
    const ctaSub = name ? (hasSavedVoyage(uid) ? "Tiếp tục" : "") : "Đăng nhập";
    root.innerHTML = `<main class="hub" aria-labelledby="page-title"><div class="hub-art" aria-hidden="true"><canvas class="hub-canvas"></canvas></div><div class="hub-head"><h1 id="page-title" class="hub-logo"><span>Ra khơi</span><small>cùng bạn</small></h1><div class="hub-sea" aria-label="${escape(sea.label)}" title="${escape(sea.label)}">${sea.html}</div></div><div class="hub-tools"><button class="hub-round" data-pwa-install data-pwa-label aria-label="Cài lên điện thoại" title="Cài lên điện thoại">${INSTALL}</button>${accountTool}</div>${captain}<div class="hub-rotate" aria-label="Xoay ngang điện thoại để chơi thoải mái hơn">${ROTATE}<span>Xoay ngang</span></div><button class="hub-cta" data-harbor="play" ${busy ? "disabled" : ""}><span class="hub-anchor" aria-hidden="true">${ANCHOR}</span><span class="hub-cta-text"><strong>${busy ? "Đang chuẩn bị…" : "Ra khơi"}</strong>${ctaSub ? `<small>${ctaSub}</small>` : ""}</span></button><p class="form-error hub-error" role="alert" ${error ? "" : "hidden"}>${escape(error)}</p></main>`;
    const canvas = root.querySelector<HTMLCanvasElement>(".hub-canvas");
    if (canvas) stopArt = mountHubArt(canvas, { boat: true });
    stopClock = window.setInterval(refreshSeaPill, 1000);
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
      stopArt?.();
      stopArt = undefined;
      clearClock();
      // Keeps the other switches of the address (`?perf`, `?cats=1`, `?seemode=depth`...): the sea
      // reads them when it starts, a moment later.
      const params = new URLSearchParams(location.search);
      params.set("view", "ocean");
      history.replaceState(null, "", `?${params.toString()}`);
      stopGame = startOcean(root, () => {
        stopGame?.();
        stopGame = undefined;
        playing = false;
        history.replaceState(null, "", "./");
        render();
      });
    } catch (cause) {
      error =
        cause instanceof HubError
          ? cause.message
          : "Chưa mở được game. Kiểm tra mạng rồi thử lại.";
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
          .catch((cause) => {
            error =
              cause instanceof HubError
                ? cause.message
                : "Chưa mở được đăng nhập. Hãy thử lại.";
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
    clearClock();
    stopAuth?.();
    stopArt?.();
    stopGame?.();
    root.replaceChildren();
  };
}
