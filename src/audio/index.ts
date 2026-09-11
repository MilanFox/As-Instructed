import type { Medal, Trace } from '../engine/index.ts';
import { AudioEngine } from './engine.ts';
import { Conductor, LOOKAHEAD } from './conductor.ts';
import { loadSettings, normalizeSettings, saveSettings } from './settings.ts';
import type { AudioSettings, Bus } from './settings.ts';
import { play } from './sounds.ts';
import type { AmbienceBiome, SoundName, UiSound } from './sounds.ts';

export { AudioEngine, MAX_VOICES, CUT_SECONDS, SPACE_FLUSH_SECONDS } from './engine.ts';
export type { Voice, VoiceRequest } from './engine.ts';

export {
  Conductor,
  soundFor,
  BASE_TICKS_PER_SECOND,
  LOOKAHEAD,
  MEDAL_BEAT,
  MAX_NEW_PER_FRAME,
  TEXTURE_ON,
  TEXTURE_FULL,
  JUMP_TICKS,
} from './conductor.ts';
export type { OutcomeReport } from './conductor.ts';

export { SOUNDS, SOUND_NAMES, play, AmbienceBed, SwarmTexture } from './sounds.ts';
export type {
  ActionSound,
  AmbienceBiome,
  OutcomeSound,
  SoundName,
  SoundSpec,
  UiSound,
} from './sounds.ts';

export {
  AUDIO_SETTINGS_KEY,
  DEFAULT_SETTINGS,
  busGain,
  loadSettings,
  masterGain,
  normalizeSettings,
  saveSettings,
} from './settings.ts';
export type { AudioSettings, Bus } from './settings.ts';

export * as Synth from './synth.ts';

const WORLD_BIOMES: readonly AmbienceBiome[] = [
  'hangar',
  'regolith',
  'yard',
  'cave',
  'grid',
  'signal',
  'swarm',
  'finale',
];

export function biomeForWorld(world: number): AmbienceBiome {
  const index = Math.max(0, Math.min(WORLD_BIOMES.length - 1, Math.round(world) - 1));
  return WORLD_BIOMES[index] as AmbienceBiome;
}

export interface PlaybackSource {
  onTick(listener: (tick: number, playing: boolean) => void): () => void;
}

export interface GameAudioOptions {
  settings?: Partial<AudioSettings>;
  context?: BaseAudioContext;
  persist?: boolean;
}

export class GameAudio {
  private current: AudioSettings;
  private engine: AudioEngine | null = null;
  private conductor: Conductor | null = null;
  private context: BaseAudioContext | null = null;
  private ownsContext = false;
  private unavailable = false;
  private gestureBound = false;
  private trace: Trace | null = null;
  private biome: AmbienceBiome | null = null;
  private speed: number | null = null;
  private readonly persist: boolean;
  private readonly injected: BaseAudioContext | null;

  constructor(options: GameAudioOptions = {}) {
    this.persist = options.persist !== false;
    this.injected = options.context ?? null;
    this.current = normalizeSettings({ ...loadSettings(), ...options.settings });
  }

  get settings(): Readonly<AudioSettings> {
    return this.current;
  }

  get running(): boolean {
    if (!this.context) return false;
    const live = this.live();
    return live === null || live.state === 'running';
  }

  get stats(): { voices: number; eventsPerSecond: number; texture: number } {
    return {
      voices: this.engine?.activeVoices ?? 0,
      eventsPerSecond: this.conductor?.eventsPerSecond ?? 0,
      texture: this.conductor?.textureAmount ?? 0,
    };
  }

  update(patch: Partial<AudioSettings>): Readonly<AudioSettings> {
    const next = normalizeSettings({ ...this.current, ...patch });
    const wasEnabled = this.current.enabled;
    this.current = next;
    if (this.persist) saveSettings(next);
    if (!next.enabled && wasEnabled) {
      this.teardown();
      return next;
    }
    if (next.ambienceEnabled && !this.conductor) this.ensureConductor();
    this.engine?.applySettings(next);
    this.conductor?.applySettings(next);
    return next;
  }

