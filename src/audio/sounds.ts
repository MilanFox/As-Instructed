import type { AudioEngine, Voice } from './engine.ts';
import type { Bus } from './settings.ts';
import {
  ad,
  ahd,
  blip,
  chain,
  filterNode,
  gainNode,
  hash01,
  noise,
  noiseBuffer,
  osc,
  spread,
  sweep,
  tick,
} from './synth.ts';

function drone(
  ctx: BaseAudioContext,
  type: OscillatorType,
  frequency: number,
  at: number,
): OscillatorNode {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.setValueAtTime(frequency, at);
  node.start(at);
  return node;
}

export type ActionSound =
  | 'move'
  | 'blocked'
  | 'harvest'
  | 'mine'
  | 'plant'
  | 'pickup'
  | 'drop'
  | 'use'
  | 'refuel'
  | 'mark'
  | 'send'
  | 'recv'
  | 'sendFail'
  | 'spawn'
  | 'die'
  | 'sync'
  | 'scrub';

export type OutcomeSound =
  | 'objective'
  | 'objectiveLost'
  | 'passed'
  | 'failed'
  | 'medalBronze'
  | 'medalSilver'
  | 'medalGold'
  | 'achievement';

export type UiSound =
  'runStart' | 'compileError' | 'cancel' | 'panelOpen' | 'panelClose' | 'button';

export type SoundName = ActionSound | OutcomeSound | UiSound;

export interface SoundSpec {
  bus: Bus;
  priority: number;
  duration: number;
  minIntervalMs: number;
  gain: number;
  render(engine: AudioEngine, voice: Voice, at: number, seed: number): void;
}

function renderMove(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const r = hash01(seed);
  const ctx = engine.ctx;
  tick(ctx, voice.out, at, 2300 * spread(r, 0.14), 3.5, 0.5, 0.022, seed);
  blip(ctx, voice.out, at, 'triangle', 560 * spread(hash01(seed + 1), 0.1), 500, 0.16, 0.002, 0.04);
}

function renderBlocked(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const r = hash01(seed);
  const thud = gainNode(ctx, 0);
  const body = osc(ctx, 'sine', 124 * spread(r, 0.05), at, 0.2);
  sweep(body.frequency, at, 124 * spread(r, 0.05), 62, 0.09);
  chain(body, thud, voice.out);
  ad(thud.gain, at, 0.9, 0.004, 0.11);
  voice.own(body);
  tick(ctx, voice.out, at, 260, 0.9, 0.5, 0.05, seed);
}

function renderHarvest(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const r = hash01(seed);
  tick(engine.ctx, voice.out, at, 3100 * spread(r, 0.1), 6, 0.35, 0.03, seed);
  blip(engine.ctx, voice.out, at, 'triangle', 520 * spread(r, 0.04), 660, 0.3, 0.004, 0.1);
}

function renderMine(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const r = hash01(seed);
  tick(engine.ctx, voice.out, at, 900 * spread(r, 0.18), 1.4, 0.7, 0.09, seed);
  blip(engine.ctx, voice.out, at, 'sine', 142 * spread(r, 0.08), 95, 0.5, 0.003, 0.09);
}

function renderPlant(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const r = hash01(seed);
  blip(engine.ctx, voice.out, at, 'sine', 300 * spread(r, 0.05), 380, 0.4, 0.01, 0.1);
  tick(engine.ctx, voice.out, at, 700 * spread(r, 0.2), 1, 0.25, 0.04, seed);
}

function renderPickup(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const r = hash01(seed);
  blip(engine.ctx, voice.out, at, 'triangle', 660 * spread(r, 0.05), 990, 0.35, 0.003, 0.05);
  tick(engine.ctx, voice.out, at, 2800, 5, 0.2, 0.015, seed);
}

function renderDrop(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const r = hash01(seed);
  blip(engine.ctx, voice.out, at, 'triangle', 880 * spread(r, 0.05), 560, 0.3, 0.002, 0.06);
  tick(engine.ctx, voice.out, at, 400, 1, 0.35, 0.035, seed);
}

