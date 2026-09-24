import { describe, expect, test } from 'vitest';
import { Terrain } from '../../engine/index.ts';
import type { TileReadout } from '../../render/index.ts';
import { inspectTargetAt, isClick, readoutLine } from '../feed/renderer.ts';

function readout(overrides: Partial<TileReadout> = {}): TileReadout {
  return {
    at: { x: 4, y: 7 },
    terrain: Terrain.Floor,
    walkable: true,
    growth: null,
    maxGrowth: null,
    sproutsIn: 0,
    ripeFor: 0,
    crop: null,
    items: [],
    botId: null,
    botName: null,
    machine: null,
    buffer: null,
    mark: null,
    visits: 0,
    label: '4,7 floor',
    ...overrides,
  };
}

describe('a board click picks what is on top', () => {
  test('a bot outranks the machine and the tile under it', () => {
    const target = inspectTargetAt(
      readout({ botId: 2, botName: 'RIG-02', machine: { id: 'm1', kind: 'press', state: 'idle' } }),
    );
    expect(target).toEqual({ kind: 'bot', id: 2 });
  });

  test('a machine outranks its tile', () => {
    const target = inspectTargetAt(
      readout({ machine: { id: 'm1', kind: 'press', state: 'idle' } }),
    );
    expect(target).toEqual({ kind: 'machine', id: 'm1' });
  });

  test('an empty cell is the tile', () => {
    expect(inspectTargetAt(readout())).toEqual({ kind: 'tile', at: { x: 4, y: 7 } });
  });

  test('off the board picks nothing', () => {
    expect(inspectTargetAt(null)).toBeNull();
  });
});

describe('a click is a press that barely moved', () => {
  test('under 4px of travel is a click', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(true);
  });

  test('4px or more is a pan', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(false);
    expect(isClick({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(false);
  });
});

describe('the hover readout', () => {
  test('offers the click only when the board is inspectable', () => {
    expect(readoutLine(readout(), true)).toBe('4,7 floor · click to inspect');
    expect(readoutLine(readout(), false)).toBe('4,7 floor');
    expect(readoutLine(null, true)).toBe('');
  });
});