  setVolume(bus: Bus | 'master', value: number): Readonly<AudioSettings> {
    return this.update({ [bus]: value } as Partial<AudioSettings>);
  }

  async unlock(): Promise<void> {
    const engine = this.ensure();
    if (!engine) return;
    const live = this.live();
    if (!live || live.state === 'running') return;
    try {
      await live.resume();
    } catch {
      // Still blocked. The gesture listener installed in `ensure` will try again.
    }
  }

  setTrace(trace: Trace | null): void {
    this.trace = trace;
    this.conductor?.setTrace(trace);
  }

  setWorld(world: number): void {
    this.setBiome(biomeForWorld(world));
  }

  setBiome(biome: AmbienceBiome | null): void {
    this.biome = biome;
    if (this.conductor) {
      this.conductor.setBiome(biome);
      return;
    }
    if (this.current.ambienceEnabled) this.ensureConductor()?.setBiome(biome);
  }

  setSpeed(ticksPerSecond: number | null): void {
    this.speed = ticksPerSecond !== null && Number.isFinite(ticksPerSecond) ? ticksPerSecond : null;
    this.conductor?.setSpeed(this.speed);
  }

  attach(source: PlaybackSource): () => void {
    return source.onTick(this.playback);
  }

  readonly playback = (tick: number, playing: boolean): void => {
    this.ensureConductor()?.playback(tick, playing);
  };

  ui(name: UiSound): void {
    this.ensureConductor()?.ui(name);
  }

  outcome(report: { passed: boolean; medal?: Medal }): void {
    this.ensureConductor()?.outcome(report);
  }

  verdict(passed: boolean): void {
    this.ensureConductor()?.verdict(passed);
  }

  medal(medal: Medal | undefined, after = 0): void {
    this.ensureConductor()?.medal(medal, after);
  }

  commend(index = 0, after = 0): void {
    this.ensureConductor()?.commend(index, after);
  }

  cue(name: SoundName, seed = 0): void {
    const engine = this.ensure();
    if (!engine || this.current.muted) return;
    play(engine, name, engine.now() + LOOKAHEAD, seed);
  }

  dispose(): void {
    this.teardown();
  }

  private live(): AudioContext | null {
    return this.context && this.ownsContext ? (this.context as AudioContext) : null;
  }

  private ensureConductor(): Conductor | null {
    this.ensure();
    return this.conductor;
  }

  private ensure(): AudioEngine | null {
    if (this.engine) return this.engine;
    if (!this.current.enabled || this.unavailable) return null;

    const context = this.injected ?? createContext();
    if (!context) {
      this.unavailable = true;
      return null;
    }
    this.ownsContext = this.injected === null;
    this.context = context;

    const engine = new AudioEngine(context, this.current);
    const conductor = new Conductor(engine, this.current);
    conductor.setSpeed(this.speed);
    conductor.setBiome(this.biome);
    if (this.trace) conductor.setTrace(this.trace);
    this.engine = engine;
    this.conductor = conductor;
    this.bindGesture();
    return engine;
  }

  private bindGesture(): void {
    const context = this.live();
    if (this.gestureBound || !context) return;
    if (context.state === 'running') return;
    if (typeof document === 'undefined') return;
    this.gestureBound = true;
    const resume = (): void => {
      void context.resume().catch(() => undefined);
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
      document.addEventListener(type, resume, { once: true, capture: true, passive: true });
    }
  }

  private teardown(): void {
    this.conductor?.dispose();
    this.engine?.dispose();
    this.conductor = null;
    this.engine = null;
    const context = this.live();
    this.context = null;
    if (context) void context.close().catch(() => undefined);
    this.ownsContext = false;
    this.gestureBound = false;
  }
}

export function createAudio(options?: GameAudioOptions): GameAudio {
  return new GameAudio(options);
}

function createContext(): BaseAudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    return new AudioContext({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}
