import { eventIndexAt } from '../engine/index.ts';
import type { Medal, Trace, TraceEvent } from '../engine/index.ts';
import type { AudioEngine } from './engine.ts';
import type { AudioSettings } from './settings.ts';
import { AmbienceBed, SOUNDS, SwarmTexture, play } from './sounds.ts';
import type { AmbienceBiome, SoundName, UiSound } from './sounds.ts';

export const BASE_TICKS_PER_SECOND = 4;

export const LOOKAHEAD = 0.02;

export const MAX_NEW_PER_FRAME = 4;

export const MEDAL_BEAT = 0.14;

export const TEXTURE_ON = 18;
export const TEXTURE_FULL = 90;

export const DENSITY_TAU = 0.25;

export const JUMP_TICKS = 64;

const MAX_STRETCH = 6;

const PROTECTED_PRIORITY = 5;

interface Mapped {
  name: SoundName;
  level: number;
}

const FAILED = { name: 'blocked', level: 0.55 } as const;

export function soundFor(event: TraceEvent): Mapped | null {
  switch (event.kind) {
    case 'move':
      return event.ok ? { name: 'move', level: 1 } : { name: 'blocked', level: 1 };
    case 'harvest':
      return event.ok ? { name: 'harvest', level: 1 } : FAILED;
    case 'mine':
      return event.ok ? { name: 'mine', level: 1 } : FAILED;
    case 'plant':
      return event.ok ? { name: 'plant', level: 1 } : FAILED;
    case 'pickup':
      return event.ok ? { name: 'pickup', level: 1 } : FAILED;
    case 'drop':
      return event.ok ? { name: 'drop', level: 1 } : FAILED;
    case 'use':
      return event.ok ? { name: 'use', level: 1 } : FAILED;
    case 'refuel':
      return event.ok ? { name: 'refuel', level: 1 } : FAILED;
    case 'act':
      return event.ok ? { name: 'use', level: 0.85 } : FAILED;
    case 'mark':
      return { name: 'mark', level: 1 };
    case 'send':
      return event.ok ? { name: 'send', level: 1 } : { name: 'sendFail', level: 1 };
    case 'recv':
      return event.from === null ? null : { name: 'recv', level: 1 };
    case 'spawn':
      return { name: 'spawn', level: 1 };
    case 'die':
      return { name: 'die', level: 1 };
    case 'sync':
      return event.dt > 0 ? { name: 'sync', level: 1 } : null;
    case 'objective':
      return event.state === 'met'
        ? { name: 'objective', level: 1 }
        : { name: 'objectiveLost', level: 1 };
    case 'turn':
    case 'wait':
    case 'sense':
    case 'print':
    case 'tileChange':
    case 'machineChange':
    case 'spend':
    case 'fx':
      return null;
  }
}

export interface OutcomeReport {
  passed: boolean;
  medal?: Medal;
}

export class Conductor {
  private trace: Trace | null = null;
  private cursor = 0;
  private lastTick = 0;
  private lastWall = 0;
  private started = false;

  private declaredSpeed: number | null = null;
  private inferredSpeed = BASE_TICKS_PER_SECOND;

  private density = 0;
  private wasPlaying = false;

  private readonly lastPlayed = new Map<SoundName, number>();
  private texture: SwarmTexture | null = null;
  private ambience: AmbienceBed | null = null;
  private biome: AmbienceBiome | null = null;

  constructor(
    private readonly engine: AudioEngine,
    private settings: AudioSettings,
  ) {}

  setTrace(trace: Trace | null): void {
    this.trace = trace;
    this.cursor = 0;
    this.lastTick = 0;
    this.started = false;
    this.density = 0;
    this.lastPlayed.clear();
    this.engine.releaseAll();
    this.stopTexture();
  }

  setSpeed(ticksPerSecond: number | null): void {
    this.declaredSpeed =
      ticksPerSecond !== null && Number.isFinite(ticksPerSecond) && ticksPerSecond > 0
        ? ticksPerSecond
        : null;
  }

  applySettings(settings: AudioSettings): void {
    this.settings = settings;
    this.refreshAmbience();
  }

  setBiome(biome: AmbienceBiome | null): void {
    if (biome === this.biome) return;
    this.biome = biome;
    this.ambience?.stop();
    this.ambience = null;
    this.refreshAmbience();
  }

  get eventsPerSecond(): number {
    return this.density;
  }

  get textureAmount(): number {
    const span = TEXTURE_FULL - TEXTURE_ON;
    return Math.max(0, Math.min(1, (this.density - TEXTURE_ON) / span));
  }

  readonly playback = (tick: number, playing: boolean): void => {
    const now = this.engine.now();
    const dt = this.started ? Math.max(0.001, Math.min(0.25, now - this.lastWall)) : 0.016;
    this.lastWall = now;
    this.engine.reap();

    if (this.wasPlaying && !playing) {
      this.density = 0;
      this.stopTexture();
    }
    this.wasPlaying = playing;

    if (!this.trace) {
      this.lastTick = tick;
      this.started = true;
      return;
    }

    if (!this.engine.audible) {
      this.seekTo(tick, false);
      return;
    }

    const delta = tick - this.lastTick;
    if (!this.started) {
      this.started = true;
      this.seekTo(tick, false);
      return;
    }

    if (this.isSeek(delta, playing, dt)) {
      this.seekTo(tick, delta !== 0);
      return;
    }

    if (playing && delta > 0 && this.declaredSpeed === null) {
      const observed = delta / dt;
      this.inferredSpeed = this.inferredSpeed * 0.7 + observed * 0.3;
    }

    this.consume(tick, now, dt);
    this.lastTick = tick;
  };

