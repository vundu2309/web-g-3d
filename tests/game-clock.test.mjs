import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY_MS_REAL,
  HOUR_MS,
  VN_OFFSET_MS,
  countdownText,
  msToVnMidnight,
  msToVnWeekEnd,
  slotOf,
  slotStart,
  timeLeftText,
  vnDateString,
  vnDayKey,
  vnWeekKey,
  vnWeekStartDay,
} from "../src/ocean/game-clock.ts";

const at = (iso) => Date.parse(iso);

test("slots count from the epoch and are the same for everyone", () => {
  assert.equal(slotOf(0, HOUR_MS), 0);
  assert.equal(slotOf(HOUR_MS - 1, HOUR_MS), 0);
  assert.equal(slotOf(HOUR_MS, HOUR_MS), 1);
  assert.equal(
    slotStart(slotOf(at("2026-11-26T10:34:56Z"), HOUR_MS), HOUR_MS),
    at("2026-11-26T10:00:00Z"),
  );
  const fifteen = 15 * 60_000;
  assert.equal(
    slotOf(at("2026-11-26T10:29:59Z"), fifteen) + 1,
    slotOf(at("2026-11-26T10:30:00Z"), fifteen),
  );
});

test("the Vietnamese day turns at 17:00 UTC (midnight in Vietnam)", () => {
  const before = at("2026-11-25T16:59:59Z");
  const after = at("2026-11-25T17:00:00Z");
  assert.equal(vnDayKey(after), vnDayKey(before) + 1);
  assert.equal(vnDateString(vnDayKey(before)), "2026-11-25");
  assert.equal(vnDateString(vnDayKey(after)), "2026-11-26");
  assert.equal(VN_OFFSET_MS, 7 * HOUR_MS);
  // Early morning in Vietnam is still the evening before in UTC, but already the new Vietnamese day.
  assert.equal(
    vnDateString(vnDayKey(at("2026-11-25T18:00:00Z"))),
    "2026-11-26",
  );
});

test("the Vietnamese week starts on Monday: Sunday 23:59:59 is the old week, Monday 00:00 the new one", () => {
  // 2026-11-26 is a Thursday.
  assert.equal(new Date(at("2026-11-26T05:00:00Z")).getUTCDay(), 4);
  const lastSecond = at("2026-11-29T16:59:59Z"); // Sunday 23:59:59 in Vietnam
  const firstSecond = at("2026-11-29T17:00:00Z"); // Monday 00:00:00 in Vietnam
  assert.equal(vnWeekKey(firstSecond), vnWeekKey(lastSecond) + 1);
  assert.equal(
    vnDateString(vnWeekStartDay(vnWeekKey(lastSecond))),
    "2026-11-23",
  );
  assert.equal(
    vnDateString(vnWeekStartDay(vnWeekKey(firstSecond))),
    "2026-11-30",
  );
  // Every week starts on a Monday, whichever week it is.
  for (const week of [0, 1, 2500, 2930, 3100])
    assert.equal(new Date(vnWeekStartDay(week) * DAY_MS_REAL).getUTCDay(), 1);
  // The whole week from Monday 00:00 to Sunday 23:59 VN is one key.
  const monday = at("2026-11-22T17:00:00Z");
  for (let h = 0; h < 7 * 24; h += 5)
    assert.equal(vnWeekKey(monday + h * HOUR_MS), vnWeekKey(monday));
});

test("the time left to midnight and to the end of the week", () => {
  assert.equal(msToVnMidnight(at("2026-11-25T16:59:59Z")), 1000);
  assert.equal(msToVnMidnight(at("2026-11-25T17:00:00Z")), DAY_MS_REAL);
  assert.equal(msToVnWeekEnd(at("2026-11-29T16:59:59Z")), 1000);
  assert.equal(msToVnWeekEnd(at("2026-11-29T17:00:00Z")), 7 * DAY_MS_REAL);
  for (let h = 0; h < 24 * 14; h += 7) {
    const t = at("2026-11-20T03:00:00Z") + h * HOUR_MS;
    assert.ok(msToVnMidnight(t) > 0 && msToVnMidnight(t) <= DAY_MS_REAL);
    assert.ok(msToVnWeekEnd(t) > 0 && msToVnWeekEnd(t) <= 7 * DAY_MS_REAL);
    assert.ok(msToVnWeekEnd(t) >= msToVnMidnight(t));
  }
});

test("a time left is worded in Vietnamese, rounded up to the minute", () => {
  assert.equal(timeLeftText(0), "còn 0 phút");
  assert.equal(timeLeftText(1000), "còn 1 phút");
  assert.equal(timeLeftText(12 * 60_000), "còn 12 phút");
  assert.equal(timeLeftText(HOUR_MS), "còn 1 giờ");
  assert.equal(timeLeftText(3 * HOUR_MS + 5 * 60_000), "còn 3 giờ 5 phút");
  assert.equal(timeLeftText(2 * DAY_MS_REAL + 4 * HOUR_MS), "còn 2 ngày 4 giờ");
  assert.equal(timeLeftText(-5), "còn 0 phút");
});

test("countdownText formats compact MM:SS and H:MM:SS timers", () => {
  assert.equal(countdownText(0), "00:00");
  assert.equal(countdownText(-500), "00:00");
  assert.equal(countdownText(1000), "00:01");
  assert.equal(countdownText(14 * 60_000 + 5_000), "14:05");
  assert.equal(countdownText(59 * 60_000 + 59_000), "59:59");
  assert.equal(countdownText(HOUR_MS + 2 * 60_000 + 3_000), "1:02:03");
});
