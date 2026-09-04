/**
 * A minimal offline WebAudio implementation, so the audio tests can assert on samples.
 *
 * Vitest runs in Node (`vitest.config.ts`), which has no WebAudio and no `OfflineAudioContext`,
 * and DESIGN.md §2 forbids adding a dependency to get one. Everything under `src/audio` uses a
 * deliberately small slice of the API, so the slice is implemented here instead and the sounds
 * are rendered to a real buffer — peaks, DC offset, clipping and decay-to-silence are then
 * ordinary numeric assertions rather than guesses about a graph.
 *
 * It is a test double, so it is honest about what it is not:
 *
 * - **Mono.** Nothing in the catalogue pans, so the destination sums to one channel.
 * - **`DynamicsCompressorNode` is a pass-through.** That is on purpose: it means a "peak <= 1"
 *   assertion proves the material is safe *before* the limiter, which is a stronger claim than
 *   proving the limiter caught it.
 * - **Oscillators are not band-limited.** Square and sawtooth alias above Nyquist. Amplitude,
 *   envelope and timing assertions hold; spectral ones would not.
 * - **`AudioParam` errors are enforced.** `exponentialRampToValueAtTime` towards or away from
 *   zero throws exactly as it does in a browser, which is the single easiest way to write a
 *   sound that is silent on real hardware and fine in a mock.
 * - **`currentTime` is manual.** `advanceTo` moves it, which is how a test simulates frames,
 *   pauses and seeks against the same timeline it later renders.
 */

type ParamTarget = MiniParam;

type EventKind = 'set' | 'linear' | 'exponential' | 'target';

interface ParamEvent {
  kind: EventKind;
  time: number;
  value: number;
  timeConstant?: number;
}

export class MiniParam {
  value: number;
  readonly inputs: MiniNode[] = [];
  private events: ParamEvent[] = [];

  constructor(defaultValue: number) {
    this.value = defaultValue;
  }

  setValueAtTime(value: number, time: number): MiniParam {
    this.push({ kind: 'set', time, value });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): MiniParam {
    this.push({ kind: 'linear', time, value });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): MiniParam {
    if (value === 0) {
      throw new RangeError('exponentialRampToValueAtTime: target must be non-zero');
    }
    this.push({ kind: 'exponential', time, value });
    return this;
  }

  setTargetAtTime(value: number, startTime: number, timeConstant: number): MiniParam {
    this.push({ kind: 'target', time: startTime, value, timeConstant });
    return this;
  }

  cancelScheduledValues(time: number): MiniParam {
    this.events = this.events.filter((event) => event.time < time);
    return this;
  }

  private push(event: ParamEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
  }

  /** Renders the automation curve, plus anything connected to the param, into `out`. */
  renderInto(out: Float32Array, sampleRate: number, state: RenderState): void {
    const events = this.events;
    let previousTime = 0;
    let previousValue = this.value;
    let index = 0;
    let held = this.value;

    for (let i = 0; i < out.length; i++) {
      const t = i / sampleRate;
      while (index < events.length && (events[index] as ParamEvent).time <= t) {
        const event = events[index] as ParamEvent;
        previousTime = event.time;
        previousValue = event.kind === 'target' ? held : event.value;
        if (event.kind !== 'target') held = event.value;
        index++;
      }
      const next = events[index];
      let value = held;

      if (index > 0) {
        const current = events[index - 1] as ParamEvent;
        if (current.kind === 'target') {
          const tau = Math.max(current.timeConstant ?? 0.01, 1e-6);
          value =
            current.value + (previousValue - current.value) * Math.exp(-(t - current.time) / tau);
          held = value;
        }
      }

      if (next && (next.kind === 'linear' || next.kind === 'exponential')) {
        const span = next.time - previousTime;
        const ratio = span <= 0 ? 1 : (t - previousTime) / span;
        if (next.kind === 'linear') {
          value = previousValue + (next.value - previousValue) * ratio;
        } else {
          if (previousValue <= 0) {
            throw new RangeError('exponentialRampToValueAtTime: previous value must be non-zero');
          }
          value = previousValue * Math.pow(next.value / previousValue, ratio);
        }
      }
      out[i] = value;
    }

    for (const input of this.inputs) {
      const buffer = input.pull(state);
      for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (buffer[i] as number);
    }
  }
}

interface RenderState {
  sampleRate: number;
  length: number;
  cache: Map<MiniNode, Float32Array>;
  visiting: Set<MiniNode>;
}

export abstract class MiniNode {
  readonly inputs: MiniNode[] = [];
  protected outputs: (MiniNode | ParamTarget)[] = [];

  constructor(readonly context: MiniContext) {}

  connect<T extends MiniNode | ParamTarget>(target: T): T {
    this.outputs.push(target);
    target.inputs.push(this);
    return target;
  }

  disconnect(): void {
    for (const target of this.outputs) {
      const list = target.inputs;
      const at = list.indexOf(this);
      if (at >= 0) list.splice(at, 1);
    }
    this.outputs = [];
  }

