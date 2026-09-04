import { describe, expect, it } from 'vitest';

import { AudioEngine } from '../engine.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';
import type { AudioSettings } from '../settings.ts';
import { SOUNDS, SOUND_NAMES, play } from '../sounds.ts';
import type { SoundName } from '../sounds.ts';
import { MiniContext, analyse, peakBetween } from './offline.ts';

/** Every bus at unity, so an assertion is about the sound and not about the mixer. */
const UNITY: AudioSettings = {
  ...DEFAULT_SETTINGS,
  master: 1,
  sfx: 1,
  ui: 1,
  ambience: 1,
};

function renderOne(name: SoundName, seed = 7, tail = 0.25): { buffer: Float32Array; rate: number } {
  const ctx = new MiniContext(44100);
  const engine = new AudioEngine(ctx.asContext(), UNITY);
  play(engine, name, 0.01, seed);
  return { buffer: ctx.render(SOUNDS[name].duration + tail + 0.01), rate: ctx.sampleRate };
}

describe('the catalogue', () => {
  it.each(SOUND_NAMES)('%s renders audible, unclipped, DC-free audio', (name) => {
    const { buffer, rate } = renderOne(name);
    const stats = analyse(buffer, rate);

    // Calibrated band: nothing is so quiet it is lost under the game, nothing is so loud it
    // eats headroom the mix needs for a medal landing on top of an action.
    expect(stats.peak).toBeGreaterThan(0.02);
    expect(stats.peak).toBeLessThan(0.5);
    expect(Math.abs(stats.dc)).toBeLessThan(5e-4);
    expect(stats.rms).toBeGreaterThan(2e-4);
  });

  it.each(SOUND_NAMES)(
    '%s starts promptly and decays to silence inside its declared duration',
    (name) => {
      const spec = SOUNDS[name];
      const { buffer, rate } = renderOne(name);
      const stats = analyse(buffer, rate);

      expect(stats.firstSound).toBeLessThan(0.05);
      expect(stats.lastSound).toBeLessThanOrEqual(spec.duration + 0.01);
      // Nothing may be left ringing once the declared duration has passed.
      expect(peakBetween(buffer, rate, spec.duration + 0.02, spec.duration + 0.25)).toBeLessThan(
        1e-4,
      );
    },
  );

  it('keeps action sounds short enough to survive being heard thousands of times', () => {
    for (const name of SOUND_NAMES) {
      const spec = SOUNDS[name];
      if (spec.priority >= 5) continue;
      expect(spec.duration).toBeLessThanOrEqual(0.4);
    }
  });

  it('escalates the medal family without letting gold outstay its welcome', () => {
    expect(SOUNDS.medalBronze.duration).toBeLessThan(SOUNDS.medalSilver.duration);
    expect(SOUNDS.medalSilver.duration).toBeLessThan(SOUNDS.medalGold.duration);
    expect(SOUNDS.medalGold.duration).toBeLessThan(1);

    const bronze = analyse(renderOne('medalBronze').buffer, 44100);
    const silver = analyse(renderOne('medalSilver').buffer, 44100);
    const gold = analyse(renderOne('medalGold').buffer, 44100);
    // Same family, three sizes: each tier is longer and carries more energy than the last.
    expect(silver.lastSound).toBeGreaterThan(bronze.lastSound);
    expect(gold.lastSound).toBeGreaterThan(silver.lastSound);
    expect(gold.rms).toBeGreaterThan(bronze.rms);
  });

  it('orders the mix so importance and loudness agree', () => {
    const peak = (name: SoundName): number => analyse(renderOne(name).buffer, 44100).peak;
    expect(peak('medalGold')).toBeGreaterThan(peak('medalSilver'));
    expect(peak('medalSilver')).toBeGreaterThan(peak('medalBronze'));
    expect(peak('medalBronze')).toBeGreaterThan(peak('objective'));
    expect(peak('blocked')).toBeGreaterThan(peak('move'));
    expect(peak('move')).toBeGreaterThan(peak('scrub'));
  });

  it('makes a blocked move plainly louder and darker than a successful one', () => {
    const move = analyse(renderOne('move').buffer, 44100);
    const blocked = analyse(renderOne('blocked').buffer, 44100);
    expect(blocked.rms).toBeGreaterThan(move.rms * 2);
    expect(SOUNDS.blocked.duration).toBeGreaterThan(SOUNDS.move.duration * 1.5);
  });

  it('does not clip when the whole end-of-run stack lands at once', () => {
    const ctx = new MiniContext(44100);
    const engine = new AudioEngine(ctx.asContext(), UNITY);
    play(engine, 'objective', 0.01, 1);
    play(engine, 'passed', 0.02, 2);
    play(engine, 'medalGold', 0.05, 3);
    play(engine, 'blocked', 0.05, 4);
    play(engine, 'move', 0.06, 5);
    play(engine, 'use', 0.06, 6);
    const stats = analyse(ctx.render(1.4), ctx.sampleRate);
    expect(stats.peak).toBeLessThanOrEqual(1);
  });

  it('repeats exactly for one seed and differs for another', () => {
    const first = renderOne('move', 11).buffer;
    const same = renderOne('move', 11).buffer;
    const other = renderOne('move', 12).buffer;
    // Scrubbing back over a tick must produce the identical sound; two different moves must not.
    expect(Array.from(same)).toEqual(Array.from(first));
    expect(energy(other)).not.toBe(energy(first));
  });
});

function energy(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += Math.abs(buffer[i] as number);
  return Math.round(sum * 1e6);
}
