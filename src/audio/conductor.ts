/**
 * Turns a playback position into sound.
 *
 * The game does not fire sounds from gameplay code — there is no gameplay code at play time. A
 * finished `Trace` is scrubbed back and forth at 0.25x to 64x (DESIGN.md §3), so the conductor is
 * a cursor over `trace.events` driven by the renderer's clock, and every hard problem in this
 * file comes from that:
 *
 * **Scrubbing.** A backward step, a jump, or any movement while paused is a *seek*: the cursor is
 * re-found by binary search, every voice in flight is cut, and at most one very quiet tick plays.
 * Dragging across 500 ticks therefore costs one sound, not 500.
 *
 * **64x.** At 256 ticks per second a busy World 7 trace delivers thousands of events per second.
 * Four defences, in order of how much they do:
 *   1. a per-frame budget of `MAX_NEW_PER_FRAME` new voices;
 *   2. a per-sound minimum interval that *stretches* with event density, so `move` thins from 22
 *      per second towards 4 as the storm grows;
 *   3. the voice pool's hard cap in `AudioEngine.voice`;
 *   4. above `TEXTURE_ON` events per second the `SwarmTexture` bed fades in and the surviving
 *      one-shots duck under it, so the result is the sound of a lot of machinery rather than a
 *      machine gun.
 *
 * Events dropped by 2-4 still count towards density. Loudness stays roughly constant as speed
 * rises; only the *detail* degrades, which is the right trade when nobody can hear 3ms apart.
 */

import { eventIndexAt } from '../engine/index.ts';
import type { Medal, Trace, TraceEvent } from '../engine/index.ts';
import type { AudioEngine } from './engine.ts';
import type { AudioSettings } from './settings.ts';
import { AmbienceBed, SOUNDS, SwarmTexture, play } from './sounds.ts';
import type { AmbienceBiome, SoundName, UiSound } from './sounds.ts';

/** Ticks per wall-clock second at 1x. Mirrors `src/game/store.ts`. */
export const BASE_TICKS_PER_SECOND = 4;

/**
 * How far ahead of `currentTime` a frame's events are scheduled. Events inside one frame are
 * spread across this window in trace order, which is what keeps a 64x burst from collapsing onto
 * a single instant and comb-filtering itself.
 */
export const LOOKAHEAD = 0.02;

/** New voices one frame may start. The pool cap is a backstop; this is the real limiter. */
export const MAX_NEW_PER_FRAME = 4;

/**
 * Gap between the verdict tone and the medal stinger when `outcome` plays both.
 *
 * `Renderer.celebrate` schedules its rings against the same number, which is what makes the first
 * ring land on the first note of the figure instead of near it. Change one and change the other.
 */
export const MEDAL_BEAT = 0.14;

/** Events per second at which the texture bed starts, and where it is fully open. */
export const TEXTURE_ON = 18;
export const TEXTURE_FULL = 90;

/** Smoothing constant for the density estimate, in seconds. */
export const DENSITY_TAU = 0.25;

/** A forward jump larger than this is a seek even while playing (speed `Infinity`, or a stall). */
export const JUMP_TICKS = 64;

/** How much the minimum interval of an ordinary sound stretches at full density. */
const MAX_STRETCH = 6;

/** Sounds at or above this priority ignore density: an outcome is never thinned or ducked. */
const PROTECTED_PRIORITY = 5;

interface Mapped {
  name: SoundName;
  level: number;
}

const FAILED = { name: 'blocked', level: 0.55 } as const;

