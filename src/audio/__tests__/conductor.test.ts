import { describe, expect, it } from 'vitest';

import { Dir } from '../../engine/index.ts';
import type { Trace, TraceEvent } from '../../engine/index.ts';
import { Conductor, MAX_NEW_PER_FRAME, TEXTURE_ON, soundFor } from '../conductor.ts';
import { AudioEngine, MAX_VOICES } from '../engine.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';
import type { AudioSettings } from '../settings.ts';
import { MiniContext, peakBetween } from './offline.ts';

const UNITY: AudioSettings = { ...DEFAULT_SETTINGS, master: 1, sfx: 1, ui: 1, ambience: 1 };
const FRAME = 1 / 60;

/**
 * The conductor reads `trace.events` and nothing else — `initialWorld` and `keyframes` belong to
 * the renderer — so a test trace is just a sorted event list.
 */
function traceOf(events: TraceEvent[]): Trace {
  return {
    initialWorld: null,
    events,
    keyframes: [],
    endTick: events.length ? (events[events.length - 1] as TraceEvent).t : 0,
  } as unknown as Trace;
}

function move(t: number, botId = 0, ok = true): TraceEvent {
  return {
    t,
    botId,
    dt: 1,
    kind: 'move',
    from: { x: 0, y: 0 },
    to: { x: 0, y: ok ? -1 : 0 },
    dir: Dir.North,
    ok,
  };
}

interface Rig {
  ctx: MiniContext;
  engine: AudioEngine;
  conductor: Conductor;
  /** Runs one frame: advances the audio clock, then reports the playhead. */
  frame(tick: number, playing?: boolean, seconds?: number): void;
}

function rig(events: TraceEvent[], settings: AudioSettings = UNITY): Rig {
  const ctx = new MiniContext(44100);
  const engine = new AudioEngine(ctx.asContext(), settings);
  const conductor = new Conductor(engine, settings);
  conductor.setTrace(traceOf(events));
  return {
    ctx,
    engine,
    conductor,
    frame(tick, playing = true, seconds = FRAME) {
      ctx.advanceBy(seconds);
      conductor.playback(tick, playing);
    },
  };
}

describe('event mapping', () => {
  it('has an opinion about every event kind, including the silent ones', () => {
    const base = { t: 1, botId: 0, dt: 1 };
    const events: TraceEvent[] = [
      move(1),
      move(1, 0, false),
      { ...base, kind: 'turn', facing: Dir.East },
      { ...base, kind: 'wait', ticks: 2 },
      { ...base, kind: 'sync', to: 4 },
      { ...base, kind: 'harvest', at: { x: 0, y: 0 }, item: 'crop', count: 1, ok: true },
      { ...base, kind: 'mine', at: { x: 0, y: 0 }, item: 'ore', count: 1, ok: false },
      { ...base, kind: 'plant', at: { x: 0, y: 0 }, item: 'seed', ok: true },
      { ...base, kind: 'pickup', at: { x: 0, y: 0 }, item: 'ore', count: 1, ok: true },
      { ...base, kind: 'drop', at: { x: 0, y: 0 }, item: 'ore', count: 1, ok: true },
      { ...base, kind: 'act', name: 'link', ok: true },
      { ...base, kind: 'sense', name: 'scan', ok: true, count: 1 },
      { ...base, kind: 'use', at: { x: 0, y: 0 }, machineId: 'm1', ok: true },
      { ...base, kind: 'mark', at: { x: 0, y: 0 }, text: 'x' },
      { ...base, kind: 'refuel', at: { x: 0, y: 0 }, ok: true, to: 10 },
      { t: 1, kind: 'spend', resource: 'cable', amount: 1 },
      { ...base, kind: 'die', at: { x: 0, y: 0 }, reason: 'crushed' },
      { ...base, kind: 'send', to: 1, body: 'x', ok: true },
      { ...base, kind: 'recv', from: null, body: null },
      { t: 1, kind: 'print', text: 'hello' },
      { t: 1, kind: 'objective', id: 'o', state: 'met' },
      { t: 1, kind: 'fx', at: { x: 0, y: 0 }, fx: 'sparkle' },
    ] as TraceEvent[];

    for (const event of events) expect(() => soundFor(event)).not.toThrow();
    expect(soundFor(move(1))?.name).toBe('move');
    expect(soundFor(move(1, 0, false))?.name).toBe('blocked');
    // Free, constant or already-audible-elsewhere events stay silent on purpose.
    expect(soundFor(events[2] as TraceEvent)).toBeNull();
    expect(soundFor(events[11] as TraceEvent)).toBeNull();
    expect(soundFor(events[19] as TraceEvent)).toBeNull();
    expect(soundFor(events[21] as TraceEvent)).toBeNull();
    // A sync that released nobody cost no ticks and says nothing.
    expect(soundFor({ ...base, kind: 'sync', to: 1, dt: 0 } as TraceEvent)).toBeNull();
  });
});

