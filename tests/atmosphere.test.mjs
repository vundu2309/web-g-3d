import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  DAY_MS,
  DEFAULT_PIN,
  WEATHER_SLOT_MS,
  WEATHER_FADE_MS,
  WEATHER_KINDS,
  NOON_HEIGHT,
  atmosphereAt,
  atmosphereFor,
  atmosphereWithPin,
  beaconLevel,
  dayFractionAt,
  parsePin,
  slotWeather,
  sunPath,
  weatherAt,
  weatherKindOf,
  weatherOfKind,
} from "../src/ocean/atmosphere.ts";
import {
  DEEP_TEAL,
  DEEP_WATER,
  FOG_DENSITY,
  HORIZON,
  SHALLOW_WATER,
  SUN_DIRECTION,
  ZENITH,
} from "../src/ocean/sea-style.ts";
import { LIGHT } from "../src/ocean/art/lighting.ts";
import { rainGeometry, RAIN_STREAKS } from "../src/ocean/rain.ts";
import { beamGeometry } from "../src/ocean/beacon.ts";
import { reflectsInWater } from "../src/ocean/reflection-model.ts";

const MIDDAY_CLEAR = atmosphereWithPin(0, { hour: 12, weather: "clear" });
const near = (a, b, eps = 1e-9, what = "") =>
  assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);
const rgb = (c) => [c.r, c.g, c.b];

