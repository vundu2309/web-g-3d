/**
 * The day and the weather of the sea, as pure maths (no Babylon, no clock of its own): one
 * function maps a UTC time in milliseconds to everything the sky, the water, the lights and the
 * fog need (`atmosphereAt`). Every client computes the same state from the same time, so all
 * players see the same hour and the same weather without a server. Weather is only a look: nothing
 * here reaches the waves, the boats or the fishing (waves.ts is untouched).
 *
 * The day is one game day of `DAY_MS`. The sun travels a flat arc (its noon height is the one
 * the sea always had) and keyframes are laid along the sun's height, not along the clock, so
 * dawn and dusk are the same colours mirrored and there is nothing to keep in step: between two
 * keyframes everything is eased (smoothstep), so no value ever jumps. The moon is opposite the
 * sun. The weather of each `WEATHER_SLOT_MS` slot is picked by a hash of the slot number and
 * cross-faded over `WEATHER_FADE_MS` around each boundary.
 */

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

/** One game day in real milliseconds (24 minutes). */
export const DAY_MS = 24 * 60 * 1000;
/** The weather changes at most this often (a few minutes), by a hash of the slot number. */
export const WEATHER_SLOT_MS = 4 * 60 * 1000;
/** The cross-fade between two slots takes this long, centred on their boundary. */
export const WEATHER_FADE_MS = 90 * 1000;

export type WeatherKind = "clear" | "overcast" | "rain" | "fog";
export const WEATHER_KINDS: readonly WeatherKind[] = [
  "clear",
  "overcast",
  "rain",
  "fog",
];

/** How much of the time each kind is chosen (they add up to 1). */
const WEIGHTS: Record<WeatherKind, number> = {
  clear: 0.4,
  overcast: 0.22,
  rain: 0.22,
  fog: 0.16,
};

/** The four numbers that describe a weather, all 0..1. */
export interface Weather {
  /** Cloud cover of the sky: 0 is the few clouds the sea always had, 1 is a lid. */
  cloud: number;
  /** How grey and dark the light is. */
  gloom: number;
  /** Rain falling. */
  rain: number;
  /** Mist on the water: short sight. */
  fog: number;
}