describe('ordinary playback', () => {
  it('plays one sound per event at 1x', () => {
    const test = rig([move(1), move(2), move(3)]);
    test.conductor.setSpeed(4);
    test.frame(0);
    for (let i = 1; i <= 3; i++) {
      // 4 ticks per second: a tick is 15 frames apart, well clear of the 45ms move gate.
      for (let f = 0; f < 15; f++) test.frame(i - 1 + f / 15);
      test.frame(i);
    }
    expect(test.engine.stats.created).toBe(3);
  });

  it('gates a repeated sound by its minimum interval', () => {
    const test = rig([move(1), move(1), move(1), move(1)]);
    test.conductor.setSpeed(4);
    test.frame(0);
    test.frame(1);
    expect(test.engine.stats.created).toBe(1);
  });

  it('never starts more than the per-frame budget', () => {
    const kinds: TraceEvent[] = [
      move(1),
      move(1, 1, false),
      {
        t: 1,
        botId: 0,
        dt: 2,
        kind: 'harvest',
        at: { x: 0, y: 0 },
        item: 'crop',
        count: 1,
        ok: true,
      },
      { t: 1, botId: 0, dt: 2, kind: 'mine', at: { x: 0, y: 0 }, item: 'ore', count: 1, ok: true },
      {
        t: 1,
        botId: 0,
        dt: 1,
        kind: 'pickup',
        at: { x: 0, y: 0 },
        item: 'ore',
        count: 1,
        ok: true,
      },
      { t: 1, botId: 0, dt: 1, kind: 'drop', at: { x: 0, y: 0 }, item: 'ore', count: 1, ok: true },
      { t: 1, botId: 0, dt: 2, kind: 'use', at: { x: 0, y: 0 }, machineId: 'm', ok: true },
    ] as TraceEvent[];
    const test = rig(kinds);
    test.conductor.setSpeed(4);
    test.frame(0);
    test.frame(1);
    expect(test.engine.stats.created).toBe(MAX_NEW_PER_FRAME);
  });
});

describe('64x', () => {
  /** 20 events per tick for 300 ticks, played at 64x (256 ticks/second). */
  function storm(): Rig {
    const events: TraceEvent[] = [];
    for (let t = 0; t < 300; t++) {
      for (let i = 0; i < 20; i++) events.push(move(t, i, i % 7 === 0 ? false : true));
    }
    const test = rig(events);
    test.conductor.setSpeed(256);
    return test;
  }

  it('coalesces a 6000-event storm into a handful of sounds per second', () => {
    const test = storm();
    test.frame(0);
    let peakVoices = 0;
    for (let frame = 1; frame <= 70; frame++) {
      test.frame(frame * (256 / 60));
      peakVoices = Math.max(peakVoices, test.engine.activeVoices);
    }

    const seconds = 70 * FRAME;
    expect(peakVoices).toBeLessThanOrEqual(MAX_VOICES);
    // 6000 events in 1.2 seconds. Anything close to that many voices is a machine gun.
    expect(test.engine.stats.created).toBeLessThan(30);
    expect(test.engine.stats.created / seconds).toBeLessThan(25);
    expect(test.engine.stats.created).toBeGreaterThan(0);
  });

  it('degrades into the texture bed rather than into silence', () => {
    const test = storm();
    test.frame(0);
    for (let frame = 1; frame <= 40; frame++) test.frame(frame * (256 / 60));
    expect(test.conductor.eventsPerSecond).toBeGreaterThan(TEXTURE_ON);
    expect(test.conductor.textureAmount).toBeGreaterThan(0.9);

    const buffer = test.ctx.render(test.ctx.currentTime);
    // The bed is real audio, not a stub: it has to be making sound at the end of the storm.
    expect(
      peakBetween(buffer, 44100, test.ctx.currentTime - 0.1, test.ctx.currentTime),
    ).toBeGreaterThan(1e-3);
  });

  it('drops the texture the moment playback stops', () => {
    const test = storm();
    test.frame(0);
    for (let frame = 1; frame <= 40; frame++) test.frame(frame * (256 / 60));
    const at = 40 * (256 / 60);
    test.frame(at, false);
    expect(test.conductor.textureAmount).toBe(0);
  });
});