/**
 * What a trace event sounds like, or `null` for the ones that must stay silent.
 *
 * The silences are deliberate. `sense` can occur millions of times in a trace with no tick cost
 * at all; `fx`, `tileChange` and `machineChange` are consequences of an action that already made
 * its own noise; `turn` and `wait` happen constantly and add nothing a player can act on.
 */
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
      // A barrier that released nobody cost no ticks and should not announce itself.
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

  /** Ticks per second, as told by the UI. `null` means "infer it from the playhead". */
  private declaredSpeed: number | null = null;
  private inferredSpeed = BASE_TICKS_PER_SECOND;

  /** Smoothed events per second crossing the playhead. Drives every degradation decision. */
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

  /** Diagnostics for the dev harness and the tests. */
  get eventsPerSecond(): number {
    return this.density;
  }

  get textureAmount(): number {
    const span = TEXTURE_FULL - TEXTURE_ON;
    return Math.max(0, Math.min(1, (this.density - TEXTURE_ON) / span));
  }

  /**
   * The renderer's clock, once per frame. Shaped to match `RendererPort.onTick`, so the UI can
   * wire it with a single `renderer.onTick(audio.playback)`.
   */
  readonly playback = (tick: number, playing: boolean): void => {
    const now = this.engine.now();
    const dt = this.started ? Math.max(0.001, Math.min(0.25, now - this.lastWall)) : 0.016;
    this.lastWall = now;
    this.engine.reap();

    if (this.wasPlaying && !playing) {
      // A paused playhead has no event rate. Letting the estimate decay instead would keep the
      // texture bed and the density stretch alive for a second after the player hit pause.
      this.density = 0;
      this.stopTexture();
    }
    this.wasPlaying = playing;

    if (!this.trace) {
      this.lastTick = tick;
      this.started = true;
      return;
    }

    // Nothing is audible until the first gesture resumes the context, and its clock is stopped
    // meanwhile. Track the playhead, make no sound, and resync cleanly on the frame it starts.
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

  /** One-shot UI feedback. Never rate-stretched, but still gated so a held key cannot buzz. */
  ui(name: UiSound): void {
    this.emit(name, this.engine.now() + LOOKAHEAD, 0, 1, true);
  }

  /**
   * The end-of-run report. The verdict is the UI's to know, so the UI calls this; nothing in the
   * trace says "you passed".
   */
  outcome(report: OutcomeReport): void {
    this.verdict(report.passed);
    if (report.passed) this.medal(report.medal, MEDAL_BEAT);
  }

  /**
   * Just the verdict tone.
   *
   * `outcome` fires the verdict and the medal `MEDAL_BEAT` apart, which is right when the two land
   * together. A results screen that *stages* its reveal — objectives ticking off, then the medal,
   * then commendations — needs to place each beat itself, so the three parts are separately
   * callable and `outcome` is the convenience that plays them back to back.
   */
  verdict(passed: boolean): void {
    this.emit(passed ? 'passed' : 'failed', this.engine.now() + LOOKAHEAD, 0, 1, true);
  }

  /** The medal stinger on its own. `after` delays it, in seconds. */
  medal(medal: Medal | undefined, after = 0): void {
    if (!medal || medal === 'none') return;
    const name =
      medal === 'gold' ? 'medalGold' : medal === 'silver' ? 'medalSilver' : 'medalBronze';
    this.emit(name, this.engine.now() + LOOKAHEAD + Math.max(0, after), 0, 1, true);
  }

  /**
   * One commendation landing. `index` walks the note up the reward family's ladder, so calling
   * this once per commendation as each one arrives produces an ascending phrase rather than the
   * same ping repeated. Protected, like every other outcome sound.
   */
  commend(index = 0, after = 0): void {
    this.emit('commend', this.engine.now() + LOOKAHEAD + Math.max(0, after), index, 1, true);
  }

  dispose(): void {
    this.stopTexture();
    this.ambience?.stop();
    this.ambience = null;
  }

  // -------------------------------------------------------------------------

  private speed(): number {
    return this.declaredSpeed ?? Math.max(0.25, this.inferredSpeed);
  }

  /**
   * A frame is a seek when the playhead did something playback could not have done: moved
   * backwards, moved at all while paused, or jumped further than a plausible frame at the
   * current speed.
   */
  private isSeek(delta: number, playing: boolean, dt: number): boolean {
    if (delta < 0) return true;
    if (!playing) return delta > 0.5;
    // Generous while playing: a dropped frame or a speed change the UI did not declare must not
    // be mistaken for a scrub, or every speed change would cut the sound off.
    return delta > Math.min(JUMP_TICKS, Math.max(this.speed() * dt * 4, 8) + 2);
  }

  /**
   * Re-points the cursor and silences everything. `announce` distinguishes a player-driven scrub,
   * which gets a tick, from an internal resync, which does not.
   */
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
    // `eventIndexAt` lands on the first event at or after `tick`; events exactly at `tick` are
    // behind the playhead now, so step past them. Mirrors `Renderer.seek`.
    while (cursor < trace.events.length && (trace.events[cursor] as TraceEvent).t <= tick) {
      cursor++;
    }
    const crossed = cursor !== this.cursor;
    this.cursor = cursor;
    if (announce && crossed && this.settings.scrubTicks) {
      this.emit('scrub', this.engine.now() + LOOKAHEAD, Math.round(tick), 1, false);
    }
  }

  /** Walks every event the playhead passed this frame, under budget. */
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
      // Offsets are always <= 0; clamping at -LOOKAHEAD keeps the schedule ahead of `now` while
      // preserving the order and rough spacing of events inside the frame.
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

  /**
   * The gate every sound passes through. Returns whether a voice actually started.
   *
   * Two throttles: a per-sound minimum interval that grows with density, and a level duck that
   * makes room for the texture. Protected sounds — outcomes, medals, UI — get neither.
   */
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