/** Every number of an atmosphere, flattened, with its path (for continuity checks). */
function flat(value, path = "", out = {}) {
  if (typeof value === "number") out[path] = value;
  else if (Array.isArray(value))
    value.forEach((v, i) => flat(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      if (typeof v !== "string") flat(v, `${path}.${k}`, out);
  return out;
}

test("one game day is 24 real minutes and weather lasts a few minutes", () => {
  assert.equal(DAY_MS, 24 * 60 * 1000);
  assert.ok(
    WEATHER_SLOT_MS >= 2 * 60 * 1000 && WEATHER_SLOT_MS <= 8 * 60 * 1000,
  );
  assert.ok(WEATHER_FADE_MS < WEATHER_SLOT_MS, "a slot has a steady part");
});

test("midday, clear is exactly the sea's original look", () => {
  const a = MIDDAY_CLEAR;
  const sun = SUN_DIRECTION;
  near(a.sunDirection[0], sun.x, 1e-9, "sun x");
  near(a.sunDirection[1], sun.y, 1e-9, "sun y");
  near(a.sunDirection[2], sun.z, 1e-9, "sun z");
  assert.deepEqual([...a.horizon], rgb(HORIZON));
  assert.deepEqual([...a.zenith], rgb(ZENITH));
  assert.deepEqual([...a.fogColor], rgb(HORIZON));
  assert.equal(a.fogDensity, FOG_DENSITY);
  assert.deepEqual([...a.deep], rgb(DEEP_WATER));
  assert.deepEqual([...a.deepTeal], rgb(DEEP_TEAL));
  assert.deepEqual([...a.shallow], rgb(SHALLOW_WATER));
  assert.deepEqual([...a.sun.colour], rgb(LIGHT.sun.colour));
  assert.equal(a.sun.intensity, LIGHT.sun.intensity);
  assert.deepEqual([...a.sky.colour], rgb(LIGHT.sky.colour));
  assert.deepEqual([...a.sky.bounce], rgb(LIGHT.sky.bounce));
  assert.equal(a.sky.intensity, LIGHT.sky.intensity);
  assert.deepEqual([...a.sunShader], [1, 0.82, 0.58]);
  assert.equal(a.exposure, 1);
  assert.equal(a.cloudCover, 0, "the few clouds the sea always had");
  assert.equal(a.rain, 0);
  assert.equal(a.stars, 0);
  assert.equal(a.moon.intensity, 0);
  assert.deepEqual([...a.nightGlow], [0, 0, 0]);
  assert.equal(a.murk, 1);
});

test("the sun rises, peaks at noon, sets and goes under; the moon is opposite", () => {
  near(sunPath(0.5).height, NOON_HEIGHT, 1e-12);
  near(sunPath(0.25).height, 0, 1e-12, "sunrise");
  near(sunPath(0.75).height, 0, 1e-12, "sunset");
  assert.ok(sunPath(0).height < -0.3, "midnight: far below the horizon");
  assert.ok(sunPath(0.4).height > 0 && sunPath(0.6).height > 0);
  assert.ok(sunPath(0.1).height < 0 && sunPath(0.9).height < 0);
  for (let f = 0; f < 1; f += 0.013) {
    const { sun, moon } = sunPath(f);
    near(Math.hypot(...sun), 1, 1e-12, "unit sun");
    near(Math.hypot(...moon), 1, 1e-12, "unit moon");
    for (let i = 0; i < 3; i++) near(sun[i], -moon[i], 1e-12, "opposite");
  }
  // The sun moves through the sky: at dawn and at dusk it is on opposite sides.
  const dawn = sunPath(0.27).sun;
  const dusk = sunPath(0.73).sun;
  assert.ok(dawn[0] * dusk[0] + dawn[2] * dusk[2] < 0, "east and west");
});

test("the phases of the day: dawn, midday, dusk, night", () => {
  const at = (hour) => atmosphereWithPin(0, { hour, weather: "clear" });
  const noon = at(12);
  const night = at(0);
  const dawn = at(6.3);
  const dusk = at(17.7);
  assert.equal(noon.daylight, 1);
  assert.equal(night.daylight, 0);
  assert.equal(noon.stars, 0);
  assert.equal(night.stars, 1);
  assert.deepEqual([...night.sunShader], [0, 0, 0], "no sun at night");
  assert.equal(night.sun.intensity, 0);
  assert.ok(
    night.moon.intensity > 0.3 && night.moonShader[2] > 0.1,
    "a moon at night",
  );
  assert.ok(night.moonDirection[1] > 0.3, "the moon is up at midnight");
  assert.ok(night.nightGlow[2] > 0.05, "the water keeps a glow");
  assert.ok(night.exposure > 1.2, "the eye adapts");
  // Night stays readable: deep blue, not black.
  assert.ok(night.horizon[2] > 0.3 && night.zenith[2] > 0.15);
  assert.ok(night.sky.intensity >= 0.5, "fill light on the boats");
  // Dawn and dusk: warm, low sun, between day and night.
  for (const a of [dawn, dusk]) {
    assert.ok(a.sunHeight > 0 && a.sunHeight < 0.1, "the sun is just up");
    assert.ok(a.horizon[0] > a.horizon[2], "warm horizon");
    assert.ok(a.sunShader[0] > a.sunShader[2] * 1.5, "orange sun");
    assert.ok(a.daylight > 0.1 && a.daylight < 0.9);
  }
  assert.notDeepEqual(
    [...dawn.horizon],
    [...dusk.horizon],
    "dawn is rosier than dusk",
  );
  assert.ok(dawn.horizon[2] > dusk.horizon[2]);
  // Dusk and dawn mirror each other in the sky (same height, opposite sides).
  near(dawn.sunHeight, dusk.sunHeight, 1e-9);
});

test("the sun disc and the light fade out as the sun goes below the horizon", () => {
  const strength = (hour) => {
    const a = atmosphereWithPin(0, { hour, weather: "clear" });
    return a.sunShader[0] + a.sun.intensity;
  };
  let last = Infinity;
  for (let hour = 12; hour <= 19.5; hour += 0.1) {
    const v = strength(hour);
    assert.ok(v <= last + 1e-9, `the sun only dims after noon (${hour})`);
    last = v;
  }
  assert.equal(strength(19.5), 0);
});

test("keyframes join without jumps: every value moves smoothly all day, in every weather", () => {
  // One value per second over three game days, so the day wrap and many weather slots are in.
  const STEP = 1000;
  for (const pinned of [undefined, ...WEATHER_KINDS]) {
    let prev;
    let worst = 0;
    let where = "";
    for (let t = 0; t < 3 * DAY_MS; t += STEP) {
      const a =
        pinned === undefined
          ? atmosphereAt(t)
          : atmosphereWithPin(t, { weather: pinned });
      const f = flat(a);
      delete f[".dayFraction"];
      delete f[".weather.rain"];
      if (prev)
        for (const key of Object.keys(f)) {
          const step = Math.abs(f[key] - prev[key]);
          if (step > worst) {
            worst = step;
            where = `${key} at ${t}`;
          }
        }
      prev = f;
    }
    assert.ok(
      worst < 0.035,
      `${pinned ?? "clock"}: biggest step ${worst} (${where})`,
    );
  }
});

test("weather is the same for everyone and the same for the same millisecond", () => {
  for (let i = 0; i < 400; i++) {
    const t = 1.7e12 + i * 77_777;
    assert.deepEqual(weatherAt(t), weatherAt(t));
    assert.deepEqual(atmosphereAt(t), atmosphereAt(t));
  }
  // A fixed history (this is the contract between clients: it must not drift).
  assert.deepEqual(
    Array.from({ length: 12 }, (_, slot) => weatherKindOf(slot)),
    EXPECTED_KINDS,
  );
  // Order of calls does not matter (no hidden state).
  const a = atmosphereAt(5_000_000);
  atmosphereAt(1);
  atmosphereAt(9e12);
  assert.deepEqual(atmosphereAt(5_000_000), a);
});

const EXPECTED_KINDS = [
  "overcast",
  "clear",
  "rain",
  "overcast",
  "clear",
  "fog",
  "overcast",
  "clear",
  "clear",
  "rain",
  "overcast",
  "rain",
];

test("all four weathers occur, about as often as intended", () => {
  const count = { clear: 0, overcast: 0, rain: 0, fog: 0 };
  const N = 20000;
  for (let slot = 0; slot < N; slot++) count[weatherKindOf(slot)]++;
  assert.ok(Math.abs(count.clear / N - 0.4) < 0.02, JSON.stringify(count));
  assert.ok(Math.abs(count.overcast / N - 0.22) < 0.02);
  assert.ok(Math.abs(count.rain / N - 0.22) < 0.02);
  assert.ok(Math.abs(count.fog / N - 0.16) < 0.02);
});

test("weather cross-fades at slot edges with no jump, and is steady between", () => {
  const keys = ["cloud", "gloom", "rain", "fog"];
  let changed = 0;
  for (let slot = 1; slot < 60; slot++) {
    const edge = slot * WEATHER_SLOT_MS;
    const before = weatherAt(edge - 1);
    const after = weatherAt(edge + 1);
    for (const k of keys)
      near(before[k], after[k], 1e-4, `${k} at slot ${slot}`);
    // Half a fade before the edge the old weather is whole; half a fade after, the new one.
    const old = slotWeather(slot - 1);
    const next = slotWeather(slot);
    const early = weatherAt(edge - WEATHER_FADE_MS / 2 - 1);
    const late = weatherAt(edge + WEATHER_FADE_MS / 2 + 1);
    for (const k of keys) {
      near(early[k], old[k], 1e-9, `${k} steady before`);
      near(late[k], next[k], 1e-9, `${k} steady after`);
    }
    if (Math.abs(old.gloom - next.gloom) > 0.3) {
      changed++;
      const mid = weatherAt(edge).gloom;
      assert.ok(
        mid > Math.min(old.gloom, next.gloom) &&
          mid < Math.max(old.gloom, next.gloom),
        "the middle of the fade is between the two",
      );
    }
    // Millisecond by millisecond across the fade the largest step is tiny.
    let prev = weatherAt(edge - WEATHER_FADE_MS / 2).gloom;
    for (
      let t = edge - WEATHER_FADE_MS / 2;
      t <= edge + WEATHER_FADE_MS / 2;
      t += 500
    ) {
      const g = weatherAt(t).gloom;
      assert.ok(Math.abs(g - prev) < 0.012, `fade is smooth at ${t}`);
      prev = g;
    }
  }
  assert.ok(changed > 3, "the test saw real changes of weather");
});

test("the weathers look the part, and mist never thins the sea's fog", () => {
  const noon = (weather) => atmosphereWithPin(0, { hour: 12, weather });
  const clear = noon("clear");
  const overcast = noon("overcast");
  const rain = noon("rain");
  const fog = noon("fog");
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  for (const w of [overcast, rain, fog])
    assert.ok(w.sunShader[0] < clear.sunShader[0], "less sun");
  assert.ok(overcast.cloudCover > 0.9 && overcast.cloudGloom > 0.4);
  assert.ok(
    overcast.zenith[2] - overcast.zenith[0] < clear.zenith[2] - clear.zenith[0],
    "greyer",
  );
  assert.ok(
    rain.rain > 0.7 &&
      overcast.rain === 0 &&
      fog.rain === 0 &&
      clear.rain === 0,
  );
  assert.ok(
    rain.zenith[1] < overcast.zenith[1] &&
      lum(rain.horizon) < lum(overcast.horizon),
    "rain is darker",
  );
  assert.ok(
    rain.fogDensity > overcast.fogDensity &&
      overcast.fogDensity > clear.fogDensity,
  );
  assert.ok(fog.fogDensity > 2.5 * FOG_DENSITY, "short sight in mist");
  assert.ok(lum(fog.horizon) > 0.7, "mist is a soft light colour");
  assert.ok(rain.deep[2] < clear.deep[2], "the water is darker under rain");
  // The far rings of the water reach past the clear sea's fog (water-extent.ts): never thinner.
  for (let t = 0; t < 40 * WEATHER_SLOT_MS; t += 13_000)
    assert.ok(atmosphereAt(t).fogDensity >= FOG_DENSITY - 1e-12);
  // Stars hide behind cloud and mist.
  const clearNight = atmosphereWithPin(0, { hour: 0, weather: "clear" });
  const rainNight = atmosphereWithPin(0, { hour: 0, weather: "rain" });
  assert.equal(clearNight.stars, 1);
  assert.equal(rainNight.stars, 0);
  assert.ok(rainNight.horizon[2] > 0.1, "rain at night is still readable");
});

test("the weather strength varies from slot to slot, within bounds", () => {
  const seen = new Set();
  for (let slot = 0; slot < 300; slot++) {
    const w = slotWeather(slot);
    for (const v of Object.values(w)) assert.ok(v >= 0 && v <= 1);
    seen.add(w.gloom.toFixed(3));
  }
  assert.ok(seen.size > 20);
  assert.deepEqual(weatherOfKind("clear", 0), {
    cloud: 0,
    gloom: 0,
    rain: 0,
    fog: 0,
  });
});

test("the day follows UTC time and nothing else", () => {
  near(dayFractionAt(0), 0);
  near(dayFractionAt(DAY_MS / 2), 0.5);
  near(dayFractionAt(DAY_MS * 7 + DAY_MS / 4), 0.25, 1e-9);
  assert.ok(dayFractionAt(-1) > 0.999, "before the epoch still wraps");
  const t = Date.UTC(2026, 10, 17, 9, 3, 12);
  assert.equal(atmosphereAt(t).dayFraction, dayFractionAt(t));
});

test("pinning the time and weather reads the page address and is off by default", () => {
  assert.equal(parsePin(""), undefined);
  assert.equal(parsePin("?foo=1&weather=thunder&daytime=abc"), undefined);
  assert.deepEqual(parsePin("?daytime=21.5&weather=rain"), {
    hour: 21.5,
    weather: "rain",
  });
  assert.deepEqual(parsePin("?weather=fog"), { weather: "fog" });
  assert.deepEqual(parsePin("?daytime=30"), { hour: 6 });
  assert.deepEqual(parsePin("?daytime=-6"), { hour: 18 });
  // No pin: the shared clock. A pin fixes the part it names whatever the clock says.
  const t = 123_456_789;
  assert.deepEqual(atmosphereWithPin(t, undefined), atmosphereAt(t));
  assert.deepEqual(
    atmosphereWithPin(t, { hour: 12, weather: "clear" }),
    atmosphereWithPin(t + 7 * DAY_MS + 5 * WEATHER_SLOT_MS, {
      hour: 12,
      weather: "clear",
    }),
  );
  assert.equal(
    atmosphereWithPin(t, { hour: 3 }).weather.kind,
    weatherAt(t).kind,
  );
  assert.equal(
    atmosphereWithPin(t, { weather: "fog" }).dayFraction,
    dayFractionAt(t),
  );
});

test("the lighthouse lamp shines at night only, a little dimmer in rain", () => {
  assert.equal(beaconLevel(1, 0, 0), 0);
  assert.ok(beaconLevel(0, 0, 0) > 0.99);
  assert.ok(beaconLevel(0, 0.9, 1) < beaconLevel(0, 0, 0));
  assert.ok(beaconLevel(0, 0.9, 1) > 0.5, "still lit in a storm");
  for (let hour = 0; hour < 24; hour += 0.25) {
    const a = atmosphereWithPin(0, { hour, weather: "clear" });
    const level = beaconLevel(a.daylight, a.cloudGloom, a.rain);
    if (hour === 12) assert.equal(level, 0);
    assert.ok(level >= 0 && level <= 1);
  }
  const beam = beamGeometry();
  assert.equal(beam.indices.length, 4 * 6, "four strips, two triangles each");
  assert.equal(beam.positions.length / 3, 16);
});

test("rain is one mesh with the same streaks on every client, and the sea's mirror skips it", () => {
  const a = rainGeometry();
  const b = rainGeometry();
  assert.equal(a.positions.length, RAIN_STREAKS * 4 * 3);
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.corners], [...b.corners]);
  for (let i = 2; i < a.corners.length; i += 3)
    assert.ok(a.corners[i] >= 0 && a.corners[i] < 1.0001, "rank in 0..1");
  assert.equal(reflectsInWater("rain", "rain"), false);
  assert.equal(reflectsInWater("beacon-halo", "beacon-halo"), false);
  assert.equal(reflectsInWater("island", "matte"), true);
});

