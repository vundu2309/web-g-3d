/**
 * The game's calendar, as plain numbers (no Babylon, so tests read them directly): slots of
 * the shared server clock for the rotating hot spots and the hourly event, and the Vietnamese day
 * and week for the daily quests and the weekly board.
 *
 * Every function takes the time in milliseconds of the shared server clock (`worldMs()` in
 * app/ocean.ts), never `Date.now()` of a device, so every player is in the same slot, the same day
 * and the same week. The day and the week turn at midnight in Vietnam (UTC+7, no summer time), the
 * week on Monday. The database will keep the same calendar in `economy_private.game_day()` and
 * `game_week()` (`at time zone 'Asia/Ho_Chi_Minh'`); the key a client works out here and the key the
 * server works out are meant to be the same date: tests/game-clock.test.mjs pins this side now, and
 * the SQL harness will pin the other when the migration lands (phase P3).
 */
export const HOUR_MS = 3_600_000;
export const DAY_MS_REAL = 86_400_000;
/** Vietnam is seven hours ahead of UTC all year. */
export const VN_OFFSET_MS = 7 * HOUR_MS;

/** Which slot of `lengthMs` the time is in (slots are counted from the epoch). */
export const slotOf = (ms: number, lengthMs: number) =>
  Math.floor(ms / lengthMs);

/** When slot `slot` of `lengthMs` begins (ms). */
export const slotStart = (slot: number, lengthMs: number) => slot * lengthMs;

/** The Vietnamese day as a whole number: days since 1970-01-01 there (the same date as `game_day()`). */
export const vnDayKey = (ms: number) =>
  Math.floor((ms + VN_OFFSET_MS) / DAY_MS_REAL);

/**
 * The Vietnamese week as a whole number, counted from the week of Monday 1969-12-29 (1970-01-01
 * was a Thursday). Monday is the first day.
 */
export const vnWeekKey = (ms: number) => Math.floor((vnDayKey(ms) + 3) / 7);

/** The day key of the Monday that starts week `week`. */
export const vnWeekStartDay = (week: number) => week * 7 - 3;

/** A day key as `YYYY-MM-DD` (the date `game_day()` returns). */
export const vnDateString = (dayKey: number) =>
  new Date(dayKey * DAY_MS_REAL).toISOString().slice(0, 10);

/** Milliseconds from `ms` to the next midnight in Vietnam (the quests refresh then). */
export const msToVnMidnight = (ms: number) =>
  (vnDayKey(ms) + 1) * DAY_MS_REAL - VN_OFFSET_MS - ms;

/** Milliseconds from `ms` to the end of the Vietnamese week (Monday 00:00; the weekly board closes then). */
export const msToVnWeekEnd = (ms: number) =>
  vnWeekStartDay(vnWeekKey(ms) + 1) * DAY_MS_REAL - VN_OFFSET_MS - ms;

/** "còn 3 giờ 5 phút", "còn 12 phút", "còn 2 ngày 4 giờ": a time left, in words (rounded up to the minute). */
export function timeLeftText(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `còn ${days} ngày${hours ? ` ${hours} giờ` : ""}`;
  if (hours > 0) return `còn ${hours} giờ${rest ? ` ${rest} phút` : ""}`;
  return `còn ${rest} phút`;
}

/** Compact digital countdown ("14:05", "1:02:03") for space-constrained badges. */
export function countdownText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
