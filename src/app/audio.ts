import { cueVoices, type Cue } from "../ocean/audio-cues";
import { BAR_SECONDS, gullIn, musicBar } from "../ocean/audio-life";
import {
  nearShore,
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
  /** Plays a short sound (a cue); does nothing while sound is off or not yet unlocked. */
  play(cue: Cue): void;
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
    tension: 0,
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
        line: GainNode;
        lineOsc: OscillatorNode;
        hull: GainNode;
        hullFilter: BiquadFilterNode;
        surf: GainNode;
        surfFilter: BiquadFilterNode;
        plane: GainNode;
        planeOsc: OscillatorNode;
        music: GainNode;
        noise: AudioBuffer;
      }
    | undefined;
  /** Cues sounding now; a burst of events cannot pile up more than this. */
  let voicesNow = 0;
  const MAX_VOICES = 24;

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
    // The hull's rush of spray and the surf on a beach: noise through their own filters (the
    // surf's level breathes in `apply`, like waves arriving, one every ~9 s).
    const hull = layer("bandpass", 1200, 0.6);
    const surf = layer("lowpass", 700, 0.6);
    // A seaplane's engine: a low buzz through a filter (its level follows the distance).
    const planeOsc = context.createOscillator();
    planeOsc.type = "sawtooth";
    planeOsc.frequency.value = 100;
    const planeFilter = context.createBiquadFilter();
    planeFilter.type = "lowpass";
    planeFilter.frequency.value = 700;
    const plane = context.createGain();
    plane.gain.value = 0;
    planeOsc.connect(planeFilter).connect(plane).connect(context.destination);
    planeOsc.start();
    // The music has its own master gain, so it can be switched off alone.
    const music = context.createGain();
    music.gain.value = 0;
    music.connect(context.destination);
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
    // The taut line: a thin tone whose pitch rises with the tension.
    const lineOsc = context.createOscillator();
    lineOsc.type = "triangle";
    lineOsc.frequency.value = 220;
    const line = context.createGain();
    line.gain.value = 0;
    lineOsc.connect(line).connect(context.destination);
    lineOsc.start();
    nodes = {
      swell: swell.gain,
      swellFilter: swell.filter,
      wind: wind.gain,
      windFilter: wind.filter,
      rain: rain.gain,
      engine,
      engineOsc,
      line,
      lineOsc,
      hull: hull.gain,
      hullFilter: hull.filter,
      surf: surf.gain,
      surfFilter: surf.filter,
      plane,
      planeOsc,
      music,
      noise: buffer,
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
    ramp(nodes.line.gain, plan.line);
    ramp(nodes.lineOsc.frequency, plan.linePitch);
    ramp(nodes.hull.gain, plan.hull);
    ramp(nodes.hullFilter.frequency, plan.hullCutoff);
    // The surf breathes: its level swings by a third around the plan's.
    ramp(
      nodes.surf.gain,
      plan.surf * (0.75 + 0.25 * Math.sin(ctx.currentTime * 0.7)),
    );
    ramp(nodes.surfFilter.frequency, plan.surfCutoff);
    ramp(nodes.plane.gain, plan.plane);
    ramp(nodes.planeOsc.frequency, plan.planePitch);
    const music =
      settings.enabled && settings.music ? settings.volume * 0.9 : 0;
    nodes.music.gain.setTargetAtTime(music, ctx.currentTime, 0.8);
  }

  /** The gulls and the music are scheduled a little ahead of the audio clock, once a second. */
  let nextGull = 0;
  let musicBarAt = 0;
  let musicBarNo = Math.floor(Date.now() / (BAR_SECONDS * 1000));
  function tick() {
    if (!ctx || !nodes || ctx.state !== "running" || disposed) return;
    const now = ctx.currentTime;
    const daylight = last.daylight ?? 1;
    if (settings.enabled && settings.volume > 0) {
      // Gulls: only by day and near a beach.
      if (nextGull === 0) nextGull = now + 3;
      if (now >= nextGull) {
        const wait = gullIn(Math.random, nearShore(last.shore), daylight);
        if (wait === undefined) nextGull = now + 4;
        else {
          nextGull = now + wait;
          api.play("gull");
        }
      }
      // Music: the next bar is started when the previous one is about to end.
      if (settings.music) {
        if (musicBarAt === 0) musicBarAt = now + 0.5;
        while (musicBarAt < now + 2) {
          for (const note of musicBar(musicBarNo, daylight))
            musicNote(ctx, nodes.music, musicBarAt + note.at, note);
          musicBarNo++;
          musicBarAt += BAR_SECONDS;
        }
      } else musicBarAt = 0;
    }
  }
  const ticker = window.setInterval(tick, 1000);

  /** One note of the music: a slow swell up and a long fade, through a soft filter. */
  function musicNote(
    context: AudioContext,
    out: AudioNode,
    start: number,
    note: ReturnType<typeof musicBar>[number],
  ) {
    const end = start + note.dur;
    const osc = context.createOscillator();
    osc.type = note.wave;
    osc.frequency.value = note.freq;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(
      note.gain,
      start + Math.min(2.2, note.dur * 0.4),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(filter).connect(gain).connect(out);
    osc.onended = () => gain.disconnect();
    osc.start(start);
    osc.stop(end + 0.05);
  }

  /** One voice of a cue: built, shaped by a quick attack and an exponential fade, then freed. */
  function sound(
    context: AudioContext,
    buffer: AudioBuffer,
    voice: ReturnType<typeof cueVoices>[number],
  ) {
    const start = context.currentTime + voice.at;
    const end = start + voice.dur;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(
      Math.max(0.0002, voice.gain),
      start + 0.005,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(context.destination);
    let source: AudioScheduledSourceNode;
    if (voice.kind === "tone") {
      const osc = context.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.from, start);
      if (voice.to !== voice.from)
        osc.frequency.exponentialRampToValueAtTime(voice.to, end);
      osc.connect(gain);
      source = osc;
    } else {
      const src = context.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = voice.filter;
      filter.frequency.setValueAtTime(voice.cutoff, start);
      if (voice.cutoffTo !== voice.cutoff)
        filter.frequency.exponentialRampToValueAtTime(voice.cutoffTo, end);
      src.connect(filter).connect(gain);
      source = src;
    }
    voicesNow++;
    source.onended = () => {
      voicesNow--;
      gain.disconnect();
    };
    source.start(start);
    source.stop(end + 0.02);
  }

  const api: SeaAudio = {
    settings: () => ({ ...settings }),
    set(next) {
      settings = {
        enabled: next.enabled ?? settings.enabled,
        volume: Math.max(0, Math.min(1, next.volume ?? settings.volume)),
        music: next.music ?? settings.music,
      };
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
      } catch {
        // Private mode: the choice lasts until the page closes.
      }
      resume();
      apply();
    },
    play(cue) {
      if (!ctx || !nodes || ctx.state !== "running" || disposed) return;
      const voices = cueVoices(cue, settings.volume, settings.enabled);
      if (!voices.length || voicesNow + voices.length > MAX_VOICES) return;
      for (const voice of voices) sound(ctx, nodes.noise, voice);
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
      clearInterval(ticker);
      void ctx?.close().catch(() => {});
      ctx = undefined;
      nodes = undefined;
    },
  };
  return api;
}