test("the sea follows the shared clock; the clear noon is only a pin (the Settings card's start, and browser tests)", () => {
  // The noon pin is still the sea's original look at every real time.
  assert.deepEqual(DEFAULT_PIN, { hour: 12, weather: "clear" });
  const midnight = DAY_MS * 40; // the shared clock is at midnight here
  assert.ok(atmosphereAt(midnight).daylight < 0.1, "the clock itself is dark");
  const noon = atmosphereWithPin(midnight, DEFAULT_PIN);
  assert.equal(noon.weather.kind, "clear");
  assert.equal(noon.weather.cloud, 0, "no clouds: the sea's original look");
  assert.ok(noon.daylight > 0.99, `full daylight (${noon.daylight})`);
  assert.ok(
    Math.abs(noon.sunHeight - NOON_HEIGHT) < 1e-6,
    "the sun is at its noon height",
  );
  for (const t of [0, DAY_MS * 0.25, DAY_MS * 3.7, 123_456_789])
    assert.deepEqual(atmosphereWithPin(t, DEFAULT_PIN), noon);
  // Without a pin the look is the shared clock's, whatever the hour (decision 0020: the same
  // clock sets the bites, so what the player sees is what they fish in).
  assert.deepEqual(
    atmosphereWithPin(midnight, undefined),
    atmosphereAt(midnight),
  );
  assert.ok(atmosphereWithPin(midnight, undefined).daylight < 0.1);
  // Wired in: no initial pin, but a test flag; the scene steps with the shared server clock.
  const dir = new URL("../src/", import.meta.url);
  const sea = readFileSync(new URL("ocean/sea-atmosphere.ts", dir), "utf8");
  assert.doesNotMatch(
    sea,
    /\?\? \{ \.\.\.DEFAULT_PIN \}\s*;?\s*\}\)\(\)/,
    "nothing is pinned by default",
  );
  assert.match(sea, /VITE_TEST_NOON/, "browser tests start at a clear noon");
  const scene = readFileSync(new URL("ocean/babylon-scene.ts", dir), "utf8");
  assert.match(
    scene,
    /stepAtmosphere\(this\.sharedClock\(\) \* 1000\)/,
    "the look follows the shared server clock",
  );
  const card = readFileSync(new URL("app/settings-weather.ts", dir), "utf8");
  assert.match(
    card,
    /pinAtmosphere\(undefined\)/,
    "the reset follows the shared clock",
  );
  assert.match(card, /"Giờ thật"/);
  for (const file of ["lib/dev.mjs", "test-browser.mjs"]) {
    const runner = readFileSync(
      new URL(`../scripts/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(
      runner,
      /VITE_TEST_NOON: "on"/,
      `${file} pins the tests to noon`,
    );
  }
});

test("the atmosphere is one shared object that every look reads", () => {
  const dir = new URL("../src/ocean/", import.meta.url);
  const owner = "sea-atmosphere.ts";
  for (const file of readdirSync(dir)) {
    // (The scene only starts its fog and clear colour from the constants; the lights
    // then overwrite them every frame.)
    if (
      !file.endsWith(".ts") ||
      file === owner ||
      file === "sea-style.ts" ||
      file === "babylon-scene.ts"
    )
      continue;
    const src = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(
      src,
      /import[^;]*\b(SUN_DIRECTION|HORIZON|ZENITH)\b[^;]*sea-style/s,
      `${file} reads the live atmosphere (SEA), not the midday constants`,
    );
  }
  const lighting = readFileSync(new URL("art/lighting.ts", dir), "utf8");
  assert.match(lighting, /SEA\./);
  for (const file of ["sky.ts", "water.ts", "swash.ts"]) {
    const src = readFileSync(new URL(file, dir), "utf8");
    assert.match(
      src,
      /bindAtmosphere\(material\)/,
      `${file} binds the shared atmosphere`,
    );
    assert.match(src, /ATMOSPHERE_UNIFORMS/, `${file} declares its uniforms`);
  }
  const scene = readFileSync(new URL("babylon-scene.ts", dir), "utf8");
  assert.match(
    scene,
    /stepAtmosphere\(this\.sharedClock\(\) \* 1000\)/,
    "the scene advances the clock once per frame, with the shared server clock",
  );
});

test("weather and time are only a look: physics, fishing, economy and the server never read them", () => {
  const dir = new URL("../src/ocean/", import.meta.url);
  const visual = /atmosphere|sea-atmosphere|weather|daytime/i;
  for (const file of [
    "waves.ts",
    "boat-physics.ts",
    "fishing.ts",
    "fight.ts",
    "cast-rules.ts",
    "economy.ts",
    "hull-handling.ts",
    "shore.ts",
    "water-extent.ts",
  ]) {
    const src = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(
      src,
      visual,
      `${file} must not depend on the day or the weather`,
    );
  }
  const server = readdirSync(new URL("../server/", import.meta.url)).filter(
    (f) => f.endsWith(".js") || f.endsWith(".mjs") || f.endsWith(".ts"),
  );
  for (const file of server) {
    const src = readFileSync(
      new URL(`../server/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(src, /atmosphere|weatherAt/, `server/${file}`);
  }
});

test("a whole-day sweep stays inside sane ranges", () => {
  for (let t = 0; t < DAY_MS * 2; t += 3_000) {
    const a = atmosphereAt(t);
    for (const [k, v] of Object.entries(flat(a))) {
      assert.ok(Number.isFinite(v), `${k} is finite at ${t}`);
    }
    for (const c of [
      a.horizon,
      a.zenith,
      a.sunShader,
      a.deep,
      a.sky.colour,
      a.rainColor,
    ])
      for (const v of c)
        assert.ok(v >= 0 && v <= 1.0001, `colour in range at ${t}`);
    assert.ok(a.exposure >= 1 && a.exposure <= 1.6);
    assert.ok(a.murk > 0.2 && a.murk <= 1);
    near(Math.hypot(...a.sunDirection), 1, 1e-9);
  }
  // atmosphereFor is what atmosphereAt wraps.
  const t = 777_000;
  assert.deepEqual(
    atmosphereAt(t),
    atmosphereFor(dayFractionAt(t), weatherAt(t)),
  );
});