describe('scrubbing', () => {
  const scrubbable = (): TraceEvent[] =>
    Array.from({ length: 500 }, (_, i) => move(i, i % 4, i % 5 !== 0));

  it('costs one tick to drag across 500 ticks, not 500 sounds', () => {
    const test = rig(scrubbable());
    test.frame(0, false);
    test.frame(500, false);
    expect(test.engine.stats.created).toBeLessThanOrEqual(1);
  });

  it('acknowledges the drag with a tick when scrub ticks are on', () => {
    const test = rig(scrubbable());
    test.frame(0, false);
    test.frame(120, false);
    expect(test.engine.stats.created).toBe(1);
  });

  it('stays quiet while a drag keeps moving', () => {
    const test = rig(scrubbable());
    test.frame(0, false);
    for (let i = 1; i <= 60; i++) test.frame(i * 8, false);
    // One scrub tick per 90ms of dragging, no matter how fast the pointer moves.
    expect(test.engine.stats.created).toBeLessThanOrEqual(13);
  });

  it('leaves nothing ringing after a backward seek', () => {
    const test = rig(
      [{ t: 1, kind: 'objective', id: 'o', state: 'met' } as TraceEvent, move(1), move(2)],
      { ...UNITY, scrubTicks: false },
    );
    test.conductor.setSpeed(4);
    test.frame(0);
    test.frame(2);
    expect(test.engine.activeVoices).toBeGreaterThan(0);

    test.ctx.advanceBy(0.05);
    test.conductor.playback(0, false);
    expect(test.engine.activeVoices).toBe(0);

    const buffer = test.ctx.render(1.5);
    const silenceStarts = test.ctx.currentTime + 0.16;
    expect(peakBetween(buffer, 44100, silenceStarts, 1.5)).toBeLessThan(1e-4);
  });

  it('cuts a long stinger mid-flight', () => {
    const test = rig([]);
    test.conductor.outcome({ passed: true, medal: 'gold' });
    test.ctx.advanceBy(0.1);
    test.conductor.setTrace(traceOf([]));
    expect(test.engine.activeVoices).toBe(0);
    const buffer = test.ctx.render(2);
    expect(peakBetween(buffer, 44100, 0.35, 2)).toBeLessThan(1e-4);
  });
});

describe('transport and settings', () => {
  it('plays the verdict and its medal', () => {
    const test = rig([]);
    test.conductor.outcome({ passed: true, medal: 'gold' });
    expect(test.engine.stats.created).toBe(2);
  });

  it('plays only the verdict when there is no medal', () => {
    const test = rig([]);
    test.conductor.outcome({ passed: false });
    expect(test.engine.stats.created).toBe(1);
  });

  it('makes no sound at all when muted', () => {
    const test = rig([move(1), move(2)], { ...UNITY, muted: true });
    test.conductor.setSpeed(4);
    test.frame(0);
    test.frame(2);
    test.conductor.ui('button');
    test.conductor.outcome({ passed: true, medal: 'gold' });
    expect(test.engine.stats.created).toBe(0);
  });

  it('makes no sound while autoplay policy holds the context, then picks up cleanly', () => {
    const test = rig(Array.from({ length: 200 }, (_, i) => move(i)));
    test.ctx.state = 'suspended';
    test.conductor.setSpeed(4);
    test.frame(0);
    for (let i = 1; i <= 20; i++) test.frame(i);
    expect(test.engine.stats.created).toBe(0);
    // The frozen clock must not leave a garbage event rate behind for the resumed context.
    expect(test.conductor.eventsPerSecond).toBe(0);

    test.ctx.state = 'running';
    for (let i = 21; i <= 40; i++) {
      for (let f = 0; f < 15; f++) test.frame(i - 1 + f / 15);
    }
    expect(test.engine.stats.created).toBeGreaterThan(0);
  });

  it('follows a speed change it was never told about', () => {
    const test = rig(Array.from({ length: 200 }, (_, i) => move(i)));
    test.conductor.setSpeed(null);
    test.frame(0);
    // 64x with no `setSpeed` call: inferred from the playhead, and not mistaken for a scrub.
    for (let frame = 1; frame <= 30; frame++) test.frame(frame * (256 / 60));
    expect(test.engine.stats.created).toBeGreaterThan(1);
    expect(test.conductor.eventsPerSecond).toBeGreaterThan(TEXTURE_ON);
  });
});

describe('the end-of-run arc, staged', () => {
  it('plays the verdict and the medal separately as well as together', () => {
    const combined = rig([]);
    combined.conductor.outcome({ passed: true, medal: 'gold' });
    const both = combined.engine.activeVoices;

    const staged = rig([]);
    staged.conductor.verdict(true);
    staged.conductor.medal('gold');
    expect(staged.engine.activeVoices).toBe(both);
  });

  it('says nothing for a run that earned no medal', () => {
    const { conductor, engine } = rig([]);
    conductor.medal('none');
    conductor.medal(undefined);
    expect(engine.activeVoices).toBe(0);
  });

  it('lets commendations through even while a storm is thinning everything else', () => {
    const { conductor, engine } = rig([]);
    // Commendations are protected, so the density stretch that thins `move` cannot drop them.
    for (let i = 0; i < 4; i++) conductor.commend(i, i * 0.12);
    expect(engine.activeVoices).toBeGreaterThan(1);
  });
});
