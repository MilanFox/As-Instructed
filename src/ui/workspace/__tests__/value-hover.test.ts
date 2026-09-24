import { describe, expect, test } from 'vitest';
import type { ApiCall } from '../../../engine/index.ts';
import { ghostText, lineHover, pastCallLog, seekTarget } from '../value-hover.ts';

function call(patch: Partial<ApiCall>): ApiCall {
  return {
    seq: 0,
    name: 'move',
    botId: 0,
    t: 0,
    until: 1,
    args: [1],
    outcome: { returned: true },
    events: [],
    eventIndex: 0,
    ...patch,
  };
}

const link = (made: ApiCall): string => `command:seek?${String(made.seq)}`;

describe('the stepped line carries its call as ghost text', () => {
  test('one call reads as the call line', () => {
    expect(ghostText([call({})], false)).toBe('move(Dir.East) → true');
  });

  test('coalesced calls show the first and a count', () => {
    expect(ghostText([call({}), call({ seq: 1 }), call({ seq: 2 })], false)).toBe(
      'move(Dir.East) → true +2',
    );
  });

  test('a long call is cut to the ghost width', () => {
    const text = ghostText([call({ name: 'print', args: Array(12).fill('abcd') })], false);
    expect(text?.length).toBe(48);
    expect(text?.endsWith('…')).toBe(true);
  });

  test('past the log cap the line says so; before it there is nothing', () => {
    expect(ghostText([], true)).toBe('not recorded — call log full');
    expect(ghostText([], false)).toBeNull();
  });
});

describe('the log cap is only blamed past the last recorded call', () => {
  const log = { calls: [call({ events: [3, 4], eventIndex: 3 })], dropped: 5 };

  test('an event after every recorded call is unrecorded', () => {
    expect(pastCallLog(log, 5)).toBe(true);
    expect(pastCallLog(log, 4)).toBe(false);
  });

  test('a log that dropped nothing never is', () => {
    expect(pastCallLog({ ...log, dropped: 0 }, 9)).toBe(false);
    expect(pastCallLog(undefined, 9)).toBe(false);
  });
});

describe('a row seeks to the event its call made', () => {
  test('the first touched event, else the event after the call', () => {
    expect(seekTarget(call({ events: [7, 8], eventIndex: 7 }), 10)).toBe(7);
    expect(seekTarget(call({ eventIndex: 4 }), 10)).toBe(4);
  });

  test('an index past the trace has no event to land on', () => {
    expect(seekTarget(call({ eventIndex: 10 }), 10)).toBeNull();
  });
});

describe('hovering a line lists every call from it', () => {
  test('a count, then one linked row per call with its tick', () => {
    const hover = lineHover(
      [call({ t: 3 }), call({ seq: 1, t: 12, outcome: { returned: false } })],
      false,
      link,
    );
    expect(hover).toBe(
      [
        '**2 calls from this line**',
        '[t3\u00a0\u00a0\u00a0move\\(Dir\\.East\\) → true](command:seek?0 "go to this call")',
        '[t12\u00a0\u00a0move\\(Dir\\.East\\) → false](command:seek?1 "go to this call")',
      ].join('  \n'),
    );
  });

  test('one call is singular', () => {
    expect(lineHover([call({})], false, link)?.split('  \n')[0]).toBe('**1 call from this line**');
  });

  test('twenty rows, then how many more', () => {
    const calls = Array.from({ length: 50 }, (_, seq) => call({ seq, t: seq }));
    const rows = lineHover(calls, false, link)?.split('  \n') ?? [];
    expect(rows).toHaveLength(22);
    expect(rows[21]).toBe('… 30 more');
  });

  test('snapshot text cannot become markdown', () => {
    const hover = lineHover([call({ name: 'print', args: ['[a](b) *c*'] })], false, link);
    expect(hover).toContain('print\\("\\[a\\]\\(b\\) \\*c\\*"\\)');
  });

  test('a line past the cap says its later calls went unrecorded', () => {
    expect(lineHover([], true, link)).toBe('_not recorded — call log full_');
    expect(lineHover([call({})], true, link)?.endsWith('  \n_not recorded — call log full_')).toBe(
      true,
    );
    expect(lineHover([], false, link)).toBeNull();
  });
});
