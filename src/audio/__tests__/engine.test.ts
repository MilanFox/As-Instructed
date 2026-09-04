import { describe, expect, it } from 'vitest';

import { AudioEngine, MAX_VOICES } from '../engine.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';
import type { AudioSettings } from '../settings.ts';
import { play } from '../sounds.ts';
import { MiniContext, analyse, peakBetween } from './offline.ts';

const UNITY: AudioSettings = { ...DEFAULT_SETTINGS, master: 1, sfx: 1, ui: 1, ambience: 1 };

function engineOn(settings: AudioSettings = UNITY): { ctx: MiniContext; engine: AudioEngine } {
  const ctx = new MiniContext(44100);
  return { ctx, engine: new AudioEngine(ctx.asContext(), settings) };
}

describe('the voice pool', () => {
  it('refuses to grow past the cap', () => {
    const { engine } = engineOn();
    for (let i = 0; i < 200; i++) play(engine, 'move', 0.01, i);
    expect(engine.activeVoices).toBeLessThanOrEqual(MAX_VOICES);
    expect(engine.stats.dropped).toBeGreaterThan(0);
  });

  it('lets an important sound take a slot from an unimportant one', () => {
    const { engine } = engineOn();
    for (let i = 0; i < MAX_VOICES; i++) play(engine, 'move', 0.01, i);
    expect(engine.activeVoices).toBe(MAX_VOICES);

    expect(play(engine, 'medalGold', 0.01, 0)).not.toBeNull();
    expect(engine.stats.stolen).toBe(1);

    // Once the pool is full of important sounds, an unimportant one is refused outright rather
    // than cutting one of them short.
    for (let i = 0; i < MAX_VOICES; i++) play(engine, 'medalGold', 0.01, i);
    const stolen = engine.stats.stolen;
    expect(play(engine, 'move', 0.01, 99)).toBeNull();
    expect(engine.stats.stolen).toBe(stolen);
  });

  it('reclaims voices once they are silent', () => {
    const { ctx, engine } = engineOn();
    for (let i = 0; i < 8; i++) play(engine, 'move', 0.01, i);
    expect(engine.activeVoices).toBe(8);
    ctx.advanceTo(1);
    engine.reap();
    expect(engine.activeVoices).toBe(0);
  });

  it('silences everything on releaseAll, including the space tail', () => {
    const { ctx, engine } = engineOn();
    play(engine, 'medalGold', 0.01, 0);
    ctx.advanceTo(0.1);
    engine.releaseAll();
    expect(engine.activeVoices).toBe(0);
    const buffer = ctx.render(2);
    expect(peakBetween(buffer, ctx.sampleRate, 0.35, 2)).toBeLessThan(1e-4);
  });
});

describe('the mixer', () => {
  it('routes each category through its own bus', () => {
    const quietUi: AudioSettings = { ...UNITY, ui: 0 };
    const { ctx, engine } = engineOn(quietUi);
    play(engine, 'button', 0.01, 0);
    expect(analyse(ctx.render(0.3), ctx.sampleRate).peak).toBe(0);

    const audible = engineOn({ ...UNITY, ui: 1 });
    play(audible.engine, 'button', 0.01, 0);
    expect(analyse(audible.ctx.render(0.3), audible.ctx.sampleRate).peak).toBeGreaterThan(0.01);
  });

  it('mutes at the master node, so a mute is not a per-bus edit', () => {
    const { ctx, engine } = engineOn({ ...UNITY, muted: true });
    play(engine, 'medalGold', 0.01, 0);
    expect(analyse(ctx.render(1.2), ctx.sampleRate).peak).toBe(0);
  });

  it('ramps a volume change instead of stepping it', () => {
    const { ctx, engine } = engineOn();
    play(engine, 'refuel', 0.01, 0);
    ctx.advanceTo(0.05);
    engine.applySettings({ ...UNITY, master: 0 });
    const buffer = ctx.render(0.4);
    // A stepped gain would produce a discontinuity; the ramp reaches zero over 30ms.
    expect(peakBetween(buffer, ctx.sampleRate, 0.09, 0.4)).toBeLessThan(1e-3);
    expect(peakBetween(buffer, ctx.sampleRate, 0.02, 0.05)).toBeGreaterThan(1e-3);
  });

  it('keeps a plausible worst-case pile-up inside the headroom the limiter expects', () => {
    const { ctx, engine } = engineOn();
    const names = ['move', 'blocked', 'mine', 'use', 'sync', 'spawn', 'die', 'objective'] as const;
    names.forEach((name, index) => play(engine, name, 0.01 + index * 0.002, index));
    expect(analyse(ctx.render(1), ctx.sampleRate).peak).toBeLessThan(1);
  });
});