function renderUse(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  tick(ctx, voice.out, at, 1800, 4, 0.4, 0.012, seed);
  tick(ctx, voice.out, at + 0.045, 520, 1.5, 0.5, 0.05, seed + 1);
  blip(ctx, voice.out, at + 0.045, 'square', 180, 150, 0.12, 0.002, 0.06);
}

function renderRefuel(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  tick(ctx, voice.out, at, 220, 0.9, 0.5, 0.05, seed);

  const envelope = gainNode(ctx, 0);
  const band = filterNode(ctx, 'bandpass', 380, 4.5);
  sweep(band.frequency, at + 0.02, 380, 1500, 0.17);
  const source = noise(ctx, at + 0.02, 0.2, 'pink', seed);
  chain(source, band, envelope, voice.out);
  ahd(envelope.gain, at + 0.02, 1.6, 0.03, 0.09, 0.07);
  voice.own(source);

  tick(ctx, voice.out, at + 0.2, 1600, 6, 0.28, 0.015, seed + 1);
  blip(ctx, voice.out, at + 0.2, 'triangle', 587.33, 587.33, 0.16, 0.003, 0.06);
}

function renderMark(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  tick(engine.ctx, voice.out, at, 1400 * spread(hash01(seed), 0.08), 6, 0.4, 0.02, seed);
  blip(engine.ctx, voice.out, at, 'square', 700, 700, 0.06, 0.002, 0.03);
}

function chirp(engine: AudioEngine, voice: Voice, at: number, first: number, second: number): void {
  const ctx = engine.ctx;
  const band = filterNode(ctx, 'bandpass', 1400, 1.6);
  band.connect(voice.out);
  blip(ctx, band, at, 'square', first, first, 0.22, 0.002, 0.02);
  blip(ctx, band, at + 0.026, 'square', second, second, 0.22, 0.002, 0.024);
}

function renderSend(engine: AudioEngine, voice: Voice, at: number): void {
  chirp(engine, voice, at, 1200, 1600);
}

function renderRecv(engine: AudioEngine, voice: Voice, at: number): void {
  chirp(engine, voice, at, 1600, 1200);
}

function renderSendFail(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const low = filterNode(ctx, 'lowpass', 900, 0.8);
  low.connect(voice.out);
  blip(ctx, low, at, 'square', 900, 600, 0.25, 0.002, 0.07);
  tick(ctx, voice.out, at, 300, 1, 0.3, 0.04, seed);
}

function renderSpawn(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  tick(ctx, voice.out, at, 700, 1.2, 0.5, 0.03, seed);

  const envelope = gainNode(ctx, 0);
  const band = filterNode(ctx, 'bandpass', 240, 3.5);
  sweep(band.frequency, at, 240, 1100, 0.16);
  const source = noise(ctx, at, 0.2, 'pink', seed);
  chain(source, band, envelope, voice.out);
  ahd(envelope.gain, at, 1.1, 0.02, 0.08, 0.09);
  voice.own(source);

  const glide = gainNode(ctx, 0);
  const body = osc(ctx, 'triangle', 165, at, 0.24);
  sweep(body.frequency, at + 0.02, 165, 330, 0.12);
  chain(body, glide, voice.out);
  ad(glide.gain, at + 0.02, 0.26, 0.02, 0.16);
  voice.own(body);
}

function renderDie(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const low = filterNode(ctx, 'lowpass', 600, 0.9);
  low.connect(voice.out);
  blip(ctx, low, at, 'sine', 200, 68, 0.6, 0.004, 0.3);
  tick(ctx, voice.out, at, 220, 0.8, 0.4, 0.08, seed);
}

