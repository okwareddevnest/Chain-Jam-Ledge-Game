/**
 * Hand-authored WebAudio foley. No audio files: every sound is synthesised, so the game
 * still loads near-instantly (an eligibility rule) and there is no generated-asset slop.
 *
 * The context is created lazily on the first gesture, because browsers refuse to start one
 * before the player has interacted with the page.
 */
type Voice = 'place' | 'clear' | 'release' | 'tension' | 'topple' | 'hold' | 'jackpot';

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const ensureContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;

  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;

      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.28;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return context;
  } catch {
    // Audio is a nicety: a blocked or unavailable context must never break the game.
    return null;
  }
};

const noiseBuffer = (ctx: AudioContext, seconds: number): AudioBuffer => {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  return buffer;
};

const metalPing = (ctx: AudioContext, out: GainNode, freq: number, at: number, gain: number, decay: number): void => {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, at + decay);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);

  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.02);
};

const thud = (ctx: AudioContext, out: GainNode, at: number, gain: number): void => {
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

const scatter = (ctx: AudioContext, out: GainNode, at: number, count: number, gain: number): void => {
  for (let i = 0; i < count; i += 1) {
    const offset = at + Math.random() * 0.26;
    metalPing(ctx, out, 1400 + Math.random() * 1700, offset, gain * (0.4 + Math.random() * 0.6), 0.14);
  }
};

export const setMuted = (next: boolean): void => {
  muted = next;
  if (master) master.gain.value = next ? 0 : 0.28;
};

export const isMuted = (): boolean => muted;

export const play = (voice: Voice): void => {
  const ctx = ensureContext();
  if (!ctx || !master || muted) return;

  const now = ctx.currentTime;

  try {
    switch (voice) {
      case 'place':
        metalPing(ctx, master, 2100, now, 0.35, 0.08);
        break;

      case 'clear':
        metalPing(ctx, master, 900, now, 0.22, 0.1);
        break;

      case 'release':
        scatter(ctx, master, now, 7, 0.3);
        break;

      case 'tension': {
        // A low bed that swells while a stacked lane decides.
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(52, now);
        osc.frequency.linearRampToValueAtTime(63, now + 0.42);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, now);

        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.22, now + 0.2);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);

        osc.connect(filter).connect(env).connect(master);
        osc.start(now);
        osc.stop(now + 0.48);
        break;
      }

      case 'topple': {
        const source = ctx.createBufferSource();
        const env = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = noiseBuffer(ctx, 0.5);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2600, now);
        filter.Q.value = 1.4;

        env.gain.setValueAtTime(0.5, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

        source.connect(filter).connect(env).connect(master);
        source.start(now);

        scatter(ctx, master, now, 12, 0.34);
        break;
      }

      case 'hold':
        thud(ctx, master, now, 0.4);
        break;

      case 'jackpot':
        [0, 0.09, 0.18, 0.3].forEach((offset, index) => {
          metalPing(ctx, master!, 880 * (1 + index * 0.26), now + offset, 0.34, 0.5);
        });
        scatter(ctx, master, now + 0.1, 18, 0.32);
        break;
    }
  } catch {
    // Never let a failed sound take the round down with it.
  }
};
