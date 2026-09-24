import { describe, expect, test } from 'vitest';
import type { ApiCall, Snapshot } from '../../../engine/index.ts';
import { callLine, unrecordedNote } from '../call-text.ts';

function call(patch: Partial<ApiCall>): ApiCall {
  return {
    seq: 0,
    name: 'move',
    botId: 0,
    t: 0,
    until: 1,
    args: [],
    outcome: { returned: { $: 'undefined' } },
    events: [],
    eventIndex: 0,
    ...patch,
  };
}

describe('a call reads like the line that made it', () => {
  test('a direction is named, and the result follows an arrow', () => {
    expect(callLine(call({ args: [1], outcome: { returned: true } }), 80)).toBe(
      'move(Dir.East) → true',
    );
  });

  test('a call that returns nothing shows no arrow', () => {
    expect(callLine(call({ name: 'print', args: ['hi', 3] }), 80)).toBe('print("hi", 3)');
  });

  test('a throw names the error', () => {
    const threw = { $: 'error', name: 'RangeError', message: 'bad tile' } as const;
    expect(callLine(call({ args: [9], outcome: { threw } }), 80)).toBe(
      'move(9) → threw RangeError',
    );
  });

  test('objects are previewed compactly', () => {
    const returned: Snapshot = {
      $: 'object',
      ctor: null,
      entries: [
        ['x', 1],
        ['y', 2],
      ],
      omitted: 0,
    };
    expect(callLine(call({ name: 'pos', outcome: { returned } }), 80)).toBe('pos() → {x: 1, y: 2}');
  });

  test('a long line is cut to the width it is given', () => {
    const line = callLine(call({ args: [1], outcome: { returned: true } }), 10);
    expect(line).toBe('move(Dir.…');
    expect(line.length).toBe(10);
  });
});

test('the cap note counts what was not recorded', () => {
  expect(unrecordedNote(312)).toBe('log full · 312 unrecorded');
});
