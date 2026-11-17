import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ECO_INTERVAL,
  FramePacer,
  MIN_INTERVAL,
  RETRY_FIRST,
  WARMUP,
  WINDOW,
} from "../src/ocean/frame-pacing.ts";

/**
 * A screen: animation frames arrive on every vsync; drawing a frame keeps the main thread busy
 * for `cost(t)` ms, so the next frame arrives on the first vsync after that.
 */
function simulate(
  refreshHz,
  cost,
  seconds,
  pacer = new FramePacer(),
  startAt = 1000,
) {
  const vsync = 1000 / refreshHz;
  const draws = [];
  const modes = [];
  let t = startAt;
  const end = t + seconds * 1000;
  while (t < end) {
    const drawn = pacer.frame(t);
    modes.push([t, pacer.mode]);
    let busy = 0;
    if (drawn) {
      draws.push(t);
      busy = cost(t - startAt);
    }
    t = Math.ceil((t + Math.max(busy, 0.001)) / vsync - 1e-9) * vsync;
  }
  return { draws, modes, pacer, end: t };
}
const fps = (draws, from, to) => {
  const inside = draws.filter((d) => d >= from && d < to);
  return (inside.length / (to - from)) * 1000;
};

test("a 60 Hz screen with cheap frames draws every frame", () => {
  const { draws, pacer } = simulate(60, () => 5, 12);
  assert.equal(pacer.mode, "full");
  const rate = fps(draws, 6000, 12000);
  assert.ok(rate > 58 && rate <= 61, `${rate.toFixed(1)} fps`);
});

test("a 144 Hz screen draws every second frame (72 fps), a 120 Hz one 60 fps", () => {
  const a = simulate(144, () => 3, 10);
  const ra = fps(a.draws, 5000, 10000);
  assert.ok(ra > 70 && ra < 74, `144 Hz: ${ra.toFixed(1)} fps`);
  const gaps = a.draws.slice(1).map((d, i) => d - a.draws[i]);
  assert.ok(Math.min(...gaps) >= MIN_INTERVAL - 1e-6);
  const b = simulate(120, () => 3, 10);
  const rb = fps(b.draws, 5000, 10000);
  assert.ok(rb > 58 && rb < 62, `120 Hz: ${rb.toFixed(1)} fps`);
});

test("a device that cannot keep up falls back to the 30 fps rhythm and stays there for a while", () => {
  // 40 ms per frame on a 60 Hz screen: gaps of 50 ms.
  const { draws, modes } = simulate(60, () => 40, 12);
  const firstEco = modes.find(([, m]) => m === "eco");
  assert.ok(firstEco, "it went to eco");
  const when = (firstEco[0] - 1000) / 1000;
  assert.ok(
    when >= WARMUP && when <= WARMUP + 2 * WINDOW + 0.5,
    `after the warm-up and one window, at ${when.toFixed(1)} s`,
  );
  const afterwards = draws.filter((d) => d > firstEco[0] + 200);
  const gaps = afterwards.slice(1).map((d, i) => d - afterwards[i]);
  assert.ok(
    Math.min(...gaps) >= ECO_INTERVAL - 1e-6,
    "no gap under the eco interval",
  );
});

test("it tries full again after RETRY_FIRST, doubles the wait after a failed try, and keeps full once a try works", () => {
  let slow = true;
  const pacer = new FramePacer();
  const first = simulate(60, () => (slow ? 40 : 5), 45, pacer);
  const toEco = first.modes.find(([, m]) => m === "eco")[0];
  const backToFull = first.modes.find(([t, m]) => t > toEco && m === "full");
  assert.ok(backToFull, "it tried full again");
  const wait = (backToFull[0] - toEco) / 1000;
  assert.ok(
    wait >= RETRY_FIRST && wait < RETRY_FIRST + 1,
    `first wait ${wait.toFixed(1)} s`,
  );
  // The try fails (still slow): the next wait is about double.
  const failed = first.modes.find(([t, m]) => t > backToFull[0] && m === "eco");
  assert.ok(failed, "the failed try went back to eco");
  const toEco2 = failed[0];
  const back2 = first.modes.find(([t, m]) => t > toEco2 && m === "full");
  assert.ok(back2, "it tried a second time");
  const wait2 = (back2[0] - toEco2) / 1000;
  assert.ok(
    wait2 >= 2 * RETRY_FIRST - 0.5,
    `second wait ${wait2.toFixed(1)} s`,
  );
  // The device gets faster: the next try keeps full.
  slow = false;
  const rest = simulate(60, () => 5, 70, pacer, first.end);
  assert.equal(rest.pacer.mode, "full");
  const rate = fps(rest.draws, rest.draws.at(-1) - 5000, rest.draws.at(-1));
  assert.ok(rate > 55, `${rate.toFixed(1)} fps once it is fast`);
});

test("the warm-up is not judged: slow first seconds do not cost the full rate", () => {
  const { pacer, draws } = simulate(60, (t) => (t < 2500 ? 90 : 5), 12);
  assert.equal(pacer.mode, "full");
  assert.ok(fps(draws, 8000, 12000) > 55);
});

test("a hidden tab is not a slow device", () => {
  const pacer = new FramePacer();
  const a = simulate(60, () => 5, 5, pacer);
  assert.equal(a.pacer.mode, "full");
  // Two seconds with no frames at all, then play on.
  pacer.frame(a.draws.at(-1) + 3000);
  const b = simulate(60, () => 5, 6, pacer);
  assert.equal(b.pacer.mode, "full");
});

test("the same timestamps always give the same draws", () => {
  const x = simulate(75, (t) => (t % 700 < 60 ? 30 : 6), 8);
  const y = simulate(75, (t) => (t % 700 < 60 ? 30 : 6), 8);
  assert.deepEqual(x.draws, y.draws);
});
