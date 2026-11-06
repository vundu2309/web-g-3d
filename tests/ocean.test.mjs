import { test } from "node:test";
import assert from "node:assert/strict";
import {
  move,
  spawn,
  SEA_BOUND,
  islands,
  readBoat,
} from "../src/ocean/model.ts";

test("boats have stable per-account spawns, steer, stop while fishing, and stay inside the sea", () => {
  assert.deepEqual(spawn("minh"), spawn("minh"));
  for (let i = 0; i < 1000; i++)
    assert.ok(Math.abs(spawn(`account-${i}`).heading) <= Math.PI);
  assert.ok(
    new Set(
      ["minh", "lan", "an", "binh", "chi", "dung"].map((id) => spawn(id).x),
    ).size > 3,
    "accounts spread over the harbor",
  );
  const pose = { x: 0, z: 0, heading: 0, fishing: false };
  assert.ok(move(pose, 0, 1, 0.05).z < 0);
  assert.ok(move(pose, 1, 0, 0.05).heading > 0);
  const fishing = { ...pose, fishing: true };
  assert.equal(move(fishing, 1, 1, 0.05), fishing);
  assert.equal(
    move({ ...pose, x: SEA_BOUND, heading: Math.PI / 2 }, 0, 1, 0.05).x,
    SEA_BOUND,
  );
  assert.deepEqual(
    move(pose, 0, 1, 5),
    move(pose, 0, 1, 0.05),
    "lag does not teleport boats",
  );
  const island = islands[0];
  const near = { ...pose, x: island.x, z: island.z + island.radius + 3.01 };
  assert.equal(move(near, 0, 1, 0.05).z, near.z, "hull cannot enter land");
});
test("malformed remote boats are discarded rather than passed to the renderer", () => {
  const data = {
    name: "<img src=x>",
    session: "session",
    x: 0,
    z: 1,
    heading: 0,
    fishing: false,
    updatedAt: { toMillis: () => 123 },
  };
  assert.equal(readBoat("minh", data).updatedAt, 123);
  for (const invalid of [
    { x: NaN },
    { z: Infinity },
    { x: 181 },
    { heading: 12 },
    { name: "x".repeat(25) },
    { fishing: 1 },
    { updatedAt: 0 },
  ])
    assert.equal(readBoat("minh", { ...data, ...invalid }), null);
});

test("stick maps one drag to analog steering and throttle together", async () => {
  const { stickInput, stickKnob, STICK_DEADZONE } = await import(
    "../src/ocean/stick.ts"
  );
  const radius = 44;
  assert.deepEqual(stickInput(0, 0, radius), { steer: 0, throttle: 0 });
  // Inside the dead zone nothing moves, so a resting thumb does not drift the boat.
  const tiny = radius * STICK_DEADZONE * 0.9;
  assert.deepEqual(stickInput(tiny, -tiny, radius), { steer: 0, throttle: 0 });
  // Up is forward, down is reverse, right is a right turn.
  assert.equal(stickInput(0, -radius, radius).throttle, 1);
  assert.equal(stickInput(0, radius, radius).throttle, -1);
  assert.equal(stickInput(radius, 0, radius).steer, 1);
  assert.equal(stickInput(-radius, 0, radius).steer, -1);
  // Diagonal drag runs and turns at once: the whole point of the stick.
  const diagonal = stickInput(radius * 0.6, -radius * 0.7, radius);
  assert.ok(diagonal.steer > 0 && diagonal.throttle > 0);
  // Farther is stronger, and beyond the ring saturates instead of overshooting.
  assert.ok(
    stickInput(0, -radius * 0.8, radius).throttle >
      stickInput(0, -radius * 0.4, radius).throttle,
  );
  const far = stickInput(radius * 9, -radius * 9, radius);
  assert.ok(Math.abs(far.steer) <= 1 && Math.abs(far.throttle) <= 1);
  const knob = stickKnob(radius * 9, -radius * 9, radius);
  assert.ok(Math.hypot(knob.x, knob.y) <= radius + 1e-9);
  // Garbage input is inert.
  assert.deepEqual(stickInput(NaN, 5, radius), { steer: 0, throttle: 0 });
  assert.deepEqual(stickInput(5, 5, 0), { steer: 0, throttle: 0 });
  // The analog values drive the real movement model without special cases.
  const pose = { x: 0, z: 0, heading: 0, fishing: false };
  const moved = move(pose, diagonal.steer, diagonal.throttle, 0.05);
  assert.ok(moved.z < 0 && moved.heading > 0, "forward while turning right");
});

