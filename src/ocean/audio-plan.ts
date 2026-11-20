/**
 * What the sea sounds like, as plain numbers. The Web Audio part (src/app/audio.ts) only
 * applies this plan, so the rules can be tested without a sound card.
 *
 * Layers: the swell (low filtered noise that breathes slowly), the wind (higher noise, louder
 * in overcast weather and rain), the rain (bright noise, only while it rains) and the engine
 * (a low buzz whose pitch follows the boat's speed).
 */
export interface SoundInput {
  /** Speed over water in m/s (reversing counts as speed). */
  speed: number;
  /** Rain 0..1, cloud gloom 0..1 (from the shared atmosphere). */
  rain: number;
  gloom: number;
  /** Master volume 0..1 and the on/off switch from Settings. */
  volume: number;
  enabled: boolean;
}

export interface SoundPlan {
  swell: number;
  swellCutoff: number;
  wind: number;
  windCutoff: number;
  rain: number;
  engine: number;
  enginePitch: number;
}

/** Top speed the plan scales against (m/s); boat-physics TOP_SPEED is 18. */
export const REFERENCE_SPEED = 18;
export const SILENT: SoundPlan = Object.freeze({
  swell: 0,
  swellCutoff: 300,
  wind: 0,
  windCutoff: 500,
  rain: 0,
  engine: 0,
  enginePitch: 38,
});

const clamp01 = (v: number) =>
  Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

export function soundPlan(input: SoundInput): SoundPlan {
  if (!input.enabled) return SILENT;
  const volume = clamp01(input.volume);
  if (volume === 0) return SILENT;
  const run = clamp01(Math.abs(input.speed) / REFERENCE_SPEED);
  const rain = clamp01(input.rain);
  const gloom = clamp01(input.gloom);
  return {
    // A calm sea still murmurs; speed and bad weather make it louder and brighter.
    swell: volume * (0.3 + 0.35 * run + 0.15 * gloom),
    swellCutoff: 260 + 420 * run + 220 * gloom,
    wind: volume * (0.06 + 0.2 * gloom + 0.12 * run),
    windCutoff: 450 + 900 * gloom + 500 * run,
    rain: volume * 0.07 * rain,
    // The engine idles quietly at rest, which says "the boat is on".
    engine: volume * (0.05 + 0.2 * run),
    enginePitch: 38 + 52 * run,
  };
}

/** Volume saved on the device (localStorage), clamped on the way in and out. */
export interface AudioSettings {
  enabled: boolean;
  volume: number;
}
export const DEFAULT_AUDIO: AudioSettings = { enabled: true, volume: 0.7 };

export function parseAudioSettings(raw: string | null): AudioSettings {
  if (!raw) return { ...DEFAULT_AUDIO };
  try {
    const value = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      enabled:
        typeof value.enabled === "boolean"
          ? value.enabled
          : DEFAULT_AUDIO.enabled,
      volume:
        typeof value.volume === "number" && Number.isFinite(value.volume)
          ? clamp01(value.volume)
          : DEFAULT_AUDIO.volume,
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}
