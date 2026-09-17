/**
 * Hand-authored WebAudio foley. No audio files: every sound is synthesised, so the game
 * still loads near-instantly (an eligibility rule) and there is nothing to download.
 *
 * The loud moments are deliberately meme-shaped — the sub-bass impact, the sad trombone,
 * the rising airhorn — because those gestures are what make a win feel like an event.
 * They are synthesised archetypes, not sampled clips: sampling the actual memes would be
 * someone else's copyright, and generated audio is exactly the "AI slop" the brief warns
 * against. DSP written by hand is neither.
 *
 * The context is created lazily on first gesture, because browsers refuse to start one
 * before the player has interacted.
 */
export type Voice =
  | 'place'
  | 'undo'
  | 'clear'
  | 'preset'
  | 'release'
  | 'riser'
  | 'topple'
  | 'hold'
  | 'nearmiss'
  | 'win'
  | 'bigwin'
  | 'jackpot'
  | 'bust'
  | 'streak'
  | 'lever'
  | 'bell'
  | 'hopper';

export type VoiceOptions = {
  /** 0–1, how far up the prize ladder this moment sits. Shifts pitch and weight. */
  tier?: number;
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const ensureContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;

  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;

      context = new Ctor();

      // Layered cues stack up fast; the compressor keeps a jackpot from clipping.
      const bus = context.createDynamicsCompressor();
      bus.threshold.value = -14;
      bus.knee.value = 24;
      bus.ratio.value = 8;
      bus.attack.value = 0.004;
      bus.release.value = 0.22;

      master = context.createGain();
      master.gain.value = 0.3;
      master.connect(bus).connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return context;
  } catch {
    // Audio is a nicety: a blocked or unavailable context must never break the game.
    return null;
  }
};

// --- building blocks ---------------------------------------------------------

const noiseBuffer = (ctx: BaseAudioContext, seconds: number, decay = 1): AudioBuffer => {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** decay;
  }
  return buffer;
};

const ping = (
  ctx: BaseAudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  gain: number,
  decay: number,
  type: OscillatorType = 'triangle',
): void => {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.72), at + decay);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);

  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.02);
};

/** The meme impact: a sub-bass drop with a short bright transient on top. */
const boom = (ctx: BaseAudioContext, out: AudioNode, at: number, gain: number): void => {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(28, at + 0.7);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);

  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 1);

  const crack = ctx.createBufferSource();
  const crackEnv = ctx.createGain();
  const crackFilter = ctx.createBiquadFilter();

  crack.buffer = noiseBuffer(ctx, 0.14, 2);
  crackFilter.type = 'bandpass';
  crackFilter.frequency.setValueAtTime(1800, at);

  crackEnv.gain.setValueAtTime(gain * 0.5, at);
  crackEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

  crack.connect(crackFilter).connect(crackEnv).connect(out);
  crack.start(at);
};

const thud = (ctx: BaseAudioContext, out: AudioNode, at: number, gain: number): void => {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, at);
  osc.frequency.exponentialRampToValueAtTime(58, at + 0.16);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);

  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.24);
};

const scatter = (
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  count: number,
  gain: number,
  spread = 0.26,
): void => {
  for (let i = 0; i < count; i += 1) {
    ping(ctx, out, 1400 + Math.random() * 1900, at + Math.random() * spread, gain * (0.35 + Math.random() * 0.65), 0.13);
  }
};

/** A pitch glide, used for the riser and for the trombone's slide down. */
const slide = (
  ctx: BaseAudioContext,
  out: AudioNode,
  from: number,
  to: number,
  at: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sawtooth',
): void => {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + duration);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, at);
  filter.frequency.linearRampToValueAtTime(2600, at + duration);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + duration * 0.25);
  env.gain.setValueAtTime(gain, at + duration * 0.8);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.12);

  osc.connect(filter).connect(env).connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.16);
};

/** Stacked detuned saws — the airhorn/fanfare colour. */
const horn = (
  ctx: BaseAudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  duration: number,
  gain: number,
): void => {
  for (const detune of [-7, 0, 7]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, at);
    osc.detune.setValueAtTime(detune, at);

    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain / 3, at + 0.03);
    env.gain.setValueAtTime(gain / 3, at + duration * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }
};

export const setMuted = (next: boolean): void => {
  muted = next;
  if (master) master.gain.value = next ? 0 : 0.3;
};

export const isMuted = (): boolean => muted;

/**
 * Measured by rendering each voice into an OfflineAudioContext (44.1kHz, mono, tier 0.8)
 * and reading the buffer back, so "is it audible" is answered rather than assumed.
 * Reference values — a later edit that silences or clips a voice shows up against these:
 *
 *   place    0.32   79ms      nearmiss  0.20   679ms
 *   undo     0.23  115ms      win       0.42   406ms
 *   clear    0.30  208ms      bigwin    0.58   947ms
 *   preset   0.25  249ms      jackpot   0.74  1520ms
 *   release  0.58  388ms      bust      0.23   979ms
 *   riser    0.25  663ms      streak    0.28   200ms
 *   topple   0.55  463ms
 *   hold     0.38  220ms
 *
 * Nothing exceeds 1.0, so nothing clips through the compressor, and the hierarchy holds:
 * interface ticks quietest, lane verdicts in the middle, the payoff loudest and longest.
 */

/**
 * Schedules one voice onto any context. Split out from `play` so the voices can be
 * rendered into an OfflineAudioContext and measured — otherwise "does it make a sound"
 * is only answerable by a human with speakers.
 */