test("the render-scale governor keeps the sea sharp at the capped frame rate and only reacts to sustained slowness", async () => {
  const { ScaleGovernor } = await import("../src/ocean/render-scale.ts");
  const run = (governor, seconds, interval) => {
    const changes = [];
    for (let t = 0; t < seconds; t += interval) {
      const next = governor.sample(interval);
      if (next !== undefined) changes.push([+t.toFixed(1), next]);
    }
    return changes;
  };
  // The scene draws at most every 33 ms. That is normal, not slow: it must never blur.
  const steady = new ScaleGovernor({ sharpest: 0.5 });
  assert.deepEqual(run(steady, 120, 0.034), []);
  assert.equal(steady.scaling, 0.5);
  // 60 ms frames are genuinely slow: coarsen, in steps, never past the limit.
  const slow = new ScaleGovernor({ sharpest: 0.5 });
  const slowChanges = run(slow, 60, 0.06);
  assert.ok(
    slowChanges.length >= 2 && slowChanges.length <= 6,
    JSON.stringify(slowChanges),
  );
  assert.ok(slowChanges.every(([, level]) => level <= 2));
  assert.equal(slow.scaling, 2);
  // A start-up stall (shader compile, WASM) must not cost any sharpness.
  const stall = new ScaleGovernor({ sharpest: 0.5 });
  for (let i = 0; i < 3; i++) stall.sample(0.4);
  assert.deepEqual(run(stall, 30, 0.034), []);
  assert.equal(stall.scaling, 0.5);
  // A single slow window is a hiccup, not a trend.
  const hiccup = new ScaleGovernor({ sharpest: 0.5 });
  run(hiccup, 6, 0.034);
  run(hiccup, 2, 0.08);
  assert.deepEqual(run(hiccup, 30, 0.034), []);
  // And it recovers once the phone is comfortably fast again.
  const recover = new ScaleGovernor({ sharpest: 0.5 });
  run(recover, 30, 0.06);
  assert.ok(recover.scaling > 0.5);
  run(recover, 120, 0.02);
  assert.equal(recover.scaling, 0.5);
  // A hidden tab (huge gap) or garbage is ignored.
  const hidden = new ScaleGovernor({ sharpest: 0.5 });
  for (const dt of [5, NaN, -1, 0]) assert.equal(hidden.sample(dt), undefined);
});

