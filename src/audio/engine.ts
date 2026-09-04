/**
 * The mixer and the voice pool.
 *
 * Graph, once per context:
 *
 * ```
 *   sfx ------\
 *   ui -------+--> master --> limiter --> destination
 *   ambience -/        ^
 *   space taps --------/
 * ```
 *
 * Voices are the interesting part. A trace played at 64x delivers thousands of events per second
 * (DESIGN.md §3), and WebAudio will happily accept every one of them until the audio thread
 * starves. `voice()` is therefore the single door every sound goes through, it refuses to open
 * past `MAX_VOICES`, and it hands back `null` rather than throwing — a dropped sound is a
 * non-event, a stalled audio thread is a bug report.
 *
 * The pool is swept lazily. There are no timers anywhere in this file: a voice is reclaimed the
 * next time anybody asks for one, which means an idle game does exactly nothing.
 */

import { busGain, masterGain } from './settings.ts';
import type { AudioSettings, Bus } from './settings.ts';
import { filterNode, gainNode } from './synth.ts';

/** Hard ceiling on simultaneous sounds. Reached only during a high-speed event storm. */
export const MAX_VOICES = 16;

/** How long a stolen or seek-cancelled voice takes to reach zero. Short enough to read as a cut. */
export const CUT_SECONDS = 0.008;

/**
 * How long the space network stays muted after a seek. Long enough to outrun the longest tap
 * (`SPACE_TAPS`), which is the only part of the graph that can still be ringing once its source
 * nodes have been stopped.
 */
export const SPACE_FLUSH_SECONDS = 0.2;

/** Feed-forward taps, in seconds. No feedback path: the tail is finite and always dies. */
const SPACE_TAPS: readonly { delay: number; gain: number }[] = [
  { delay: 0.017, gain: 0.5 },
  { delay: 0.029, gain: 0.38 },
  { delay: 0.043, gain: 0.28 },
  { delay: 0.061, gain: 0.2 },
  { delay: 0.089, gain: 0.13 },
  { delay: 0.127, gain: 0.08 },
];

export interface VoiceRequest {
  bus: Bus;
  /** Ties are broken in favour of the voice already playing. */
  priority: number;
  /** Context time the voice starts. */
  at: number;
  /** Seconds until it is genuinely silent. Pool bookkeeping only; it schedules nothing. */
  duration: number;
  /** Voice level, before bus and master. */
  gain: number;
}

/**
 * One sound in flight. The sound function writes into `out` and registers its sources with
 * `own`, which is what lets a seek stop everything mid-flight.
 */
export class Voice {
  readonly out: GainNode;
  readonly at: number;
  readonly priority: number;
  end: number;
  dead = false;

  private readonly ctx: BaseAudioContext;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private space: GainNode | null = null;

  constructor(ctx: BaseAudioContext, request: VoiceRequest, bus: AudioNode) {
    this.ctx = ctx;
    this.at = request.at;
    this.priority = request.priority;
    this.end = request.at + request.duration;
    this.out = gainNode(ctx, request.gain);
    this.out.connect(bus);
  }

  /** Registers a source so `cut` can stop it. Sources are expected to be started already. */
  own(source: AudioScheduledSourceNode): void {
    this.sources.push(source);
  }

  /** Sends a copy into the shared space network. Stingers only. */
  sendTo(space: AudioNode, amount: number): void {
    this.space = gainNode(this.ctx, amount);
    this.out.connect(this.space).connect(space);
  }

  /** Silences the voice immediately, whatever it had scheduled. Idempotent. */
  cut(when: number): void {
    if (this.dead) return;
    this.dead = true;
    const gain = this.out.gain;
    gain.cancelScheduledValues(when);
    gain.setValueAtTime(gain.value, when);
    gain.linearRampToValueAtTime(0, when + CUT_SECONDS);
    for (const source of this.sources) {
      try {
        source.stop(when + CUT_SECONDS);
      } catch {
        // A source that already ended throws nothing useful; it is already silent.
      }
    }
    this.end = when + CUT_SECONDS;
  }