export const scheduleVoice = (
  ctx: BaseAudioContext,
  out: GainNode,
  voice: Voice,
  now: number,
  options: VoiceOptions = {},
): void => {
  const tier = Math.min(Math.max(options.tier ?? 0, 0), 1);

  switch (voice) {
    case 'place':
      ping(ctx, out, 1900 + tier * 700, now, 0.34, 0.08);
      break;

    case 'undo':
      ping(ctx, out, 1200, now, 0.24, 0.07);
      ping(ctx, out, 820, now + 0.045, 0.2, 0.07);
      break;

    case 'clear':
      scatter(ctx, out, now, 5, 0.2, 0.1);
      ping(ctx, out, 700, now + 0.05, 0.2, 0.12);
      break;

    case 'preset':
      [0, 0.055, 0.11].forEach((offset, index) => {
        ping(ctx, out, 880 * (1 + index * 0.26), now + offset, 0.26, 0.14);
      });
      break;

    case 'release':
      scatter(ctx, out, now, 9, 0.3);
      thud(ctx, out, now + 0.04, 0.22);
      break;

    // Tension bed while a lane decides. Richer lanes sit lower and last longer.
    case 'riser':
      slide(ctx, out, 150 + (1 - tier) * 190, 420 + tier * 320, now, 0.36 + tier * 0.18, 0.15 + tier * 0.1);
      break;

    case 'topple': {
      const source = ctx.createBufferSource();
      const env = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = noiseBuffer(ctx, 0.55);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400 + tier * 900, now);
      filter.Q.value = 1.3;

      env.gain.setValueAtTime(0.5, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

      source.connect(filter).connect(env).connect(out);
      source.start(now);

      scatter(ctx, out, now, 12 + Math.round(tier * 10), 0.32, 0.34);
      break;
    }

    case 'hold':
      thud(ctx, out, now, 0.4);
      break;

    // The high pile held: a short falling two-note "aww".
    case 'nearmiss':
      slide(ctx, out, 520, 300, now, 0.26, 0.2, 'triangle');
      slide(ctx, out, 300, 205, now + 0.24, 0.32, 0.17, 'triangle');
      break;

    case 'win':
      [0, 0.08].forEach((offset, index) => {
        ping(ctx, out, 900 * (1 + index * 0.33), now + offset, 0.3, 0.3);
      });
      scatter(ctx, out, now + 0.05, 8, 0.26);
      break;

    case 'bigwin':
      boom(ctx, out, now, 0.55);
      [0, 0.1, 0.2].forEach((offset, index) => {
        horn(ctx, out, 392 * (1 + index * 0.26), now + 0.06 + offset, 0.34, 0.2);
      });
      scatter(ctx, out, now + 0.12, 16, 0.3, 0.4);
      break;

    // Full meme treatment: impact, rising airhorn, then the fanfare.
    case 'jackpot':
      boom(ctx, out, now, 0.7);
      slide(ctx, out, 220, 900, now + 0.05, 0.5, 0.2);
      [0, 0.13, 0.26, 0.42].forEach((offset, index) => {
        horn(ctx, out, 392 * (1 + index * 0.25), now + 0.55 + offset, 0.5, 0.22);
      });
      scatter(ctx, out, now + 0.6, 26, 0.3, 0.7);
      break;

    // Sad trombone: three descending slides with a wobble at the end.
    case 'bust':
      slide(ctx, out, 330, 262, now, 0.22, 0.2, 'sawtooth');
      slide(ctx, out, 262, 208, now + 0.2, 0.22, 0.19, 'sawtooth');
      slide(ctx, out, 208, 150, now + 0.4, 0.42, 0.2, 'sawtooth');
      break;

    case 'streak':
      ping(ctx, out, 700 * (1 + tier * 1.1), now, 0.28, 0.2, 'sine');
      break;

    // The lever: spring tension, the throw, then the mechanism seating itself.
    case 'lever': {
      const spring = ctx.createBufferSource();
      const springEnv = ctx.createGain();
      const springFilter = ctx.createBiquadFilter();

      spring.buffer = noiseBuffer(ctx, 0.2, 3);
      springFilter.type = 'bandpass';
      springFilter.frequency.setValueAtTime(2600, now);
      springFilter.frequency.exponentialRampToValueAtTime(800, now + 0.18);
      springFilter.Q.value = 3;

      springEnv.gain.setValueAtTime(0.3, now);
      springEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      spring.connect(springFilter).connect(springEnv).connect(out);
      spring.start(now);

      thud(ctx, out, now + 0.14, 0.44);
      ping(ctx, out, 320, now + 0.16, 0.2, 0.1, 'square');
      break;
    }

    // A struck bell: inharmonic partials, which is what stops it sounding like a beep.
    case 'bell': {
      const base = 660 * (1 + tier * 0.5);
      BELL_PARTIALS.forEach((ratio, index) => {
        ping(ctx, out, base * ratio, now, 0.2 / (index + 1), 1.1 - index * 0.16, 'sine');
      });
      break;
    }

    // Coins hitting a metal tray. Longer and denser the more there are to pay out.
    case 'hopper': {
      const coins = 6 + Math.round(tier * 26);
      const window = 0.35 + tier * 0.9;

      for (let i = 0; i < coins; i += 1) {
        const at = now + (i / coins) * window + Math.random() * 0.03;
        ping(ctx, out, 1500 + Math.random() * 2200, at, 0.2 + Math.random() * 0.14, 0.1);
        if (i % 4 === 0) thud(ctx, out, at, 0.1);
      }
      break;
    }
  }
};

const BELL_PARTIALS = [1, 2.76, 5.4, 8.93];

export const play = (voice: Voice, options: VoiceOptions = {}): void => {
  const ctx = ensureContext();
  if (!ctx || !master || muted) return;

  try {
    scheduleVoice(ctx, master, voice, ctx.currentTime, options);
  } catch {
    // Never let a failed sound take the round down with it.
  }
};
