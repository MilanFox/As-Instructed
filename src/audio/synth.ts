/**
 * The primitives every sound is built from.
 *
 * Three rules hold everywhere below, and the whole catalogue depends on them:
 *
 * 1. **Nothing runs per-sample in JavaScript.** A sound is a handful of native nodes plus a few
 *    scheduled `AudioParam` events, so a burst of them costs graph setup and nothing else
 *    (DESIGN.md §10.7).
 * 2. **Every envelope ends at a hard zero.** `exponentialRampToValueAtTime` cannot reach 0 — it
 *    throws on a 0 target and only ever approaches one — so each envelope ramps down to
 *    `SILENCE` and then takes a 4ms linear step to true 0. Without that step, thirty stacked
 *    "finished" voices still sum to an audible hiss.
 * 3. **Randomness is seeded by the trace event.** Repetition is the failure mode for a sound the
 *    player hears for hours, but scrubbing back over the same tick must produce the same sound,
 *    so variation comes from `hash01(event)` and never from `Math.random()`.
 */

/** Practical floor for exponential ramps: -80dBFS. */
export const SILENCE = 0.0001;

/** The linear step from `SILENCE` to true zero that ends every envelope. */
export const ZERO_TAIL = 0.004;

export type NoiseKind = 'white' | 'pink';

/** Deterministic 0..1 from an integer. Same event, same sound, forever. */
export function hash01(seed: number): number {
  let h = Math.imul(seed | 0, 374761393) + 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Maps 0..1 onto a symmetric ratio around 1, e.g. `detune(r, 0.06)` -> 0.94..1.06. */
export function spread(r: number, amount: number): number {
  return 1 + (r * 2 - 1) * amount;
}

const NOISE_SECONDS = 2;

/**
 * Noise is generated from a fixed seed, not `Math.random()`. Two reasons: a sound must be the
 * same every session so it can be reasoned about (and calibrated), and a test that renders a
 * buffer needs the same samples every run.
 */
function seededNoise(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };
}
const noiseCache = new WeakMap<BaseAudioContext, Map<NoiseKind, AudioBuffer>>();

/**
 * One shared noise buffer per context per colour, generated once and read from a random offset by
 * every noise voice. Regenerating noise per sound would be the only per-sample JS in the system.
 */
export function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  let perContext = noiseCache.get(ctx);
  if (!perContext) {
    perContext = new Map();
    noiseCache.set(ctx, perContext);
  }
  const cached = perContext.get(kind);
  if (cached) return cached;

  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const next = seededNoise(kind === 'white' ? 0x5eed1 : 0x5eed2);
  if (kind === 'white') {
    for (let i = 0; i < length; i++) data[i] = next();
  } else {
    // Voss-McCartney, three rows. Enough tilt to read as "room", cheap enough to not care.
    let a = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < length; i++) {
      const white = next();
      a = 0.997 * a + white * 0.029;
      b = 0.985 * b + white * 0.075;
      c = 0.95 * c + white * 0.153;
      data[i] = (a + b + c + white * 0.02) * 0.7;
    }
  }
  perContext.set(kind, buffer);
  return buffer;
}

export function gainNode(ctx: BaseAudioContext, value = 1): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

export function filterNode(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  q = 1,
): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/** An oscillator, already started and already scheduled to stop. Fire and forget. */
export function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  frequency: number,
  at: number,
  duration: number,
): OscillatorNode {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.setValueAtTime(frequency, at);
  node.start(at);
  node.stop(at + duration);
  return node;
}

/** A slice of the shared noise buffer, started at `at` from a seeded offset. */
export function noise(
  ctx: BaseAudioContext,
  at: number,
  duration: number,
  kind: NoiseKind = 'white',
  seed = 0,
): AudioBufferSourceNode {
  const node = ctx.createBufferSource();
  node.buffer = noiseBuffer(ctx, kind);
  const offset = hash01(seed) * (NOISE_SECONDS - Math.min(duration, NOISE_SECONDS * 0.5));
  node.start(at, offset);
  node.stop(at + duration);
  return node;
}

/**
 * Attack-decay envelope. Returns the time the voice is genuinely silent, which is what the voice
 * pool books as the voice's lifetime.
 */
export function ad(
  param: AudioParam,
  at: number,
  peak: number,
  attack: number,
  decay: number,
): number {
  const top = at + Math.max(attack, 0.001);
  const bottom = top + Math.max(decay, 0.001);
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(Math.max(peak, SILENCE * 2), top);
  param.exponentialRampToValueAtTime(SILENCE, bottom);
  param.linearRampToValueAtTime(0, bottom + ZERO_TAIL);
  return bottom + ZERO_TAIL;
}

/** Attack-hold-decay, for anything that needs a body rather than a transient. */
export function ahd(
  param: AudioParam,
  at: number,
  peak: number,
  attack: number,
  hold: number,
  decay: number,
): number {
  const top = at + Math.max(attack, 0.001);
  const held = top + Math.max(hold, 0);
  const bottom = held + Math.max(decay, 0.001);
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(Math.max(peak, SILENCE * 2), top);
  param.setValueAtTime(Math.max(peak, SILENCE * 2), held);
  param.exponentialRampToValueAtTime(SILENCE, bottom);
  param.linearRampToValueAtTime(0, bottom + ZERO_TAIL);
  return bottom + ZERO_TAIL;
}

/** Exponential glide. Guards the zero-crossing that would make WebAudio throw. */
export function sweep(
  param: AudioParam,
  at: number,
  from: number,
  to: number,
  duration: number,
): void {
  param.setValueAtTime(Math.max(from, SILENCE), at);
  param.exponentialRampToValueAtTime(Math.max(to, SILENCE), at + Math.max(duration, 0.001));
}

/** Connects a chain left to right and returns the last node, so a voice reads top-down. */
export function chain<T extends AudioNode>(first: AudioNode, ...rest: [...AudioNode[], T]): T {
  let previous = first;
  for (const node of rest) {
    previous.connect(node);
    previous = node;
  }
  return previous as T;
}

/**
 * A short band-limited transient: the "click" under most of the mechanical sounds.
 * Returns the time it is silent.
 */
export function tick(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  frequency: number,
  q: number,
  peak: number,
  decay: number,
  seed = 0,
): number {
  const envelope = gainNode(ctx, 0);
  const band = filterNode(ctx, 'bandpass', frequency, q);
  const source = noise(ctx, at, decay + 0.02, 'white', seed);
  source.connect(band).connect(envelope).connect(out);
  return ad(envelope.gain, at, peak, 0.001, decay);
}

/** A pitched body: one oscillator through its own envelope. Returns the time it is silent. */
export function blip(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  type: OscillatorType,
  from: number,
  to: number,
  peak: number,
  attack: number,
  decay: number,
): number {
  const envelope = gainNode(ctx, 0);
  const node = osc(ctx, type, from, at, attack + decay + ZERO_TAIL + 0.01);
  if (to !== from) sweep(node.frequency, at, from, to, attack + decay);
  node.connect(envelope).connect(out);
  return ad(envelope.gain, at, peak, attack, decay);
}