  release(): void {
    try {
      this.out.disconnect();
      this.space?.disconnect();
    } catch {
      // Already detached.
    }
    this.sources.length = 0;
  }
}

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  readonly buses: Readonly<Record<Bus, GainNode>>;
  /** Input to the feed-forward tap network. Voices send into it; nothing reads from it. */
  readonly space: GainNode;

  private readonly master: GainNode;
  private readonly spaceOut: GainNode;
  private readonly voices: Voice[] = [];
  private stolen = 0;
  private dropped = 0;
  private created = 0;

  constructor(ctx: BaseAudioContext, settings: AudioSettings) {
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

    this.master = gainNode(ctx, masterGain(settings));
    this.master.connect(limiter);

    this.buses = {
      sfx: gainNode(ctx, busGain(settings, 'sfx')),
      ui: gainNode(ctx, busGain(settings, 'ui')),
      ambience: gainNode(ctx, busGain(settings, 'ambience')),
    };
    for (const bus of Object.values(this.buses)) bus.connect(this.master);

    this.space = gainNode(ctx, 1);
    this.spaceOut = gainNode(ctx, 0.5);
    const damping = filterNode(ctx, 'lowpass', 3200, 0.7);
    for (const tap of SPACE_TAPS) {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = tap.delay;
      const level = gainNode(ctx, tap.gain);
      this.space.connect(delay).connect(level).connect(damping);
    }
    damping.connect(this.spaceOut).connect(this.master);
  }

  now(): number {
    return this.ctx.currentTime;
  }

  /**
   * False while autoplay policy still holds the context. A suspended context's `currentTime` does
   * not advance, so every clock the conductor keeps would be frozen and its event-rate estimate
   * meaningless. Callers skip their work instead of computing nonsense nobody can hear.
   */
  get audible(): boolean {
    const state = (this.ctx as { state?: string }).state;
    return state === undefined || state === 'running';
  }

  get activeVoices(): number {
    return this.voices.length;
  }

  /** Diagnostics for the dev harness and the rate-limiter tests. */
  get stats(): { active: number; created: number; stolen: number; dropped: number } {
    return {
      active: this.voices.length,
      created: this.created,
      stolen: this.stolen,
      dropped: this.dropped,
    };
  }

  applySettings(settings: AudioSettings): void {
    const at = this.now();
    // Ramped, not stepped: a slider drag that steps a gain param clicks on every frame.
    rampTo(this.master.gain, masterGain(settings), at);
    for (const bus of ['sfx', 'ui', 'ambience'] as const) {
      rampTo(this.buses[bus].gain, busGain(settings, bus), at);
    }
  }

  /**
   * Allocates a voice, or returns `null` when the pool is full and nothing cheaper is playing.
   * Callers must handle `null`; that is the mechanism that keeps 64x from melting.
   */
  voice(request: VoiceRequest): Voice | null {
    this.reap();
    if (this.voices.length >= MAX_VOICES) {
      const victim = this.weakest();
      if (!victim || victim.priority >= request.priority) {
        this.dropped++;
        return null;
      }
      victim.cut(this.now());
      victim.release();
      this.voices.splice(this.voices.indexOf(victim), 1);
      this.stolen++;
    }
    const voice = new Voice(this.ctx, request, this.buses[request.bus]);
    this.voices.push(voice);
    this.created++;
    return voice;
  }

  /**
   * Stops every voice now. Called on every seek: a scrub must never leave a note ringing, and the
   * space taps are muted alongside because they outlive their sources by up to 127ms.
   */
  releaseAll(): void {
    const at = this.now();
    for (const voice of this.voices) {
      voice.cut(at);
      voice.release();
    }
    this.voices.length = 0;
    const level = this.spaceOut.gain;
    level.cancelScheduledValues(at);
    level.setValueAtTime(level.value, at);
    level.linearRampToValueAtTime(0, at + CUT_SECONDS);
    level.setValueAtTime(0, at + SPACE_FLUSH_SECONDS);
    level.linearRampToValueAtTime(0.5, at + SPACE_FLUSH_SECONDS + 0.02);
  }

  /** Drops voices that have finished. Cheap, allocation-free, and safe to call every frame. */
  reap(): void {
    const now = this.now();
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const voice = this.voices[i] as Voice;
      if (voice.end > now) continue;
      voice.release();
      this.voices.splice(i, 1);
    }
  }

  dispose(): void {
    this.releaseAll();
    try {
      this.master.disconnect();
      this.space.disconnect();
      this.spaceOut.disconnect();
      for (const bus of Object.values(this.buses)) bus.disconnect();
    } catch {
      // Already torn down.
    }
  }

  /** Lowest priority, then oldest. The voice whose loss the player is least likely to notice. */
  private weakest(): Voice | null {
    let worst: Voice | null = null;
    for (const voice of this.voices) {
      if (!worst || voice.priority < worst.priority) worst = voice;
      else if (voice.priority === worst.priority && voice.at < worst.at) worst = voice;
    }
    return worst;
  }
}

function rampTo(param: AudioParam, value: number, at: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
  param.linearRampToValueAtTime(value, at + 0.03);
}