test("connecting retries through a sleeping server, stops on fatal errors, and never leaks a late connection", async () => {
  const { connectWithRetry } = await import("../src/ocean/connect.ts");
  const timing = {
    deadlineMs: 600,
    attemptMs: 60,
    delaysMs: [5, 10],
    slowAfterMs: 40,
  };
  const live = new AbortController();
  // Fails twice (server waking), then connects; reports the slow state once.
  let calls = 0;
  const events = [];
  const value = await connectWithRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error("not yet");
      return "connected";
    },
    live.signal,
    {
      ...timing,
      onSlow: () => events.push("slow"),
      onAttempt: (n) => events.push(n),
    },
  );
  assert.equal(value, "connected");
  assert.deepEqual(
    events.filter((e) => e !== "slow"),
    [1, 2, 3],
  );
  // A fatal error is not retried.
  calls = 0;
  await assert.rejects(
    connectWithRetry(
      async () => {
        calls++;
        throw new Error("signed out");
      },
      live.signal,
      { ...timing, isFatal: () => true },
    ),
    /signed out/,
  );
  assert.equal(calls, 1);
  // Gives up after the deadline with the last real error, in bounded time.
  calls = 0;
  const begin = Date.now();
  await assert.rejects(
    connectWithRetry(
      async () => {
        calls++;
        throw new Error("still down");
      },
      live.signal,
      { ...timing, deadlineMs: 150 },
    ),
    /still down/,
  );
  assert.ok(
    calls >= 3 && Date.now() - begin < 400,
    `${calls} tries in ${Date.now() - begin} ms`,
  );
  // A hung attempt is abandoned and retried; a late success is handed to discard().
  calls = 0;
  const discarded = [];
  const result = await connectWithRetry(
    (signal) =>
      new Promise((resolve) => {
        calls++;
        if (calls === 1) setTimeout(() => resolve("late"), 120);
        else resolve("fresh");
        signal.addEventListener("abort", () => {});
      }),
    live.signal,
    { ...timing, discard: (v) => discarded.push(v) },
  );
  assert.equal(result, "fresh");
  await new Promise((r) => setTimeout(r, 160));
  assert.deepEqual(
    discarded,
    ["late"],
    "the connection that arrived too late is closed",
  );
  // Slow is reported even while a single attempt is still hanging.
  let slow = false;
  const slowRun = connectWithRetry(
    () => new Promise((resolve) => setTimeout(() => resolve("ok"), 55)),
    live.signal,
    { ...timing, attemptMs: 200, slowAfterMs: 20, onSlow: () => (slow = true) },
  );
  assert.equal(await slowRun, "ok");
  assert.equal(slow, true);
  // Leaving the sea cancels it promptly and runs no further attempts.
  const leaving = new AbortController();
  calls = 0;
  const cancelled = connectWithRetry(
    async () => {
      calls++;
      throw new Error("down");
    },
    leaving.signal,
    { ...timing, delaysMs: [200] },
  );
  setTimeout(() => leaving.abort(), 30);
  await assert.rejects(cancelled);
  assert.equal(calls, 1);
});

test("every account starts in the shared harbor, close together and facing the same way", async () => {
  const { HARBOR } = await import("../src/ocean/model.ts");
  const starts = [];
  for (let i = 0; i < 3000; i++)
    starts.push(spawn(`account-${i}-${(i * 7919) % 1000003}`));
  assert.ok(
    starts.every((s) => s.heading === 0 && s.fishing === false),
    "all face the open sea",
  );
  assert.ok(
    starts.every(
      (s) =>
        Math.abs(s.x - HARBOR.x) <= 12.5 &&
        s.z - HARBOR.z >= -1.6 &&
        s.z - HARBOR.z <= 8.6,
    ),
    "all inside the small harbor box",
  );
  let widest = 0;
  for (let i = 0; i < starts.length; i += 7)
    for (let j = i + 1; j < starts.length; j += 11)
      widest = Math.max(
        widest,
        Math.hypot(starts[i].x - starts[j].x, starts[i].z - starts[j].z),
      );
  assert.ok(
    widest < 27,
    `any two players start within ${widest.toFixed(1)} m of each other`,
  );
  // The two real accounts that could not find each other used to start 27.6 m apart,
  // with one 86 degrees to the side of the other's bow.
  const a = spawn("b81514cf-a7f7-490f-a59c-194e8810f027");
  const b = spawn("2f45aed2-2a6d-4057-a0ab-619028508ea2");
  assert.ok(
    Math.hypot(a.x - b.x, a.z - b.z) < 27,
    "and they now share the harbor",
  );
  for (const s of starts) {
    assert.ok(
      islands.every(
        (i) => Math.hypot(s.x - i.x, s.z - i.z) > i.radius * 1.08 + 5,
      ),
      "never inside an island",
    );
    assert.ok(Math.abs(s.x) < 180 && Math.abs(s.z) < 180, "inside the sea");
  }
});

