import { beforeEach, describe, expect, it } from 'vitest';

import { GameAudio, biomeForWorld } from '../index.ts';
import {
  AUDIO_SETTINGS_KEY,
  DEFAULT_SETTINGS,
  busGain,
  loadSettings,
  masterGain,
  normalizeSettings,
  saveSettings,
} from '../settings.ts';
import { MiniContext, analyse } from './offline.ts';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

function useStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage as unknown as Storage;
  return storage;
}

describe('settings', () => {
  beforeEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('survives anything at all in storage', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ master: 'loud' }).master).toBe(DEFAULT_SETTINGS.master);
    expect(normalizeSettings({ master: 12 }).master).toBe(1);
    expect(normalizeSettings({ master: -3 }).master).toBe(0);
    expect(normalizeSettings({ sfx: Number.NaN }).sfx).toBe(DEFAULT_SETTINGS.sfx);
    expect(normalizeSettings({ enabled: 'yes' }).enabled).toBe(DEFAULT_SETTINGS.enabled);
  });

  it('round-trips through localStorage and tolerates not having one', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();

    const storage = useStorage();
    saveSettings({ ...DEFAULT_SETTINGS, master: 0.25, ambienceEnabled: true });
    expect(loadSettings().master).toBe(0.25);
    expect(loadSettings().ambienceEnabled).toBe(true);

    storage.setItem(AUDIO_SETTINGS_KEY, '{ not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps ambience silent until it is asked for', () => {
    expect(DEFAULT_SETTINGS.ambienceEnabled).toBe(false);
    expect(busGain(DEFAULT_SETTINGS, 'ambience')).toBe(0);
    expect(busGain({ ...DEFAULT_SETTINGS, ambienceEnabled: true }, 'ambience')).toBeGreaterThan(0);
    expect(masterGain({ ...DEFAULT_SETTINGS, muted: true })).toBe(0);
    expect(masterGain({ ...DEFAULT_SETTINGS, enabled: false })).toBe(0);
  });
});

describe('the mounted surface', () => {
  beforeEach(() => {
    useStorage();
  });

  function mounted(settings = {}): { audio: GameAudio; ctx: MiniContext } {
    const ctx = new MiniContext(44100);
    const audio = new GameAudio({
      context: ctx.asContext(),
      persist: false,
      settings: { master: 1, sfx: 1, ui: 1, ...settings },
    });
    return { audio, ctx };
  }

  it('does nothing whatsoever while audio is off', () => {
    const { audio, ctx } = mounted({ enabled: false });
    audio.ui('runStart');
    audio.outcome({ passed: true, medal: 'gold' });
    audio.playback(4, true);
    expect(audio.stats.voices).toBe(0);
    expect(audio.running).toBe(false);
    expect(analyse(ctx.render(1), ctx.sampleRate).peak).toBe(0);
  });

  it('comes up as soon as it is switched on', () => {
    const { audio, ctx } = mounted({ enabled: false });
    audio.update({ enabled: true });
    audio.ui('runStart');
    expect(audio.stats.voices).toBe(1);
    expect(analyse(ctx.render(0.5), ctx.sampleRate).peak).toBeGreaterThan(0.01);
  });

  it('drives from a playback source shaped like the renderer', () => {
    const { audio } = mounted();
    const listeners = new Set<(tick: number, playing: boolean) => void>();
    const source = {
      onTick(listener: (tick: number, playing: boolean) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const detach = audio.attach(source);
    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener(0, true);
    detach();
    expect(listeners.size).toBe(0);
  });

  it('maps worlds onto biomes the way the renderer does', () => {
    expect(biomeForWorld(1)).toBe('hangar');
    expect(biomeForWorld(7)).toBe('swarm');
    expect(biomeForWorld(8)).toBe('finale');
    expect(biomeForWorld(0)).toBe('hangar');
    expect(biomeForWorld(99)).toBe('finale');
  });

  it('starts a drone bed only when ambience is switched on', () => {
    const { audio, ctx } = mounted({ ambienceEnabled: false, ambience: 1 });
    audio.setWorld(4);
    expect(analyse(ctx.render(6), ctx.sampleRate).peak).toBe(0);

    const loud = mounted({ ambienceEnabled: true, ambience: 1 });
    loud.audio.setWorld(4);
    const bed = analyse(loud.ctx.render(6), loud.ctx.sampleRate);

    expect(bed.rms).toBeGreaterThan(1e-4);
    expect(bed.peak).toBeLessThan(0.12);
  });

  it('tears the context down when audio is switched off', () => {
    const { audio } = mounted();
    audio.ui('button');
    expect(audio.stats.voices).toBe(1);
    audio.update({ enabled: false });
    expect(audio.stats.voices).toBe(0);
    audio.ui('button');
    expect(audio.stats.voices).toBe(0);
  });

  it('never throws when there is no browser at all', () => {
    const audio = new GameAudio({ persist: false });
    expect(() => {
      audio.ui('runStart');
      audio.setWorld(3);
      audio.setTrace(null);
      audio.setSpeed(64);
      audio.playback(12, true);
      audio.outcome({ passed: false });
      audio.cue('move');
      audio.dispose();
    }).not.toThrow();
    expect(audio.running).toBe(false);
  });
});