  ui(name: UiSound): void {
    this.emit(name, this.engine.now() + LOOKAHEAD, 0, 1, true);
  }

  outcome(report: OutcomeReport): void {
    this.verdict(report.passed);
    if (report.passed) this.medal(report.medal, MEDAL_BEAT);
  }

  verdict(passed: boolean): void {
    this.emit(passed ? 'passed' : 'failed', this.engine.now() + LOOKAHEAD, 0, 1, true);
  }

  medal(medal: Medal | undefined, after = 0): void {
    if (!medal || medal === 'none') return;
    const name =
      medal === 'gold' ? 'medalGold' : medal === 'silver' ? 'medalSilver' : 'medalBronze';
    this.emit(name, this.engine.now() + LOOKAHEAD + Math.max(0, after), 0, 1, true);
  }

  commend(index = 0, after = 0): void {
    this.emit('commend', this.engine.now() + LOOKAHEAD + Math.max(0, after), index, 1, true);
  }

  dispose(): void {
    this.stopTexture();
    this.ambience?.stop();
    this.ambience = null;
  }

  private speed(): number {
    return this.declaredSpeed ?? Math.max(0.25, this.inferredSpeed);
  }

  private isSeek(delta: number, playing: boolean, dt: number): boolean {
    if (delta < 0) return true;
    if (!playing) return delta > 0.5;
    return delta > Math.min(JUMP_TICKS, Math.max(this.speed() * dt * 4, 8) + 2);
  }

  private seekTo(tick: number, announce: boolean): void {
    const trace = this.trace;
    this.engine.releaseAll();
    this.stopTexture();
    this.density = 0;
    this.lastTick = tick;
    if (!trace) {
      this.cursor = 0;
      return;
    }
    let cursor = eventIndexAt(trace, tick);
    while (cursor < trace.events.length && (trace.events[cursor] as TraceEvent).t <= tick) {
      cursor++;
    }
    const crossed = cursor !== this.cursor;
    this.cursor = cursor;
    if (announce && crossed && this.settings.scrubTicks) {
      this.emit('scrub', this.engine.now() + LOOKAHEAD, Math.round(tick), 1, false);
    }
  }

  private consume(tick: number, now: number, dt: number): void {
    const trace = this.trace;
    if (!trace) return;
    const events = trace.events;
    const speed = Math.max(0.25, this.speed());
    let crossed = 0;
    let startedVoices = 0;

    while (this.cursor < events.length) {
      const event = events[this.cursor] as TraceEvent;
      if (event.t > tick) break;
      const index = this.cursor;
      this.cursor++;
      crossed++;
      if (startedVoices >= MAX_NEW_PER_FRAME) continue;
      const mapped = soundFor(event);
      if (!mapped) continue;
      const offset = Math.max(-LOOKAHEAD, (event.t - tick) / speed);
      const seed = index * 2654435761 + Math.round(event.t) * 97;
      if (this.emit(mapped.name, now + LOOKAHEAD + offset, seed, mapped.level, false)) {
        startedVoices++;
      }
    }

    this.updateDensity(crossed, dt);
  }

  private updateDensity(crossed: number, dt: number): void {
    const instant = crossed / dt;
    const alpha = 1 - Math.exp(-dt / DENSITY_TAU);
    this.density += (instant - this.density) * alpha;
    if (this.density < 0.05) this.density = 0;

    const amount = this.textureAmount;
    if (amount > 0) {
      if (!this.texture) this.texture = new SwarmTexture(this.engine);
      this.texture.set(amount, Math.min(1, this.density / TEXTURE_FULL));
    } else if (this.texture) {
      this.texture.set(0);
    }
  }

  private emit(
    name: SoundName,
    at: number,
    seed: number,
    level: number,
    protectedSound: boolean,
  ): boolean {
    if (!this.settings.enabled || this.settings.muted) return false;
    const spec = SOUNDS[name];
    const isProtected = protectedSound || spec.priority >= PROTECTED_PRIORITY;
    const stretch = isProtected ? 1 : 1 + MAX_STRETCH * this.textureAmount;
    const gate = spec.minIntervalMs * 0.001 * stretch;
    const last = this.lastPlayed.get(name);
    if (last !== undefined && at - last < gate) return false;
    const duck = isProtected ? 1 : 1 - 0.5 * this.textureAmount;
    const voice = play(this.engine, name, at, seed, level * duck);
    if (!voice) return false;
    this.lastPlayed.set(name, at);
    return true;
  }

  private stopTexture(): void {
    this.texture?.stop();
    this.texture = null;
  }

  private refreshAmbience(): void {
    const wanted = this.settings.enabled && this.settings.ambienceEnabled && this.biome !== null;
    if (wanted && !this.ambience && this.biome) {
      this.ambience = new AmbienceBed(this.engine, this.biome);
    } else if (!wanted && this.ambience) {
      this.ambience.stop();
      this.ambience = null;
    }
  }
}