  pull(state: RenderState): Float32Array {
    const cached = state.cache.get(this);
    if (cached) return cached;
    if (state.visiting.has(this)) return new Float32Array(state.length);
    state.visiting.add(this);
    const out = this.render(state);
    state.visiting.delete(this);
    state.cache.set(this, out);
    return out;
  }

  protected sumInputs(state: RenderState): Float32Array {
    const out = new Float32Array(state.length);
    for (const input of this.inputs) {
      const buffer = input.pull(state);
      for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (buffer[i] as number);
    }
    return out;
  }

  protected abstract render(state: RenderState): Float32Array;

  protected paramBuffer(param: MiniParam, state: RenderState): Float32Array {
    const out = new Float32Array(state.length);
    param.renderInto(out, state.sampleRate, state);
    return out;
  }
}

class MiniDestination extends MiniNode {
  protected render(state: RenderState): Float32Array {
    return this.sumInputs(state);
  }
}

export class MiniGain extends MiniNode {
  readonly gain = new MiniParam(1);

  protected render(state: RenderState): Float32Array {
    const input = this.sumInputs(state);
    const gain = this.paramBuffer(this.gain, state);
    for (let i = 0; i < input.length; i++) {
      input[i] = (input[i] as number) * (gain[i] as number);
    }
    return input;
  }
}

abstract class MiniSource extends MiniNode {
  protected startTime = Number.POSITIVE_INFINITY;
  protected stopTime = Number.POSITIVE_INFINITY;
  protected started = false;

  stop(when = 0): void {
    if (!this.started) throw new Error('stop called before start');
    this.stopTime = Math.min(this.stopTime, Math.max(when, this.startTime));
  }
}

export class MiniOscillator extends MiniSource {
  type: OscillatorType = 'sine';
  readonly frequency = new MiniParam(440);
  readonly detune = new MiniParam(0);

  start(when = 0): void {
    this.started = true;
    this.startTime = when;
  }

  protected render(state: RenderState): Float32Array {
    const out = new Float32Array(state.length);
    const frequency = this.paramBuffer(this.frequency, state);
    const detune = this.paramBuffer(this.detune, state);
    const first = Math.max(0, Math.ceil(this.startTime * state.sampleRate));
    const last = Math.min(state.length, Math.ceil(this.stopTime * state.sampleRate));
    let phase = 0;
    for (let i = first; i < last; i++) {
      const hz = (frequency[i] as number) * Math.pow(2, (detune[i] as number) / 1200);
      phase += hz / state.sampleRate;
      if (phase >= 1) phase -= Math.floor(phase);
      out[i] = wave(this.type, phase);
    }
    return out;
  }
}

function wave(type: OscillatorType, phase: number): number {
  switch (type) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'sawtooth':
      return phase * 2 - 1;
    case 'triangle':
      return phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

export class MiniBufferSource extends MiniSource {
  buffer: MiniBuffer | null = null;
  loop = false;
  private offset = 0;

  start(when = 0, offset = 0): void {
    this.started = true;
    this.startTime = when;
    this.offset = offset;
  }

  protected render(state: RenderState): Float32Array {
    const out = new Float32Array(state.length);
    const buffer = this.buffer;
    if (!buffer) return out;
    const data = buffer.getChannelData(0);
    const first = Math.max(0, Math.ceil(this.startTime * state.sampleRate));
    const last = Math.min(state.length, Math.ceil(this.stopTime * state.sampleRate));
    const base = Math.floor(this.offset * state.sampleRate);
    for (let i = first; i < last; i++) {
      let index = base + (i - first);
      if (index >= data.length) {
        if (!this.loop) break;
        index %= data.length;
      }
      out[i] = data[index] as number;
    }
    return out;
  }
}

export class MiniBiquad extends MiniNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new MiniParam(350);
  readonly Q = new MiniParam(1);
  readonly gain = new MiniParam(0);

  protected render(state: RenderState): Float32Array {
    const input = this.sumInputs(state);
    const frequency = this.paramBuffer(this.frequency, state);
    const quality = this.paramBuffer(this.Q, state);
    const out = new Float32Array(state.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    let a1 = 0;
    let a2 = 0;
    // Coefficients are refreshed on a 32-sample grid: fine enough to track the frequency sweeps
    // in the catalogue, coarse enough that the filters are not the cost of the test suite.
    for (let i = 0; i < state.length; i++) {
      if (i % 32 === 0) {
        const coefficients = biquadCoefficients(
          this.type,
          Math.max(10, Math.min(state.sampleRate * 0.49, frequency[i] as number)),
          quality[i] as number,
          state.sampleRate,
        );
        b0 = coefficients[0];
        b1 = coefficients[1];
        b2 = coefficients[2];
        a1 = coefficients[3];
        a2 = coefficients[4];
      }
      const x0 = input[i] as number;
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      out[i] = y0;
    }
    return out;
  }
}

/** RBJ cookbook, matching the Web Audio spec's filter definitions for the three types used. */
function biquadCoefficients(
  type: BiquadFilterType,
  frequency: number,
  q: number,
  sampleRate: number,
): [number, number, number, number, number] {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  // The spec reads Q in dB for lowpass and highpass, and linearly for bandpass.
  const linearQ = type === 'bandpass' ? Math.max(q, 1e-4) : Math.pow(10, q / 20);
  const alpha = sin / (2 * Math.max(linearQ, 1e-4));
  const a0 = 1 + alpha;
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  }
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

export class MiniDelay extends MiniNode {
  readonly delayTime = new MiniParam(0);

  protected render(state: RenderState): Float32Array {
    const input = this.sumInputs(state);
    const out = new Float32Array(state.length);
    const shift = Math.round(this.delayTime.value * state.sampleRate);
    for (let i = shift; i < state.length; i++) out[i] = input[i - shift] as number;
    return out;
  }
}

/** Pass-through by design; see the file header. */
export class MiniCompressor extends MiniNode {
  readonly threshold = new MiniParam(-24);
  readonly knee = new MiniParam(30);
  readonly ratio = new MiniParam(12);
  readonly attack = new MiniParam(0.003);
  readonly release = new MiniParam(0.25);
  readonly reduction = 0;

  protected render(state: RenderState): Float32Array {
    return this.sumInputs(state);
  }
}

export class MiniBuffer {
  private readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel] as Float32Array;
  }
}