function renderSync(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const low = filterNode(ctx, 'lowpass', 1600, 0.8);
  low.connect(voice.out);
  const r = hash01(seed);
  for (const ratio of [0.995, 1, 1.006]) {
    const envelope = gainNode(ctx, 0);
    const node = osc(ctx, 'triangle', 220 * ratio * spread(r, 0.02), at, 0.24);
    chain(node, envelope, low);
    ahd(envelope.gain, at, 0.18, 0.015, 0.02, 0.12);
    voice.own(node);
  }
  tick(ctx, voice.out, at, 1200, 3, 0.25, 0.02, seed);
}

function renderScrub(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  tick(engine.ctx, voice.out, at, 2600 * spread(hash01(seed), 0.15), 8, 0.3, 0.012, seed);
}

function renderObjective(engine: AudioEngine, voice: Voice, at: number): void {
  blip(engine.ctx, voice.out, at, 'triangle', 587.33, 587.33, 0.3, 0.004, 0.09);
  blip(engine.ctx, voice.out, at + 0.07, 'triangle', 880, 880, 0.26, 0.004, 0.11);
}

function renderObjectiveLost(engine: AudioEngine, voice: Voice, at: number): void {
  const low = filterNode(engine.ctx, 'lowpass', 1200, 0.8);
  low.connect(voice.out);
  blip(engine.ctx, low, at, 'triangle', 587.33, 587.33, 0.3, 0.004, 0.08);
  blip(engine.ctx, low, at + 0.07, 'triangle', 440, 415.3, 0.26, 0.004, 0.13);
}

function renderPassed(engine: AudioEngine, voice: Voice, at: number): void {
  const ctx = engine.ctx;
  blip(ctx, voice.out, at, 'sine', 146.83, 146.83, 0.4, 0.008, 0.18);
  blip(ctx, voice.out, at + 0.09, 'triangle', 220, 220, 0.3, 0.008, 0.24);
  voice.sendTo(engine.space, 0.15);
}

function renderFailed(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const low = filterNode(ctx, 'lowpass', 500, 0.9);
  low.connect(voice.out);
  const envelope = gainNode(ctx, 0);
  const body = osc(ctx, 'sine', 146.83, at, 0.5);
  sweep(body.frequency, at, 146.83, 103.83, 0.34);
  chain(body, envelope, low);
  ahd(envelope.gain, at, 0.55, 0.02, 0.06, 0.3);
  voice.own(body);
  tick(ctx, voice.out, at, 180, 0.7, 0.25, 0.09, seed);
}

interface MedalShape {
  notes: readonly number[];
  step: number;
  octave: number;
  rise: number;
  bright: number;
  shimmer: number;
  shimmerDecay: number;
  stamp: number;
  space: number;
}

const BRONZE: MedalShape = {
  notes: [293.66, 440],
  step: 0.085,
  octave: 0,
  rise: 0.12,
  bright: 3200,
  shimmer: 0,
  shimmerDecay: 0.12,
  stamp: 0,
  space: 0.1,
};
const SILVER: MedalShape = {
  notes: [293.66, 440, 587.33],
  step: 0.08,
  octave: 0.1,
  rise: 0.2,
  bright: 4400,
  shimmer: 0.05,
  shimmerDecay: 0.18,
  stamp: 0,
  space: 0.18,
};
const GOLD: MedalShape = {
  notes: [293.66, 440, 587.33, 880],
  step: 0.075,
  octave: 0.2,
  rise: 0.42,
  bright: 6800,
  shimmer: 0.09,
  shimmerDecay: 0.3,
  stamp: 0.26,
  space: 0.28,
};

