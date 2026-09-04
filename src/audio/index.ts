/**
 * Public surface of the audio system.
 *
 * Everything the game needs is on one object. Mount it once, hand it the trace, point it at the
 * renderer's clock, and tell it about the two things that are not in the trace: what the player
 * clicked, and what the verdict was.
 *
 * ```ts
 * const audio = createAudio();
 *
 * // once, from any user gesture (Run, a click, a keypress):
 * void audio.unlock();
 *
 * // per level:
 * audio.setWorld(level.world);
 * audio.setTrace(trace);
 * audio.setSpeed(ticksPerSecond);
 * const detach = audio.attach(renderer);   // renderer: { onTick(cb): () => void }
 *
 * // events the trace cannot know about:
 * audio.ui('runStart');
 * audio.outcome({ passed: verdict.passed, medal });
 * ```
 *
 * With `settings.enabled === false` no `AudioContext` is ever constructed and every method above
 * is a no-op, so turning audio off costs exactly nothing.
 */

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

/** DESIGN.md §6, matching `biomeForWorld` in `src/render/tiles.ts`. */
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

/** Anything that reports a playback position. `Renderer` and `RendererPort` both qualify. */
export interface PlaybackSource {
  onTick(listener: (tick: number, playing: boolean) => void): () => void;
}

export interface GameAudioOptions {
  /** Overrides on top of what is in localStorage. */
  settings?: Partial<AudioSettings>;
  /** Injects a context instead of creating one. Tests and offline rendering only. */
  context?: BaseAudioContext;
  /** Whether setting changes are written back to localStorage. Default true. */
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

  /** True once a context exists and is not held by autoplay policy. */
  get running(): boolean {
    if (!this.context) return false;
    const live = this.live();
    return live === null || live.state === 'running';
  }

  /** Diagnostics. Cheap enough to poll from a HUD. */
  get stats(): { voices: number; eventsPerSecond: number; texture: number } {
    return {
      voices: this.engine?.activeVoices ?? 0,
      eventsPerSecond: this.conductor?.eventsPerSecond ?? 0,
      texture: this.conductor?.textureAmount ?? 0,
    };
  }

  /**
   * Applies a settings patch, persists it, and reconfigures a live engine. Turning `enabled` off
   * tears the context down; turning it back on rebuilds it on the next sound.
   */
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

  /**
   * Resumes a context that autoplay policy left suspended. Safe to call from every gesture, safe
   * to call when there is nothing to resume, and it never rejects.
   */
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
    // Only spin the context up early if there is actually a bed to start; otherwise the biome
    // waits until the first sound and costs nothing.
    if (this.current.ambienceEnabled) this.ensureConductor()?.setBiome(biome);
  }

  /** Ticks per wall-clock second. Pass `null` (or `Infinity`) to let the conductor infer it. */
  setSpeed(ticksPerSecond: number | null): void {
    this.speed = ticksPerSecond !== null && Number.isFinite(ticksPerSecond) ? ticksPerSecond : null;
    this.conductor?.setSpeed(this.speed);
  }

  /** Subscribes to a playback source and returns the unsubscribe. */
  attach(source: PlaybackSource): () => void {
    return source.onTick(this.playback);
  }

  /** The per-frame drive. Shaped for `RendererPort.onTick`; safe to call at 60Hz forever. */
  readonly playback = (tick: number, playing: boolean): void => {
    this.ensureConductor()?.playback(tick, playing);
  };

  ui(name: UiSound): void {
    this.ensureConductor()?.ui(name);
  }

  outcome(report: { passed: boolean; medal?: Medal }): void {
    this.ensureConductor()?.outcome(report);
  }

  /**
   * Fires one catalogue sound directly, bypassing the conductor's rate limiter. For the dev
   * harness and for anything the UI wants to trigger by name; ordinary UI feedback should go
   * through `ui()`, which is gated.
   */
  cue(name: SoundName, seed = 0): void {
    const engine = this.ensure();
    if (!engine || this.current.muted) return;
    play(engine, name, engine.now() + LOOKAHEAD, seed);
  }

  dispose(): void {
    this.teardown();
  }

  // -------------------------------------------------------------------------

  /** The context only when we created it, which is the only case it can be a real `AudioContext`. */
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

  /**
   * Autoplay policy: a context created before the first gesture starts suspended, and calling
   * `resume()` outside a gesture is refused. One capture-phase listener per context fixes it
   * without every call site having to remember (DESIGN.md §10.7 — it must never throw).
   */
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