export class MiniContext {
  readonly destination: MiniNode;
  currentTime = 0;
  /** Mirrors autoplay policy: a suspended context makes no sound and its clock does not move. */
  state: 'running' | 'suspended' = 'running';

  constructor(readonly sampleRate = 44100) {
    this.destination = new MiniDestination(this);
  }

  /** Moves the transport. Tests use it to simulate frames between scheduling calls. */
  advanceTo(time: number): void {
    this.currentTime = time;
  }

  advanceBy(seconds: number): void {
    if (this.state === 'suspended') return;
    this.currentTime += seconds;
  }

  createGain(): MiniGain {
    return new MiniGain(this);
  }

  createOscillator(): MiniOscillator {
    return new MiniOscillator(this);
  }

  createBufferSource(): MiniBufferSource {
    return new MiniBufferSource(this);
  }

  createBiquadFilter(): MiniBiquad {
    return new MiniBiquad(this);
  }

  createDelay(): MiniDelay {
    return new MiniDelay(this);
  }

  createDynamicsCompressor(): MiniCompressor {
    return new MiniCompressor(this);
  }

  createBuffer(channels: number, length: number, sampleRate: number): MiniBuffer {
    return new MiniBuffer(channels, length, sampleRate);
  }

  async resume(): Promise<void> {}

  async close(): Promise<void> {}

  /** Renders `[0, seconds)` of the graph reaching `destination`. */
  render(seconds: number): Float32Array {
    const length = Math.ceil(seconds * this.sampleRate);
    const state: RenderState = {
      sampleRate: this.sampleRate,
      length,
      cache: new Map(),
      visiting: new Set(),
    };
    return this.destination.pull(state);
  }

  /** The cast every test needs. The double implements the slice `src/audio` actually calls. */
  asContext(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
}

// ---------------------------------------------------------------------------
// Buffer assertions
// ---------------------------------------------------------------------------

export interface BufferStats {
  peak: number;
  rms: number;
  /** Mean sample value. A non-zero mean is a DC offset, which wastes headroom and thumps. */
  dc: number;
  /** Seconds from 0 to the last sample above `silenceFloor`. */
  lastSound: number;
  /** Seconds from 0 to the first sample above `silenceFloor`. */
  firstSound: number;
}

export const SILENCE_FLOOR = 1e-4;

export function analyse(
  buffer: Float32Array,
  sampleRate: number,
  floor = SILENCE_FLOOR,
): BufferStats {
  let peak = 0;
  let sum = 0;
  let square = 0;
  let last = -1;
  let first = -1;
  for (let i = 0; i < buffer.length; i++) {
    const value = buffer[i] as number;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    sum += value;
    square += value * value;
    if (magnitude > floor) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return {
    peak,
    rms: Math.sqrt(square / Math.max(1, buffer.length)),
    dc: sum / Math.max(1, buffer.length),
    lastSound: last < 0 ? 0 : last / sampleRate,
    firstSound: first < 0 ? 0 : first / sampleRate,
  };
}

/** Peak magnitude of a slice, for "is it actually silent after the seek" assertions. */
export function peakBetween(
  buffer: Float32Array,
  sampleRate: number,
  from: number,
  to: number,
): number {
  const start = Math.max(0, Math.floor(from * sampleRate));
  const end = Math.min(buffer.length, Math.ceil(to * sampleRate));
  let peak = 0;
  for (let i = start; i < end; i++) {
    const magnitude = Math.abs(buffer[i] as number);
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}