test("an off-screen player gets an arrow pointing toward them, on a ring inside the view", async () => {
  const { edgeIndicator } = await import("../src/ocean/indicator.ts");
  const near = (a, b, label) =>
    assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} vs ${b}`);
  // Camera heading 0 looks toward -Z. Right is +X.
  const ahead = edgeIndicator(0, -40, 0);
  near(ahead.x, 0.5, "ahead x");
  assert.ok(
    ahead.y < 0.3 && ahead.turn === 0 && ahead.distance === 40,
    "ahead: up",
  );
  const right = edgeIndicator(40, 0, 0);
  assert.ok(
    right.x > 0.8 && Math.abs(right.y - 0.5) < 1e-6,
    "right: right edge",
  );
  near(right.turn, Math.PI / 2, "right turn");
  const left = edgeIndicator(-40, 0, 0);
  assert.ok(left.x < 0.2, "left: left edge");
  near(left.turn, -Math.PI / 2, "left turn");
  const behind = edgeIndicator(0, 40, 0);
  assert.ok(
    behind.y > 0.7 && Math.abs(Math.abs(behind.turn) - Math.PI) < 1e-6,
    "behind: down",
  );
  // The camera's own heading matters: facing +X (heading pi/2), a boat at +X is ahead.
  const turned = edgeIndicator(40, 0, Math.PI / 2);
  near(turned.turn, 0, "turned camera");
  // Always on the ring and inside the screen, for any direction and distance.
  for (let k = 0; k < 720; k++) {
    const angle = (k / 720) * Math.PI * 2;
    for (const distance of [3, 40, 900]) {
      const m = edgeIndicator(
        Math.sin(angle) * distance,
        -Math.cos(angle) * distance,
        0.7 * Math.sin(k),
      );
      assert.ok(
        m.x >= 0.1 && m.x <= 0.9 && m.y >= 0.2 && m.y <= 0.8,
        `inside the view at ${angle.toFixed(2)} rad`,
      );
      assert.ok(
        Number.isFinite(m.turn) && Math.abs(m.distance - distance) < 1e-6,
      );
    }
  }
  // Right on top of the camera: no NaN, still a valid place.
  const here = edgeIndicator(0, 0, 0);
  assert.ok(Number.isFinite(here.x) && Number.isFinite(here.y));
});

test("saved sea state restores a safe position and the catch count, and rejects anything doubtful", async () => {
  const { encodeSave, decodeSave, saveKey } = await import(
    "../src/ocean/save.ts"
  );
  const now = 1_800_000_000_000;
  const make = (extra = {}) => ({
    x: 30,
    z: 40,
    heading: 1.2,
    caught: 7,
    ...extra,
  });
  const raw = (extra = {}, stamp = now - 60_000) =>
    JSON.stringify({ v: 1, savedAt: stamp, ...make(extra) });
  // Round trip.
  const back = decodeSave(encodeSave(make(), now), now + 1000);
  assert.deepEqual(back.pose, { x: 30, z: 40, heading: 1.2, fishing: false });
  assert.equal(back.caught, 7);
  // Per-account key.
  assert.notEqual(saveKey("a"), saveKey("b"));
  // The catch count survives even when the position cannot be trusted.
  for (const bad of [
    raw({ x: NaN }),
    raw({ x: 500 }),
    raw({ z: -179 }),
    raw({ heading: 9 }),
    raw({ x: -68, z: -65 }), // inside the first island
    raw({}, now - 8 * 24 * 3600 * 1000), // stale
    raw({}, now + 3600_000), // from the future
    JSON.stringify({
      v: 1,
      savedAt: now,
      x: "30",
      z: 40,
      heading: 1,
      caught: 3,
    }),
  ]) {
    const r = decodeSave(bad, now);
    assert.equal(r.pose, undefined, bad);
  }
  assert.equal(decodeSave(raw({ x: 500 }), now).caught, 7);
  // Garbage is harmless.
  for (const junk of [
    null,
    "",
    "not json",
    "[]",
    "null",
    "42",
    JSON.stringify({ v: 2, x: 1 }),
    JSON.stringify({ x: 1, z: 2 }),
  ])
    assert.deepEqual(decodeSave(junk, now), { caught: 0, fish: {} });
  // The count is a sane whole number.
  assert.equal(decodeSave(raw({ caught: -5 }), now).caught, 0);
  assert.equal(decodeSave(raw({ caught: 3.9 }), now).caught, 3);
  assert.equal(decodeSave(raw({ caught: 1e12 }), now).caught, 1_000_000);
  assert.equal(JSON.parse(encodeSave(make({ caught: -3 }), now)).caught, 0);
  // The fish store round-trips, and only known species with sane numbers come back.
  const fish = { "ca-mu": { n: 3, best: 6.8 }, "ca-com": { n: 0, best: 0.2 } };
  assert.deepEqual(decodeSave(encodeSave(make({ fish }), now), now).fish, fish);
  assert.deepEqual(
    decodeSave(encodeSave(make(), now), now).fish,
    {},
    "old saves have none",
  );
  const dirty = {
    "ca-mu": { n: 2.9, best: 7 },
    "ca-ngu": { n: -4, best: 1e9 },
    "ca-rong": { n: 5, best: 1 }, // not a species
    "ca-chim": "many",
    "ca-hong": { n: 1e9, best: "heavy" },
  };
  const clean = decodeSave(raw({ fish: dirty }), now).fish;
  assert.deepEqual(clean["ca-mu"], { n: 2, best: 7 });
  assert.deepEqual(
    clean["ca-ngu"],
    { n: 0, best: 500 },
    "a record is capped, a negative count is none",
  );
  assert.equal(clean["ca-rong"], undefined);
  assert.equal(clean["ca-chim"], undefined);
  assert.deepEqual(clean["ca-hong"], { n: 9999, best: 0 });
  assert.deepEqual(decodeSave(raw({ fish: [1, 2] }), now).fish, {});
  assert.deepEqual(
    decodeSave(raw({ x: 500, fish }), now).fish,
    fish,
    "kept when the position is bad",
  );
});

test("remote boats are played back between samples: continuous at a low publish rate, shortest turn, no extrapolation", async () => {
  const { RemoteTracks, ServerClock } = await import("../src/ocean/remote.ts");
  const tracks = new RemoteTracks();
  const at = (x, heading = 0) => ({ x, z: 0, heading, fishing: false });
  tracks.push("lan", 1000, at(0));
  tracks.push("lan", 1200, at(10));
  tracks.push("lan", 1100, at(99)); // out of order: ignored
  tracks.push("lan", 1200, at(99)); // duplicate time: ignored
  assert.equal(tracks.sample("lan", 1100).x, 5, "midway between two samples");
  assert.equal(tracks.sample("lan", 900).x, 0, "holds the first sample");
  assert.equal(
    tracks.sample("lan", 5000).x,
    10,
    "never extrapolates past the newest",
  );
  assert.equal(tracks.sample("nobody", 1000), undefined);
  // 5 samples per second at 8 m/s, drawn at 60 fps one tick behind: every frame moves
  // by about the same amount. The old blend-towards-newest stalled between packets.
  const track = new RemoteTracks();
  for (let i = 0; i <= 10; i++) track.push("minh", i * 200, at(i * 1.6));
  const steps = [];
  let previous = track.sample("minh", 400).x;
  for (let t = 400 + 1000 / 60; t <= 1600; t += 1000 / 60) {
    const x = track.sample("minh", t).x;
    steps.push(x - previous);
    previous = x;
  }
  const mean = steps.reduce((a, b) => a + b) / steps.length;
  assert.ok(
    steps.every((s) => Math.abs(s - mean) < mean * 0.05),
    "even steps",
  );
  // Turning across the +-pi seam goes the short way.
  const turn = new RemoteTracks();
  turn.push("an", 0, at(0, 3.0));
  turn.push("an", 100, at(0, -3.0));
  const heading = Math.abs(turn.sample("an", 50).heading);
  assert.ok(heading > 3.1, `short arc through pi, not through 0 (${heading})`);
  tracks.keepOnly(new Set());
  assert.equal(tracks.sample("lan", 1100), undefined);
  assert.equal(tracks.latest("lan"), -Infinity);

  // Network jitter: a late packet must not pull playback back, a quick one moves it on.
  const clock = new ServerClock();
  assert.equal(clock.now(0), undefined);
  clock.observe(10_000, 0);
  assert.equal(clock.now(500), 10_500);
  clock.observe(10_900, 1000); // this one was delayed 100 ms: offset barely moves
  assert.ok(
    Math.abs(clock.now(1000) - 11_000) < 5,
    "a delayed packet is mostly ignored",
  );
  clock.observe(11_300, 1000); // a quicker path: playback follows at once
  assert.equal(clock.now(1000), 11_300);
});

test("playback trail must cover the send period, the tick wait and jitter, or boats stall between packets", async () => {
  const { RemoteTracks } = await import("../src/ocean/remote.ts");
  // Pace of 207 ms drifting against a 200 ms server tick, 0-60 ms of jitter each way.
  let seed = 7;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 4294967296) * n;
  };
  const arrivals = [];
  for (let i = 0; i < 80; i++) {
    const moved = i * 207 + random(60);
    const sent = Math.ceil(moved / 200) * 200; // the next tick
    arrivals.push({ moved, arrives: sent + random(60), x: moved * 0.008 });
  }
  const stalls = (trail) => {
    const tracks = new RemoteTracks();
    let next = 0;
    let previous;
    let stalled = 0;
    let frames = 0;
    for (let now = 3000; now < 15000; now += 1000 / 60) {
      while (next < arrivals.length && arrivals[next].arrives <= now) {
        const a = arrivals[next++];
        tracks.push("lan", a.moved, {
          x: a.x,
          z: 0,
          heading: 0,
          fishing: false,
        });
      }
      const pose = tracks.sample("lan", now - trail);
      if (pose && previous !== undefined) {
        frames++;
        if (pose.x - previous < (8 / 60) * 0.3) stalled++;
      }
      if (pose) previous = pose.x;
    }
    return stalled / frames;
  };
  assert.ok(stalls(500) < 0.01, `a 500 ms trail glides (${stalls(500)})`);
  assert.ok(
    stalls(300) > 0.05,
    `a 300 ms trail starves between packets (${stalls(300)})`,
  );
});

test("floating stick centres under the thumb but stays fully on screen", async () => {
  const { floatingCenter } = await import("../src/ocean/stick.ts");
  assert.deepEqual(floatingCenter(300, 200, 68, 844, 390), { x: 300, y: 200 });
  // Near an edge the ring is pulled in so all of it is visible.
  assert.deepEqual(floatingCenter(5, 385, 68, 844, 390), { x: 68, y: 322 });
  assert.deepEqual(floatingCenter(9999, -9, 68, 844, 390), { x: 776, y: 68 });
  // A screen smaller than the ring still gives a finite centre.
  assert.deepEqual(floatingCenter(10, 10, 68, 100, 100), { x: 50, y: 50 });
});

test("name labels that would overlap are stacked, distant ones are left alone", async () => {
  const { separateLabels } = await import("../src/ocean/indicator.ts");
  const box = (x, y) => ({ x, y, w: 60, h: 24 });
  assert.deepEqual(separateLabels([]), []);
  assert.deepEqual(separateLabels([box(100, 100), box(400, 100)]), [0, 0]);
  // Same spot: the lower one keeps its place, the other lifts clear of it.
  const [upper, lower] = separateLabels([box(100, 90), box(104, 100)]);
  assert.equal(lower, 0);
  assert.ok(upper >= 24 - 10, `lifted ${upper}`);
  const clear = 100 - 24 - 3;
  assert.equal(90 - upper, Math.min(90, clear));
  // Three in a pile all end up separated.
  const boxes = [box(100, 100), box(100, 102), box(100, 98)];
  const lifts = separateLabels(boxes);
  const tops = boxes.map((b, i) => b.y - lifts[i]).sort((a, b) => a - b);
  for (let i = 1; i < tops.length; i++)
    assert.ok(tops[i] - tops[i - 1] >= 24, `gap ${tops[i] - tops[i - 1]}`);
});