function renderMedal(engine: AudioEngine, voice: Voice, at: number, shape: MedalShape): void {
  const ctx = engine.ctx;
  const body = filterNode(ctx, 'lowpass', shape.bright, 0.7);
  body.connect(voice.out);

  if (shape.stamp > 0) {
    blip(ctx, voice.out, at, 'sine', 73.42, 73.42, shape.stamp, 0.01, 0.36);
  }

  const last = shape.notes.length - 1;
  shape.notes.forEach((note, index) => {
    const when = at + index * shape.step;
    const decay = index === last ? 0.34 : 0.16;
    const swell = 1 + shape.rise * (last === 0 ? 0 : (index / last) * 2 - 1);
    blip(ctx, body, when, 'triangle', note, note, 0.3 * swell, 0.005, decay);
    if (shape.octave > 0)
      blip(ctx, body, when, 'sine', note * 2, note * 2, shape.octave * swell, 0.008, decay * 0.8);
  });

  if (shape.shimmer > 0) {
    const when = at + last * shape.step;
    const envelope = gainNode(ctx, 0);
    const band = filterNode(ctx, 'bandpass', 4600, 2.5);
    const source = noise(ctx, when, shape.shimmerDecay + 0.05, 'white', last);
    chain(source, band, envelope, voice.out);
    ad(envelope.gain, when, shape.shimmer, 0.008, shape.shimmerDecay);
    voice.own(source);
  }

  voice.sendTo(engine.space, shape.space);
}

const LADDER: readonly number[] = [293.66, 440, 587.33, 880, 1174.66];

function renderAchievement(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const step = Math.max(0, Math.min(LADDER.length - 1, Math.round(seed)));
  const note = LADDER[step] as number;
  const body = filterNode(ctx, 'lowpass', 5000, 0.7);
  body.connect(voice.out);
  blip(ctx, body, at, 'triangle', note, note, 0.3, 0.004, 0.14);
  blip(ctx, body, at, 'sine', note * 2, note * 2, 0.07, 0.006, 0.1);
  voice.sendTo(engine.space, 0.12);
}

function renderRunStart(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  tick(ctx, voice.out, at, 300, 1, 0.4, 0.04, seed);
  blip(ctx, voice.out, at, 'square', 110, 150, 0.1, 0.004, 0.09);
  const envelope = gainNode(ctx, 0);
  const band = filterNode(ctx, 'bandpass', 600, 1.4);
  sweep(band.frequency, at, 600, 1600, 0.1);
  const source = noise(ctx, at, 0.14, 'white', seed + 3);
  chain(source, band, envelope, voice.out);
  ahd(envelope.gain, at, 0.12, 0.02, 0.02, 0.08);
  voice.own(source);
}

function renderCompileError(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  const ctx = engine.ctx;
  const low = filterNode(ctx, 'lowpass', 700, 0.9);
  low.connect(voice.out);
  blip(ctx, low, at, 'square', 220, 220, 0.3, 0.003, 0.05);
  blip(ctx, low, at + 0.065, 'square', 220, 196, 0.3, 0.003, 0.07);
  tick(ctx, voice.out, at + 0.065, 180, 0.8, 0.25, 0.06, seed);
}

function renderCancel(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  tick(engine.ctx, voice.out, at, 1600, 6, 0.3, 0.012, seed);
  tick(engine.ctx, voice.out, at + 0.04, 900, 5, 0.3, 0.02, seed + 1);
}

function renderPanel(
  engine: AudioEngine,
  voice: Voice,
  at: number,
  seed: number,
  up: boolean,
): void {
  const ctx = engine.ctx;
  const envelope = gainNode(ctx, 0);
  const band = filterNode(ctx, 'bandpass', up ? 800 : 2200, 1.1);
  sweep(band.frequency, at, up ? 800 : 2200, up ? 2200 : 800, 0.06);
  const source = noise(ctx, at, 0.1, 'white', seed);
  chain(source, band, envelope, voice.out);
  ahd(envelope.gain, at, 0.35, 0.01, 0.01, 0.05);
  voice.own(source);
}

function renderButton(engine: AudioEngine, voice: Voice, at: number, seed: number): void {
  tick(engine.ctx, voice.out, at, 2200 * spread(hash01(seed), 0.1), 7, 0.3, 0.012, seed);
}

