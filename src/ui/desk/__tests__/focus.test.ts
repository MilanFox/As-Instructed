import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Focus from '../focus.ts';
import { FOCUS_KEY } from '../focus.ts';

type FocusModule = typeof Focus;

interface FakeStorage {
  getItem: () => string | null;
  setItem: (key: string, value: string) => void;
  written: string[];
}

function fakeStorage(initial?: string): FakeStorage {
  const written: string[] = [];
  let held: string | null = initial ?? null;
  return {
    getItem: () => held,
    setItem: (_key, value) => {
      held = value;
      written.push(value);
    },
    written,
  };
}

async function load(storage: unknown): Promise<FocusModule> {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  return import('../focus.ts');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the FOCUS switch', () => {
  it('rests in the desk composition', async () => {
    const focus = await load(fakeStorage());
    expect(focus.deskFocus()).toBe(false);
  });

  it('comes back where the player left it', async () => {
    const focus = await load(fakeStorage('on'));
    expect(focus.deskFocus()).toBe(true);
  });

  it('reads anything that is not the stored word as off', async () => {
    const focus = await load(fakeStorage('PROGRAM'));
    expect(focus.deskFocus()).toBe(false);
  });

  it('throws both ways and writes each position down', async () => {
    const storage = fakeStorage();
    const focus = await load(storage);

    expect(focus.toggleDeskFocus()).toBe(true);
    expect(focus.deskFocus()).toBe(true);
    expect(focus.toggleDeskFocus()).toBe(false);
    expect(focus.deskFocus()).toBe(false);
    expect(storage.written).toEqual(['on', 'off']);
  });

  it('writes nothing for a set that changes nothing', async () => {
    const storage = fakeStorage();
    const focus = await load(storage);

    focus.setDeskFocus(false);
    expect(storage.written).toEqual([]);
  });

  it('still switches when localStorage throws on the read and on the write', async () => {
    const focus = await load({
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('private mode');
      },
    });

    expect(focus.deskFocus()).toBe(false);
    expect(focus.toggleDeskFocus()).toBe(true);
    expect(focus.deskFocus()).toBe(true);
  });

  it('still switches when there is no localStorage at all', async () => {
    const focus = await load(undefined);
    expect(focus.deskFocus()).toBe(false);
    expect(focus.toggleDeskFocus()).toBe(true);
  });

  it('keeps its own key out of the campaign save', () => {
    expect(FOCUS_KEY).toBe('bootstrap.deskFocus');
  });
});
