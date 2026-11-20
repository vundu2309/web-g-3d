import {
  parseAudioSettings,
  soundPlan,
  type AudioSettings,
  type SoundInput,
} from "../ocean/audio-plan";

export const AUDIO_KEY = "photyphu:audio:v1";

/** A looping buffer of white noise (2 s is enough: a filtered noise has no melody to repeat). */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export interface SeaAudio {
  settings(): AudioSettings;
  set(next: Partial<AudioSettings>): void;
  /** Call every frame with the state of the sea; cheap (a few parameter ramps). */
  update(input: Omit<SoundInput, "volume" | "enabled">): void;
  dispose(): void;
}

/**
 * The sea's sound: four layers built once (noise through filters, plus a low saw for the
 * engine) and driven only by parameter ramps, so a frame allocates nothing. The context
 * starts after the first touch (browsers refuse sound before one), is suspended while the
 * tab is hidden and is closed on dispose.
 */
export function createSeaAudio(): SeaAudio {
  let settings = parseAudioSettings(
    (() => {
      try {
        return localStorage.getItem(AUDIO_KEY);
      } catch {
        return null;
      }
    })(),
  );
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  let ctx: AudioContext | undefined;
  let disposed = false;
  let last: Omit<SoundInput, "volume" | "enabled"> = {
    speed: 0,
    rain: 0,
    gloom: 0,
  };
  let nodes:
    | {
        swell: GainNode;
        swellFilter: BiquadFilterNode;
        wind: GainNode;
        windFilter: BiquadFilterNode;
        rain: GainNode;
        engine: GainNode;
        engineOsc: OscillatorNode;
      }
    | undefined;

  function build(context: AudioContext) {
    const buffer = noiseBuffer(context);
    const layer = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(context.destination);
      // Each layer starts at a different point so they do not breathe together.
      source.start(0, Math.random() * 2);
      return { filter, gain };
    };
    const swell = layer("lowpass", 300);
    // The swell breathes: a slow LFO (one swell every ~7 s) moves its cutoff.
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.14;
    const depth = context.createGain();
    depth.gain.value = 120;
    lfo.connect(depth).connect(swell.filter.frequency);
    lfo.start();
    const wind = layer("bandpass", 600, 0.5);
    const rain = layer("highpass", 3200, 0.5);
    const engineOsc = context.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 38;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 220;
    const engine = context.createGain();
    engine.gain.value = 0;
    engineOsc
      .connect(engineFilter)
      .connect(engine)
      .connect(context.destination);
    engineOsc.start();
    nodes = {
      swell: swell.gain,
      swellFilter: swell.filter,
      wind: wind.gain,
      windFilter: wind.filter,
      rain: rain.gain,
      engine,
      engineOsc,
    };
  }

  function start() {
    if (ctx || disposed || !Ctx) return;
    ctx = new Ctx();
    build(ctx);
    void ctx.resume().catch(() => {});
  }
  function resume() {
    if (disposed) return;
    if (!ctx) start();
    else if (ctx.state === "suspended" && !document.hidden)
      void ctx.resume().catch(() => {});
  }
  // Browsers only allow sound after a touch or a key: the first one starts the context.
  const unlock = () => resume();
  const gestures = ["pointerdown", "keydown", "touchend"] as const;
  for (const name of gestures)
    window.addEventListener(name, unlock, { passive: true });
  const visibility = () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else if (settings.enabled) void ctx.resume().catch(() => {});
  };
  document.addEventListener("visibilitychange", visibility);

  const ramp = (param: AudioParam, value: number) => {
    if (!ctx) return;
    param.setTargetAtTime(value, ctx.currentTime, 0.25);
  };

  function apply() {
    if (!nodes || !ctx) return;
    const plan = soundPlan({ ...last, ...settings });
    ramp(nodes.swell.gain, plan.swell);
    ramp(nodes.swellFilter.frequency, plan.swellCutoff);
    ramp(nodes.wind.gain, plan.wind);
    ramp(nodes.windFilter.frequency, plan.windCutoff);
    ramp(nodes.rain.gain, plan.rain);
    ramp(nodes.engine.gain, plan.engine);
    ramp(nodes.engineOsc.frequency, plan.enginePitch);
  }

  return {
    settings: () => ({ ...settings }),
    set(next) {
      settings = {
        enabled: next.enabled ?? settings.enabled,
        volume: Math.max(0, Math.min(1, next.volume ?? settings.volume)),
      };
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
      } catch {
        // Private mode: the choice lasts until the page closes.
      }
      resume();
      apply();
    },
    update(input) {
      last = input;
      apply();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const name of gestures) window.removeEventListener(name, unlock);
      document.removeEventListener("visibilitychange", visibility);
      void ctx?.close().catch(() => {});
      ctx = undefined;
      nodes = undefined;
    },
  };
}