/** The sun's noon height (the sine of its elevation): the sea's own sun, 24 degrees up. */
export const NOON_HEIGHT = 0.32 / Math.hypot(0.45, 0.32, 0.55);
/** The horizontal direction of the noon sun (x, z), unit. */
const NOON_FLAT: readonly [number, number] = [
  -0.45 / Math.hypot(0.45, 0.55),
  -0.55 / Math.hypot(0.45, 0.55),
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A 32-bit integer hash (murmur3 finaliser), the same on every machine. */
export function hash32(n: number): number {
  let h = (Math.floor(n) | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const unit = (n: number) => hash32(n) / 4294967296;

/** The weather kind of one slot, by hash. */
export function weatherKindOf(slot: number): WeatherKind {
  const u = unit(slot);
  let sum = 0;
  for (const kind of WEATHER_KINDS) {
    sum += WEIGHTS[kind];
    if (u < sum) return kind;
  }
  return "clear";
}

const BASE: Record<WeatherKind, Weather> = {
  clear: { cloud: 0, gloom: 0, rain: 0, fog: 0 },
  overcast: { cloud: 1, gloom: 0.62, rain: 0, fog: 0.12 },
  rain: { cloud: 1, gloom: 0.88, rain: 1, fog: 0.3 },
  fog: { cloud: 0.55, gloom: 0.38, rain: 0, fog: 1 },
};

/** The weather of one slot: its kind and a strength that varies from slot to slot. */
export function slotWeather(slot: number, strength?: number): Weather {
  const kind = weatherKindOf(slot);
  const s = strength ?? unit(slot + 7919);
  return weatherOfKind(kind, s);
}

/** A kind at a strength 0..1 (1 is the fullest; clear's strength is how many clouds). */
export function weatherOfKind(kind: WeatherKind, strength = 1): Weather {
  const b = BASE[kind];
  if (kind === "clear") return { ...b, cloud: 0.18 * strength };
  const k = 0.75 + 0.25 * strength;
  return {
    cloud: kind === "fog" ? mix(0.4, 0.7, strength) : b.cloud,
    gloom: b.gloom * k,
    rain: b.rain * k,
    fog: b.fog * k,
  };
}

/** The weather at a UTC time: the slot's weather, cross-faded with its neighbour near a boundary. */
export function weatherAt(utcMs: number): Weather & { kind: WeatherKind } {
  const slot = Math.floor(utcMs / WEATHER_SLOT_MS);
  const pos = utcMs - slot * WEATHER_SLOT_MS;
  const half = WEATHER_FADE_MS / 2;
  let from = slot;
  let to = slot;
  let t = 0;
  if (pos < half) {
    from = slot - 1;
    t = 0.5 + pos / WEATHER_FADE_MS;
  } else if (pos > WEATHER_SLOT_MS - half) {
    to = slot + 1;
    t = (pos - (WEATHER_SLOT_MS - half)) / WEATHER_FADE_MS;
  }
  const a = slotWeather(from);
  const b = slotWeather(to);
  const e = t * t * (3 - 2 * t);
  return {
    cloud: mix(a.cloud, b.cloud, e),
    gloom: mix(a.gloom, b.gloom, e),
    rain: mix(a.rain, b.rain, e),
    fog: mix(a.fog, b.fog, e),
    // The name of whichever slot has the larger share (for the label in tests and tools).
    kind: weatherKindOf(e < 0.5 ? from : to),
  };
}

// ---------------------------------------------------------------------------------------
// The day: keyframes along the sun's height

/** One keyframe: everything that depends on the sun alone (clear weather). */
interface Frame {
  /** The sun's height (sine of its elevation) where this frame holds. */
  s: number;
  horizon: Rgb;
  zenith: Rgb;
  /** The sun as the shaders see it (colour times strength; black below the horizon). */
  sunShader: Rgb;
  /** The sun as the directional light of solid objects. */
  sunColour: Rgb;
  sunIntensity: number;
  /** The sky's fill light: from above, and the bounce from the sea below. */
  skyColour: Rgb;
  skyBounce: Rgb;
  skyIntensity: number;
  /** The moon as the shaders see it (glitter on the water, the lit edge of clouds). */
  moonShader: Rgb;
  moonIntensity: number;
  /** Light added to the water and the sand at night, so they stay deep blue and never black. */
  nightGlow: Rgb;
  exposure: number;
}

const MOON_COLOUR: Rgb = [0.55, 0.68, 1];

const FRAMES: readonly Frame[] = [
  {
    s: -0.28,
    horizon: [0.12, 0.2, 0.42],
    zenith: [0.03, 0.06, 0.21],
    sunShader: [0, 0, 0],
    sunColour: [1, 0.5, 0.3],
    sunIntensity: 0,
    skyColour: [0.45, 0.56, 0.95],
    skyBounce: [0.1, 0.17, 0.36],
    skyIntensity: 0.62,
    moonShader: [0.11, 0.15, 0.28],
    moonIntensity: 0.5,
    nightGlow: [0.016, 0.036, 0.09],
    exposure: 1.5,
  },
  {
    s: -0.1,
    horizon: [0.34, 0.31, 0.54],
    zenith: [0.07, 0.12, 0.33],
    sunShader: [0, 0, 0],
    sunColour: [1, 0.5, 0.3],
    sunIntensity: 0,
    skyColour: [0.55, 0.6, 0.95],
    skyBounce: [0.16, 0.22, 0.42],
    skyIntensity: 0.66,
    moonShader: [0.08, 0.11, 0.2],
    moonIntensity: 0.34,
    nightGlow: [0.011, 0.024, 0.06],
    exposure: 1.3,
  },
  {
    s: -0.02,
    horizon: [0.92, 0.5, 0.4],
    zenith: [0.17, 0.27, 0.54],
    sunShader: [0.36, 0.14, 0.06],
    sunColour: [1, 0.45, 0.25],
    sunIntensity: 0.3,
    skyColour: [0.78, 0.72, 0.9],
    skyBounce: [0.24, 0.3, 0.5],
    skyIntensity: 0.72,
    moonShader: [0.05, 0.07, 0.13],
    moonIntensity: 0.2,
    nightGlow: [0.005, 0.011, 0.028],
    exposure: 1.15,
  },
  {
    s: 0.05,
    horizon: [0.98, 0.7, 0.48],
    zenith: [0.3, 0.46, 0.74],
    sunShader: [0.95, 0.48, 0.21],
    sunColour: [1, 0.68, 0.42],
    sunIntensity: 1,
    skyColour: [0.95, 0.88, 0.86],
    skyBounce: [0.3, 0.42, 0.58],
    skyIntensity: 0.85,
    moonShader: [0, 0, 0],
    moonIntensity: 0,
    nightGlow: [0, 0, 0],
    exposure: 1,
  },
  {
    s: 0.18,
    horizon: [0.88, 0.84, 0.8],
    zenith: [0.28, 0.5, 0.8],
    sunShader: [1, 0.72, 0.44],
    sunColour: [1, 0.86, 0.66],
    sunIntensity: 1.25,
    skyColour: [0.93, 0.95, 1],
    skyBounce: [0.3, 0.48, 0.62],
    skyIntensity: 0.92,
    moonShader: [0, 0, 0],
    moonIntensity: 0,
    nightGlow: [0, 0, 0],
    exposure: 1,
  },
  {
    // Midday, clear: exactly the sea's original look (sea-style.ts and art/lighting.ts).
    s: NOON_HEIGHT,
    horizon: [0.8, 0.89, 0.94],
    zenith: [0.28, 0.55, 0.84],
    sunShader: [1, 0.82, 0.58],
    sunColour: [1, 0.93, 0.78],
    sunIntensity: 1.3,
    skyColour: [0.92, 0.96, 1],
    skyBounce: [0.3, 0.5, 0.64],
    skyIntensity: 0.95,
    moonShader: [0, 0, 0],
    moonIntensity: 0,
    nightGlow: [0, 0, 0],
    exposure: 1,
  },
];

/** A rosier dawn (the same keyframes serve dusk, which stays orange). */
const DAWN_ROSE: Rgb = [0.96, 0.6, 0.64];

const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const scale3 = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Pulls a colour toward its own grey (amount 0..1). */
const grey = (c: Rgb, amount: number): Rgb => {
  const l = lum(c);
  return lerp3(c, [l, l, l], amount);
};

/** The sun-only frame at a sun height (everything eased between the two keyframes around it). */
function frameAt(s: number): Frame {
  const last = FRAMES[FRAMES.length - 1]!;
  if (s >= last.s) return last;
  const first = FRAMES[0]!;
  if (s <= first.s) return first;
  let i = 1;
  while (FRAMES[i]!.s < s) i++;
  const a = FRAMES[i - 1]!;
  const b = FRAMES[i]!;
  const t = smooth(a.s, b.s, s);
  return {
    s,
    horizon: lerp3(a.horizon, b.horizon, t),
    zenith: lerp3(a.zenith, b.zenith, t),
    sunShader: lerp3(a.sunShader, b.sunShader, t),
    sunColour: lerp3(a.sunColour, b.sunColour, t),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    skyColour: lerp3(a.skyColour, b.skyColour, t),
    skyBounce: lerp3(a.skyBounce, b.skyBounce, t),
    skyIntensity: mix(a.skyIntensity, b.skyIntensity, t),
    moonShader: lerp3(a.moonShader, b.moonShader, t),
    moonIntensity: mix(a.moonIntensity, b.moonIntensity, t),
    nightGlow: lerp3(a.nightGlow, b.nightGlow, t),
    exposure: mix(a.exposure, b.exposure, t),
  };
}

/** The sea's own colours (sea-style.ts), which the weather greys. */
const DEEP: Rgb = [0, 0.26, 0.52];
const TEAL: Rgb = [0, 0.4, 0.5];
const SHALLOW: Rgb = [0.08, 0.72, 0.72];
/** The fog the sea always had (sea-style.ts FOG_DENSITY). */
const FOG_BASE = 0.0011;

export interface Atmosphere {
  /** 0..1 through the game day; 0.5 is noon, 0 and 1 midnight. */
  dayFraction: number;
  /** Unit vectors toward the sun and the moon (the moon is opposite). */
  sunDirection: Vec3;
  moonDirection: Vec3;
  /** The sine of the sun's elevation (negative below the horizon). */
  sunHeight: number;
  /** 1 in full day, 0 at night. */
  daylight: number;
  weather: Weather & { kind: WeatherKind };
  horizon: Rgb;
  zenith: Rgb;
  /** The fog is the horizon's colour, so the sea and the sky meet without a seam. */
  fogColor: Rgb;
  fogDensity: number;
  sunShader: Rgb;
  moonShader: Rgb;
  nightGlow: Rgb;
  exposure: number;
  /** The directional light of the sun and of the moon, for solid objects. */
  sun: { colour: Rgb; intensity: number };
  moon: { colour: Rgb; intensity: number };
  sky: { colour: Rgb; bounce: Rgb; intensity: number };
  /** Cloud cover and how dark the clouds are (the sky shader). */
  cloudCover: number;
  cloudGloom: number;
  /** Stars shining, 0..1 (cut by cloud and mist). */
  stars: number;
  /** Rain falling, 0..1, and the colour of the streaks. */
  rain: number;
  rainColor: Rgb;
  /** The water's body colours, greyed and darkened by the weather. */
  deep: Rgb;
  deepTeal: Rgb;
  shallow: Rgb;
  /** How bright things seen through the water are (the hooked fish): 1 by day, dim at night. */
  murk: number;
}

/** The sun's height and direction, and the moon's, at a fraction of the game day. */
export function sunPath(dayFraction: number) {
  const theta = 2 * Math.PI * (dayFraction - 0.5);
  const height = NOON_HEIGHT * Math.cos(theta);
  const flat = Math.sqrt(Math.max(0, 1 - height * height));
  const az = Math.atan2(NOON_FLAT[1], NOON_FLAT[0]) + theta;
  const sun: Vec3 = [Math.cos(az) * flat, height, Math.sin(az) * flat];
  const moon: Vec3 = [-sun[0], -sun[1], -sun[2]];
  return { height, sun, moon };
}

/** How brightly the lighthouse lamp shines (0..1): lit from dusk to dawn, a little dimmer in rain and cloud. */
export function beaconLevel(daylight: number, gloom: number, rain: number) {
  return (
    (1 - smooth(0.05, 0.6, daylight)) * (1 - 0.25 * gloom) * (1 - 0.2 * rain)
  );
}

/** The fraction of the game day (0..1) of a UTC time. */
export function dayFractionAt(utcMs: number): number {
  const f = (utcMs / DAY_MS) % 1;
  return f < 0 ? f + 1 : f;
}

/** The whole look of the sea at a day fraction and a weather. */
export function atmosphereFor(
  dayFraction: number,
  weather: Weather & { kind: WeatherKind },
): Atmosphere {
  const { height, sun, moon } = sunPath(dayFraction);
  const f = frameAt(height);
  const morning = dayFraction < 0.5 ? 1 : 0;
  const glow =
    morning *
    0.38 *
    smooth(-0.12, 0.0, height) *
    (1 - smooth(0.05, 0.2, height));
  const { cloud, gloom, rain, fog } = weather;
  const daylight = smooth(-0.12, 0.15, height);

  // Greyer and darker with gloom; mist makes the whole sky one soft light colour.
  let horizon = lerp3(f.horizon, DAWN_ROSE, glow);
  let zenith = f.zenith;
  // (The night is dark already: clouds darken it less.)
  const dim = gloom * (0.3 + 0.7 * daylight);
  horizon = scale3(grey(horizon, Math.min(1, gloom * 1.25)), 1 - 0.3 * dim);
  zenith = scale3(grey(zenith, Math.min(1, gloom * 1.15)), 1 - 0.42 * dim);
  const mist = lerp3(horizon, scale3(grey(horizon, 1), 1.04), fog * 0.85);
  horizon = mist;
  zenith = lerp3(zenith, horizon, fog * 0.8);

  // Direct light falls with cloud and mist; the fill from the sky grows a little.
  const direct = (1 - 0.8 * gloom) * (1 - 0.55 * fog);
  const moonDirect = (1 - 0.75 * gloom) * (1 - 0.5 * fog);
  const sunShader = scale3(f.sunShader, direct);
  const moonShader = scale3(f.moonShader, moonDirect);

  const wet = gloom * 0.55;
  const waterGrey = (c: Rgb): Rgb => scale3(grey(c, wet), 1 - 0.3 * gloom);

  return {
    dayFraction,
    sunDirection: sun,
    moonDirection: moon,
    sunHeight: height,
    daylight,
    weather,
    horizon,
    zenith,
    fogColor: horizon,
    fogDensity: FOG_BASE + 0.001 * rain + 0.0034 * fog + 0.0004 * gloom,
    sunShader,
    moonShader,
    nightGlow: f.nightGlow,
    exposure: f.exposure,
    sun: {
      colour: f.sunColour,
      intensity: f.sunIntensity * (1 - 0.7 * gloom) * (1 - 0.5 * fog),
    },
    moon: { colour: MOON_COLOUR, intensity: f.moonIntensity * moonDirect },
    sky: {
      colour: grey(f.skyColour, gloom * 0.7),
      bounce: f.skyBounce,
      intensity: f.skyIntensity * (1 + 0.12 * gloom),
    },
    cloudCover: cloud,
    cloudGloom: gloom,
    stars: (1 - smooth(-0.2, -0.04, height)) * (1 - cloud) * (1 - fog),
    rain,
    rainColor: lerp3([0.3, 0.37, 0.56], [0.8, 0.86, 0.92], daylight),
    deep: waterGrey(DEEP),
    deepTeal: waterGrey(TEAL),
    shallow: waterGrey(SHALLOW),
    murk: (0.3 + 0.7 * daylight) * (1 - 0.25 * gloom),
  };
}

/** The whole look of the sea at a UTC time: the shared clock every player agrees on. */
export function atmosphereAt(utcMs: number): Atmosphere {
  return atmosphereFor(dayFractionAt(utcMs), weatherAt(utcMs));
}

// ---------------------------------------------------------------------------------------
// Pinning the time and the weather (development and tests only)

export interface Pin {
  /** The hour of the game day, 0..24 (12 is noon). */
  hour: number;
  weather: WeatherKind;
}

/**
 * Reads `?daytime=<hour 0..24>` and `?weather=clear|overcast|rain|fog` from a query string. Either
 * one alone pins that part and leaves the other on the shared clock (`pin.hour` / `pin.weather`
 * undefined means "follow the clock"). Returns undefined when neither is there, which is every
 * normal visit: the sea then shows the shared UTC time and weather.
 */
export function parsePin(
  search: string,
): { hour?: number; weather?: WeatherKind } | undefined {
  const params = new URLSearchParams(search);
  const rawHour = params.get("daytime");
  const rawWeather = params.get("weather");
  const out: { hour?: number; weather?: WeatherKind } = {};
  if (rawHour !== null && rawHour.trim() !== "") {
    const hour = Number(rawHour);
    if (Number.isFinite(hour)) out.hour = ((hour % 24) + 24) % 24;
  }
  if (rawWeather && (WEATHER_KINDS as readonly string[]).includes(rawWeather))
    out.weather = rawWeather as WeatherKind;
  return out.hour === undefined && out.weather === undefined ? undefined : out;
}

/** The atmosphere with the pinned parts fixed and the rest following the clock. */
export function atmosphereWithPin(
  utcMs: number,
  pin?: { hour?: number; weather?: WeatherKind },
): Atmosphere {
  if (!pin) return atmosphereAt(utcMs);
  const dayFraction =
    pin.hour === undefined ? dayFractionAt(utcMs) : pin.hour / 24;
  const clock = weatherAt(utcMs);
  const weather =
    pin.weather === undefined
      ? clock
      : { ...weatherOfKind(pin.weather, 1), kind: pin.weather };
  // A pinned clear sky has no clouds at all: the sea's original look.
  if (pin.weather === "clear") weather.cloud = 0;
  return atmosphereFor(dayFraction, weather);
}
