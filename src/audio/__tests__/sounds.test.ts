import { describe, expect, it } from 'vitest';

import { AudioEngine } from '../engine.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';
import type { AudioSettings } from '../settings.ts';
import { SOUNDS, SOUND_NAMES, play } from '../sounds.ts';
import type { SoundName } from '../sounds.ts';
import { MiniContext, analyse, peakBetween } from './offline.ts';

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
    expect(Array.from(same)).toEqual(Array.from(first));
    expect(energy(other)).not.toBe(energy(first));
  });
});

function energy(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += Math.abs(buffer[i] as number);
  return Math.round(sum * 1e6);
}

describe('the medal figure builds instead of trailing off', () => {
  function loudestAt(name: SoundName): { at: number; peak: number } {
    const { buffer, rate } = renderOne(name);
    const window = Math.round(rate * 0.02);
    let best = 0;
    let bestAt = 0;
    for (let start = 0; start + window < buffer.length; start += window) {
      let peak = 0;
      for (let i = start; i < start + window; i++)
        peak = Math.max(peak, Math.abs(buffer[i] as number));
      if (peak > best) {
        best = peak;
        bestAt = start / rate;
      }
    }
    return { at: bestAt, peak: best };
  }

  it('puts gold’s loudest moment on its last note, not its downbeat', () => {
    const gold = loudestAt('medalGold');
    expect(gold.at).toBeGreaterThan(0.15);
    expect(gold.at).toBeLessThan(0.32);
  });

  it('keeps every tier inside its declared duration with the tail to spare', () => {
    for (const name of ['medalBronze', 'medalSilver', 'medalGold'] as SoundName[]) {
      const { buffer, rate } = renderOne(name);
      const stats = analyse(buffer, rate);
      expect(stats.lastSound).toBeLessThan(SOUNDS[name].duration);
    }
  });

  it('brightens as the tier rises, so the escalation is timbral as well as loud', () => {
    const brightness = (name: SoundName): number => {
      const { buffer, rate } = renderOne(name);
      let crossings = 0;
      let counted = 0;
      for (let i = 1; i < buffer.length; i++) {
        const a = buffer[i - 1] as number;
        const b = buffer[i] as number;
        if (Math.abs(b) < 1e-4) continue;
        counted++;
        if (a < 0 !== b < 0) crossings++;
      }
      return counted > 0 ? (crossings / counted) * rate : 0;
    };
    expect(brightness('medalGold')).toBeGreaterThan(brightness('medalSilver'));
    expect(brightness('medalSilver')).toBeGreaterThan(brightness('medalBronze'));
  });
});

describe('commendations land as one ascending phrase', () => {
  function pitch(seed: number): number {
    const { buffer, rate } = renderOne('commend', seed);
    let crossings = 0;
    let counted = 0;
    for (let i = 1; i < buffer.length; i++) {
      const a = buffer[i - 1] as number;
      const b = buffer[i] as number;
      if (Math.abs(b) < 2e-3) continue;
      counted++;
      if (a < 0 !== b < 0) crossings++;
    }
    return counted > 0 ? (crossings / counted) * rate * 0.5 : 0;
  }

  it('climbs one rung per commendation', () => {
    const steps = [0, 1, 2, 3].map(pitch);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1] as number);
    }
  });

  it('holds at the top rather than climbing out of the audible range', () => {
    expect(pitch(14)).toBeCloseTo(pitch(4) as number, -2);
    expect(pitch(14)).toBeLessThan(4000);
  });

  it('stays smaller than the medal it is decorating', () => {
    const peak = (name: SoundName, seed = 7): number =>
      analyse(renderOne(name, seed).buffer, 44100).peak;
    expect(peak('commend', 4)).toBeLessThan(peak('medalBronze'));
  });
});
