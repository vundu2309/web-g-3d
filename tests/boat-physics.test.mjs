import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import HavokPhysics from "@babylonjs/havok";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import {
  createBoatPhysics,
  enableSeaPhysics,
} from "../src/ocean/boat-physics.ts";
import { humpAt, planingAt } from "../src/ocean/boat-physics.ts";
import {
  WAVES,
  WIND_DIRECTION,
  MAX_WAVE_HEIGHT,
  glslWaveHeight,
  waveGradient,
  waveHeight,
} from "../src/ocean/waves.ts";

// Real Havok, headless: no canvas. Each case builds a fresh world and steps it a
// fixed 1/60 s at a time, so every run with the same inputs is identical.
const DT = 1 / 60;
let havok;
before(async () => {
  const wasmBinary = await readFile(
    new URL(
      "../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm",
      import.meta.url,
    ),
  );
  havok = await HavokPhysics({ wasmBinary });
});

function world({ islands = [], start } = {}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  enableSeaPhysics(scene, new HavokPlugin(false, havok));
  let clock = 0;
  const boat = createBoatPhysics(scene, { islands, time: () => clock, start });
  return {
    boat,
    run(seconds, control = () => ({}), observe = () => {}) {
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i++) {
        Object.assign(boat.input, { steer: 0, throttle: 0 }, control(clock));
        scene._advancePhysicsEngineStep(1000 * DT + 0.001);
        clock += DT;
        observe(boat.state(), clock);
      }
    },
    dispose() {
      boat.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const deg = (r) => (r * 180) / Math.PI;

test("the shader wave function is generated from the same waves as the CPU one", () => {
  const glsl = glslWaveHeight();
  assert.match(glsl, /float waveHeight\(vec2 p, float t\)/);
  assert.match(glsl, /vec2 waveSlope\(vec2 p, float t, float dist\)/);
  // One sin per wave in the height and one per wave in the slope.
  assert.equal((glsl.match(/sin\(/g) ?? []).length, 2 * WAVES.length);
  // Bounded by the summed amplitudes, and it really moves in time.
  for (let i = 0; i < 200; i++)
    assert.ok(Math.abs(waveHeight(i * 3.1, i * 1.7, i * 0.37)) <= 1.2);
  assert.notEqual(waveHeight(5, 5, 0), waveHeight(5, 5, 1.3));
});

test("the sea has sharp crests and broad troughs, a zero mean, and an exact slope", () => {
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const h = waveHeight((i * 7.31) % 900, (i * 3.77) % 900, 0);
    max = Math.max(max, h);
    min = Math.min(min, h);
    sum += h;
    assert.ok(Math.abs(h) <= MAX_WAVE_HEIGHT + 1e-9);
  }
  assert.ok(Math.abs(sum / n) < 0.05, `mean ${sum / n}`);
  // Crests rise higher than the troughs fall (a plain sine sum is symmetric).
  assert.ok(max > -min, `crest ${max} trough ${min}`);
  // The analytic slope matches a central difference.
  const e = 1e-4;
  for (let i = 0; i < 50; i++) {
    const x = i * 13.7;
    const z = i * 5.3;
    const t = i * 0.41;
    const g = waveGradient(x, z, t);
    const gx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
    const gz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
    assert.ok(
      Math.abs(g.x - gx) < 1e-4 && Math.abs(g.z - gz) < 1e-4,
      `slope at ${i}`,
    );
  }
  assert.ok(WAVES.every((w) => w.sharp >= 1));
});

test("the waves are a calm wind sea: a band of headings around the wind, swell to chop", () => {
  assert.ok(WAVES.length >= 10, `${WAVES.length} waves`);
  const lengths = WAVES.map((w) => w.length);
  assert.ok(Math.min(...lengths) >= 2 && Math.max(...lengths) <= 62);
  assert.equal(new Set(lengths).size, WAVES.length, "no two the same length");
  // Calm: the summed amplitude stays near 0.8 m.
  assert.ok(
    MAX_WAVE_HEIGHT > 0.65 && MAX_WAVE_HEIGHT < 0.9,
    `${MAX_WAVE_HEIGHT}`,
  );
  const off = WAVES.map((w) => w.direction - WIND_DIRECTION);
  // Every wave comes from the wind's side of the sea, but not all from one heading.
  assert.ok(off.every((d) => Math.abs(d) < Math.PI / 2));
  const spread = Math.sqrt(mean(off.map((d) => d * d)));
  assert.ok(spread > 0.4, `heading spread ${spread.toFixed(2)} rad`);
  // The long swell runs closer to the wind than the short chop.
  const byLength = [...WAVES].sort((a, b) => b.length - a.length);
  const gap = (w) => Math.abs(w.direction - WIND_DIRECTION);
  const longest = mean(byLength.slice(0, 4).map(gap));
  const shortest = mean(byLength.slice(-4).map(gap));
  assert.ok(longest < 0.3 && shortest > longest * 2, `${longest} ${shortest}`);
});

test("a boat floats on the surface it sees and bobs with the waves instead of sinking or flying", () => {
  const w = world();
  const above = [];
  const heights = [];
  let worstRoll = 0;
  let worstPitch = 0;
  w.run(
    30,
    () => ({}),
    (s, t) => {
      if (t > 10) {
        above.push(s.y - waveHeight(s.x, s.z, t));
        heights.push(s.y);
      }
      worstRoll = Math.max(worstRoll, Math.abs(deg(s.roll)));
      worstPitch = Math.max(worstPitch, Math.abs(deg(s.pitch)));
    },
  );
  w.dispose();
  const average = mean(above);
  const swing = Math.sqrt(mean(heights.map((y) => (y - mean(heights)) ** 2)));
  assert.ok(
    Math.abs(average - 0.25) < 0.15,
    `rides about 0.25 m above the local surface, got ${average.toFixed(3)}`,
  );
  assert.ok(
    Math.min(...above) > -0.35 && Math.max(...above) < 0.85,
    `never sinks or leaps off the surface: ${Math.min(...above).toFixed(2)}..${Math.max(...above).toFixed(2)}`,
  );
  assert.ok(swing > 0.15, `it rides the swell, std ${swing.toFixed(3)} m`);
  assert.ok(
    worstRoll < 30 && worstPitch < 30,
    `stays upright: roll ${worstRoll.toFixed(1)} pitch ${worstPitch.toFixed(1)}`,
  );
  assert.ok(worstRoll + worstPitch > 0.5, "and it does tilt with the waves");
  // A calm fishing sea: an idle boat rocks gently (the fishing camera rides on it).
  assert.ok(
    worstRoll < 12 && worstPitch < 8,
    `rocks gently: roll ${worstRoll.toFixed(1)} pitch ${worstPitch.toFixed(1)}`,
  );
});

test("thrust builds speed gradually, top speed is bounded, and the boat coasts after release", () => {
  const w = world();
  const at = {};
  w.run(
    28,
    (t) => ({ throttle: t < 12 ? 1 : 0 }),
    (s, t) => {
      for (const mark of [0.5, 3, 11.9, 13, 16, 27.9])
        if (Math.abs(t - mark) < DT / 2) at[mark] = s.forwardSpeed;
    },
  );
  w.dispose();
  assert.ok(at[0.5] > 0.3, "it does start moving");
  assert.ok(
    at[3] > 0.8 * at[11.9],
    `it gets up to speed fast: ${at[3].toFixed(2)} m/s after 3 s of ${at[11.9].toFixed(2)}`,
  );
  assert.ok(
    at[0.5] < 0.4 * at[11.9],
    `inertia: ${at[0.5].toFixed(2)} after 0.5 s vs ${at[11.9].toFixed(2)} at full speed`,
  );
  assert.ok(
    at[11.9] > 10.5 && at[11.9] < 14,
    `top speed ${at[11.9].toFixed(2)} m/s (it was 8 before the boat was made faster)`,
  );
  assert.ok(
    at[13] > 0.35 * at[11.9] && at[13] < at[11.9],
    `coasts: ${at[13].toFixed(2)} one second after release`,
  );
  assert.ok(at[16] < at[13], "and keeps slowing");
  assert.ok(
    at[27.9] < 1.5,
    `water drag stops it eventually: ${at[27.9].toFixed(2)}`,
  );
});

const unwrap = () => {
  let previous;
  let total = 0;
  return (heading) => {
    if (previous !== undefined) {
      let step = heading - previous;
      while (step > Math.PI) step -= 2 * Math.PI;
      while (step < -Math.PI) step += 2 * Math.PI;
      total += step;
    }
    previous = heading;
    return total;
  };
};

test("steering turns right and left, needs the hull moving to turn hard, and the keel resists sideslip", () => {
  const turn = (seconds, control) => {
    const w = world();
    const track = unwrap();
    let total = 0;
    let slip = 0;
    w.run(
      seconds,
      () => control,
      (s, t) => {
        total = track(s.heading);
        if (t > 3)
          slip = Math.max(
            slip,
            Math.abs(s.sideSpeed) / Math.max(1, Math.abs(s.forwardSpeed)),
          );
      },
    );
    w.dispose();
    return { total, slip };
  };
  const right = turn(6, { throttle: 1, steer: 1 });
  const left = turn(6, { throttle: 1, steer: -1 });
  const stopped = turn(2, { steer: 1 });
  assert.ok(
    right.total > 1,
    `steer +1 raises the heading: ${right.total.toFixed(2)} rad`,
  );
  assert.ok(
    left.total < -1,
    `steer -1 lowers it: ${left.total.toFixed(2)} rad`,
  );
  assert.ok(
    Math.abs(right.total + left.total) < 0.35,
    "left and right turn about equally",
  );
  assert.ok(
    right.slip < 0.4,
    `drifts sideways at most ${(right.slip * 100).toFixed(0)}% of forward speed`,
  );
  assert.ok(
    stopped.total > 0.02 && stopped.total < 0.4 * right.total,
    `turns slowly when stopped (${stopped.total.toFixed(2)} rad in 2 s), harder when moving`,
  );
});

test("an island stops the hull without letting it through, and the boat can back away", () => {
  const island = { x: 2.5, z: -45, radius: 10 };
  const w = world({ islands: [island] });
  let closest = Infinity;
  let reached = false;
  let backedAway = false;
  w.run(
    40,
    (t) => (t < 22 ? { throttle: 1 } : { throttle: -1 }),
    (s, t) => {
      const d = Math.hypot(s.x - island.x, s.z - island.z);
      closest = Math.min(closest, d);
      if (d < island.radius + 6) reached = true;
      if (reached && t > 30 && d > island.radius + 9) backedAway = true;
    },
  );
  const final = w.boat.state();
  w.dispose();
  assert.ok(reached, "it did reach the island");
  assert.ok(
    closest > island.radius + 0.9,
    `never tunnels in: closest centre ${closest.toFixed(2)} m, island radius ${island.radius}`,
  );
  // It may slide around the island while it pushes, but it is never inside it.
  assert.ok(
    Math.hypot(final.x - island.x, final.z - island.z) > island.radius + 0.9,
    "and it never ends up inside",
  );
  assert.ok(backedAway, "reverse thrust frees it again");
});

test("results repeat exactly for the same inputs", () => {
  const run = () => {
    const w = world();
    w.run(12, (t) => ({ throttle: 1, steer: Math.sin(t) }));
    const s = w.boat.state();
    w.dispose();
    return s;
  };
  const a = run();
  const b = run();
  for (const key of ["x", "y", "z", "heading", "roll", "pitch"])
    assert.ok(Math.abs(a[key] - b[key]) < 1e-6, key);
});

test("the soft wall keeps the boat inside the sea the server accepts", () => {
  const w = world({ start: { x: 150, z: 0, heading: Math.PI / 2 } });
  let farthest = 0;
  w.run(
    50,
    () => ({ throttle: 1 }),
    (s) => (farthest = Math.max(farthest, Math.abs(s.x))),
  );
  w.dispose();
  assert.ok(farthest < 186, `reached ${farthest.toFixed(1)} m of a 180 m sea`);
});

test("the start heading points the bow where the movement model says it does", () => {
  for (const heading of [0, Math.PI / 2, -Math.PI / 2, Math.PI * 0.75]) {
    const w = world({ start: { x: 0, z: 0, heading } });
    const first = w.boat.state();
    let last = first;
    w.run(
      4,
      () => ({ throttle: 1 }),
      (s) => (last = s),
    );
    w.dispose();
    assert.ok(
      Math.abs(
        Math.atan2(
          Math.sin(first.heading - heading),
          Math.cos(first.heading - heading),
        ),
      ) < 1e-3,
      `reports heading ${heading}, got ${first.heading}`,
    );
    // Heading 0 moves toward -Z; a positive heading swings the bow toward +X.
    const dx = last.x - first.x;
    const dz = last.z - first.z;
    assert.ok(
      Math.abs(dx - Math.sin(heading) * Math.hypot(dx, dz)) < 0.6,
      `moves along sin(h) in x for heading ${heading}`,
    );
    assert.ok(
      Math.abs(dz + Math.cos(heading) * Math.hypot(dx, dz)) < 0.6,
      `moves along -cos(h) in z for heading ${heading}`,
    );
  }
});

test("the hull parts the water: the bow climbs its own wave at the hump and the boat rides up when it planes", () => {
  // The two curves: a hump of wave-making drag around 7 m/s, planing from 6 to 10.5 m/s.
  assert.ok(humpAt(7) > 0.99 && humpAt(2) < 0.05 && humpAt(12.5) < 0.05);
  let last = -1;
  for (let v = 0; v <= 14; v += 0.5) {
    assert.ok(planingAt(v) >= last);
    last = planingAt(v);
  }
  assert.equal(planingAt(3), 0);
  assert.equal(planingAt(12), 1);
  // In the water: pitch up while climbing the hump, level once planing, and riding higher.
  const w = world();
  let bowUp = 0;
  const cruise = [];
  const idle = [];
  w.run(
    16,
    () => ({ throttle: 1 }),
    (s, t) => {
      if (t < 4) bowUp = Math.max(bowUp, deg(s.pitch));
      if (t > 8)
        cruise.push({
          pitch: deg(s.pitch),
          above: s.y - waveHeight(s.x, s.z, t),
        });
    },
  );
  w.dispose();
  const still = world();
  still.run(
    16,
    () => ({}),
    (s, t) => {
      if (t > 8) idle.push(s.y - waveHeight(s.x, s.z, t));
    },
  );
  still.dispose();
  assert.ok(bowUp > 4, `the bow rises at the hump: ${bowUp.toFixed(1)} deg`);
  assert.ok(
    Math.abs(mean(cruise.map((c) => c.pitch))) < 3.5,
    `and the hull levels out once planing: ${mean(cruise.map((c) => c.pitch)).toFixed(1)} deg`,
  );
  assert.ok(
    mean(cruise.map((c) => c.above)) > mean(idle) + 0.04,
    `it rides higher when planing: ${mean(cruise.map((c) => c.above)).toFixed(2)} m against ${mean(idle).toFixed(2)} m at rest`,
  );
});

test("the hull leans into a turn at speed, the other way for the other turn, and not when going straight", () => {
  const lean = (steer) => {
    const w = world();
    const rolls = [];
    w.run(
      13,
      (t) => ({ throttle: 1, steer: t > 5 ? steer : 0 }),
      (s, t) => {
        if (t > 7) rolls.push(deg(s.roll));
      },
    );
    w.dispose();
    return mean(rolls);
  };
  const right = lean(1);
  const left = lean(-1);
  const straight = lean(0);
  // Starboard side down (a negative roll) leans a right turn inward.
  assert.ok(
    right < straight - 4,
    `right turn leans in: ${right.toFixed(1)} vs ${straight.toFixed(1)} straight`,
  );
  assert.ok(
    left > straight + 4,
    `left turn leans in: ${left.toFixed(1)} vs ${straight.toFixed(1)} straight`,
  );
});