export const SOUNDS: Readonly<Record<SoundName, SoundSpec>> = {
  move: {
    bus: 'sfx',
    priority: 1,
    duration: 0.09,
    minIntervalMs: 45,
    gain: 0.425,
    render: renderMove,
  },
  blocked: {
    bus: 'sfx',
    priority: 3,
    duration: 0.2,
    minIntervalMs: 70,
    gain: 0.316,
    render: renderBlocked,
  },
  harvest: {
    bus: 'sfx',
    priority: 2,
    duration: 0.18,
    minIntervalMs: 60,
    gain: 0.368,
    render: renderHarvest,
  },
  mine: {
    bus: 'sfx',
    priority: 2,
    duration: 0.2,
    minIntervalMs: 60,
    gain: 0.239,
    render: renderMine,
  },
  plant: {
    bus: 'sfx',
    priority: 2,
    duration: 0.18,
    minIntervalMs: 60,
    gain: 0.259,
    render: renderPlant,
  },
  pickup: {
    bus: 'sfx',
    priority: 2,
    duration: 0.1,
    minIntervalMs: 50,
    gain: 0.292,
    render: renderPickup,
  },
  drop: {
    bus: 'sfx',
    priority: 2,
    duration: 0.12,
    minIntervalMs: 50,
    gain: 0.294,
    render: renderDrop,
  },
  use: {
    bus: 'sfx',
    priority: 2,
    duration: 0.17,
    minIntervalMs: 70,
    gain: 0.64,
    render: renderUse,
  },
  refuel: {
    bus: 'sfx',
    priority: 2,
    duration: 0.32,
    minIntervalMs: 140,
    gain: 0.319,
    render: renderRefuel,
  },
  mark: {
    bus: 'sfx',
    priority: 1,
    duration: 0.08,
    minIntervalMs: 50,
    gain: 0.542,
    render: renderMark,
  },
  send: {
    bus: 'sfx',
    priority: 2,
    duration: 0.09,
    minIntervalMs: 45,
    gain: 0.415,
    render: renderSend,
  },
  recv: {
    bus: 'sfx',
    priority: 2,
    duration: 0.09,
    minIntervalMs: 45,
    gain: 0.413,
    render: renderRecv,
  },
  sendFail: {
    bus: 'sfx',
    priority: 3,
    duration: 0.12,
    minIntervalMs: 70,
    gain: 0.365,
    render: renderSendFail,
  },
  spawn: {
    bus: 'sfx',
    priority: 3,
    duration: 0.26,
    minIntervalMs: 90,
    gain: 0.24,
    render: renderSpawn,
  },
  die: {
    bus: 'sfx',
    priority: 4,
    duration: 0.4,
    minIntervalMs: 120,
    gain: 0.341,
    render: renderDie,
  },
  sync: {
    bus: 'sfx',
    priority: 3,
    duration: 0.25,
    minIntervalMs: 90,
    gain: 0.269,
    render: renderSync,
  },
  scrub: {
    bus: 'sfx',
    priority: 1,
    duration: 0.05,
    minIntervalMs: 90,
    gain: 0.617,
    render: renderScrub,
  },

  objective: {
    bus: 'sfx',
    priority: 5,
    duration: 0.25,
    minIntervalMs: 120,
    gain: 0.484,
    render: renderObjective,
  },
  objectiveLost: {
    bus: 'sfx',
    priority: 5,
    duration: 0.27,
    minIntervalMs: 120,
    gain: 0.422,
    render: renderObjectiveLost,
  },
  passed: {
    bus: 'sfx',
    priority: 6,
    duration: 0.55,
    minIntervalMs: 400,
    gain: 0.664,
    render: renderPassed,
  },
  failed: {
    bus: 'sfx',
    priority: 6,
    duration: 0.6,
    minIntervalMs: 400,
    gain: 0.482,
    render: renderFailed,
  },
  medalBronze: {
    bus: 'sfx',
    priority: 7,
    duration: 0.55,
    minIntervalMs: 400,
    gain: 0.809,
    render: (engine, voice, at) => renderMedal(engine, voice, at, BRONZE),
  },
  medalSilver: {
    bus: 'sfx',
    priority: 7,
    duration: 0.7,
    minIntervalMs: 400,
    gain: 0.902,
    render: (engine, voice, at) => renderMedal(engine, voice, at, SILVER),
  },
  medalGold: {
    bus: 'sfx',
    priority: 7,
    duration: 0.78,
    minIntervalMs: 400,
    gain: 0.72,
    render: (engine, voice, at) => renderMedal(engine, voice, at, GOLD),
  },

  achievement: {
    bus: 'sfx',
    priority: 5,
    duration: 0.35,
    minIntervalMs: 90,
    gain: 0.44,
    render: renderAchievement,
  },

  runStart: {
    bus: 'ui',
    priority: 4,
    duration: 0.2,
    minIntervalMs: 120,
    gain: 0.728,
    render: renderRunStart,
  },
  compileError: {
    bus: 'ui',
    priority: 4,
    duration: 0.22,
    minIntervalMs: 200,
    gain: 0.415,
    render: renderCompileError,
  },
  cancel: {
    bus: 'ui',
    priority: 4,
    duration: 0.12,
    minIntervalMs: 120,
    gain: 1.41,
    render: renderCancel,
  },
  panelOpen: {
    bus: 'ui',
    priority: 3,
    duration: 0.11,
    minIntervalMs: 80,
    gain: 0.45,
    render: (engine, voice, at, seed) => renderPanel(engine, voice, at, seed, true),
  },
  panelClose: {
    bus: 'ui',
    priority: 3,
    duration: 0.11,
    minIntervalMs: 80,
    gain: 0.309,
    render: (engine, voice, at, seed) => renderPanel(engine, voice, at, seed, false),
  },
  button: {
    bus: 'ui',
    priority: 3,
    duration: 0.05,
    minIntervalMs: 40,
    gain: 0.883,
    render: renderButton,
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

export function play(
  engine: AudioEngine,
  name: SoundName,
  at: number,
  seed = 0,
  level = 1,
): Voice | null {
  const spec = SOUNDS[name];
  const voice = engine.voice({
    bus: spec.bus,
    priority: spec.priority,
    at,
    duration: spec.duration,
    gain: spec.gain * level,
  });
  if (!voice) return null;
  spec.render(engine, voice, at, seed);
  return voice;
}

export class SwarmTexture {
  private readonly level: GainNode;
  private readonly band: BiquadFilterNode;
  private readonly source: AudioBufferSourceNode;
  private readonly hum: OscillatorNode;
  private stopped = false;

  constructor(private readonly engine: AudioEngine) {
    const ctx = engine.ctx;
    this.level = gainNode(ctx, 0);
    this.band = filterNode(ctx, 'bandpass', 700, 0.9);
    this.source = ctx.createBufferSource();
    this.source.buffer = noiseBuffer(ctx, 'white');
    this.source.loop = true;
    this.source.start(engine.now());
    const shaper = filterNode(ctx, 'highpass', 220, 0.7);
    chain(this.source, this.band, shaper, this.level, engine.buses.sfx);

    const humLevel = gainNode(ctx, 0.06);
    this.hum = drone(ctx, 'triangle', 110, engine.now());
    chain(this.hum, humLevel, this.level);
  }

  set(amount: number, brightness = 0.5): void {
    if (this.stopped) return;
    const at = this.engine.now();
    this.level.gain.setTargetAtTime(Math.max(0, Math.min(1, amount)) * 0.16, at, 0.12);
    this.band.frequency.setTargetAtTime(500 + brightness * 900, at, 0.3);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const at = this.engine.now();
    this.level.gain.cancelScheduledValues(at);
    this.level.gain.setValueAtTime(this.level.gain.value, at);
    this.level.gain.linearRampToValueAtTime(0, at + 0.06);
    try {
      this.source.stop(at + 0.08);
      this.hum.stop(at + 0.08);
    } catch {
      // Already stopped.
    }
  }
}

export type AmbienceBiome =
  'hangar' | 'regolith' | 'yard' | 'cave' | 'grid' | 'signal' | 'swarm' | 'finale';

interface BedShape {
  roots: readonly number[];
  band: number;
  q: number;
  sway: number;
  rate: number;
  colour: 'white' | 'pink';
  air: number;
  hum: number;
}

const BEDS: Readonly<Record<AmbienceBiome, BedShape>> = {
  hangar: {
    roots: [55],
    band: 220,
    q: 0.6,
    sway: 60,
    rate: 0.05,
    colour: 'pink',
    air: 0.5,
    hum: 0.35,
  },
  regolith: {
    roots: [49],
    band: 340,
    q: 0.8,
    sway: 140,
    rate: 0.037,
    colour: 'pink',
    air: 0.7,
    hum: 0.25,
  },
  yard: {
    roots: [62, 93],
    band: 180,
    q: 0.5,
    sway: 50,
    rate: 0.043,
    colour: 'pink',
    air: 0.45,
    hum: 0.4,
  },
  cave: {
    roots: [41],
    band: 120,
    q: 0.4,
    sway: 40,
    rate: 0.026,
    colour: 'pink',
    air: 0.6,
    hum: 0.3,
  },
  grid: {
    roots: [60, 120],
    band: 260,
    q: 1.1,
    sway: 30,
    rate: 0.02,
    colour: 'white',
    air: 0.3,
    hum: 0.5,
  },
  signal: {
    roots: [45],
    band: 900,
    q: 1.6,
    sway: 220,
    rate: 0.031,
    colour: 'white',
    air: 0.45,
    hum: 0.28,
  },
  swarm: {
    roots: [52, 78],
    band: 400,
    q: 1.2,
    sway: 160,
    rate: 0.067,
    colour: 'white',
    air: 0.5,
    hum: 0.32,
  },
  finale: {
    roots: [43, 64.5],
    band: 260,
    q: 0.7,
    sway: 70,
    rate: 0.017,
    colour: 'pink',
    air: 0.55,
    hum: 0.42,
  },
};

export class AmbienceBed {
  private readonly level: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private stopped = false;

  constructor(
    private readonly engine: AudioEngine,
    biome: AmbienceBiome,
  ) {
    const ctx = engine.ctx;
    const shape = BEDS[biome];
    const at = engine.now();
    this.level = gainNode(ctx, 0);
    this.level.connect(engine.buses.ambience);
    this.level.gain.setValueAtTime(0, at);
    this.level.gain.linearRampToValueAtTime(1, at + 4);

    const band = filterNode(ctx, 'bandpass', shape.band, shape.q);
    const airLevel = gainNode(ctx, shape.air * 0.09);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, shape.colour);
    source.loop = true;
    source.start(at);
    chain(source, band, airLevel, this.level);
    this.sources.push(source);

    const sway = drone(ctx, 'sine', shape.rate, at);
    const swayDepth = gainNode(ctx, shape.sway);
    sway.connect(swayDepth).connect(band.frequency);
    this.sources.push(sway);

    const breath = drone(ctx, 'sine', shape.rate * 0.61, at);
    const breathDepth = gainNode(ctx, shape.air * 0.03);
    breath.connect(breathDepth).connect(airLevel.gain);
    this.sources.push(breath);

    const low = filterNode(ctx, 'lowpass', 240, 0.7);
    const humLevel = gainNode(ctx, shape.hum * 0.05);
    chain(low, humLevel, this.level);
    shape.roots.forEach((root, index) => {
      for (const ratio of [1, 1.004]) {
        const node = drone(ctx, index === 0 ? 'triangle' : 'sine', root * ratio, at);
        const nodeLevel = gainNode(ctx, index === 0 ? 0.5 : 0.28);
        chain(node, nodeLevel, low);
        this.sources.push(node);
      }
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const at = this.engine.now();
    this.level.gain.cancelScheduledValues(at);
    this.level.gain.setValueAtTime(this.level.gain.value, at);
    this.level.gain.linearRampToValueAtTime(0, at + 1.2);
    for (const source of this.sources) {
      try {
        source.stop(at + 1.3);
      } catch {
        // Already stopped.
      }
    }
  }
}
