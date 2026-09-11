export const SILENCE = 0.0001;

export const ZERO_TAIL = 0.004;

export type NoiseKind = 'white' | 'pink';

export function hash01(seed: number): number {
  let h = Math.imul(seed | 0, 374761393) + 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function spread(r: number, amount: number): number {
  return 1 + (r * 2 - 1) * amount;
}

const NOISE_SECONDS = 2;

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

export function chain<T extends AudioNode>(first: AudioNode, ...rest: [...AudioNode[], T]): T {
  let previous = first;
  for (const node of rest) {
    previous.connect(node);
    previous = node;
  }
  return previous as T;
}

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
