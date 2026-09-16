import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';

const written = new Map<string, string>();

(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => written.get(key) ?? null,
  setItem: (key: string, value: string) => {
    written.set(key, String(value));
  },
  removeItem: (key: string) => {
    written.delete(key);
  },
  clear: () => {
    written.clear();
  },
};

const { flyoutOpensOnArrival, rememberFlyoutOpen, storedFlyoutOpen } = await import(
  '../flyoutMemory.ts'
);

beforeEach(() => {
  written.clear();
});

describe('the first visit is a guess and every visit after it is an answer', () => {
  test('a level nobody has touched opens to the workbench', () => {
    expect(flyoutOpensOnArrival('w1-01', false, false)).toBe(true);
  });

  test('a trace to watch keeps it shut, still only on the first visit', () => {
    expect(flyoutOpensOnArrival('w1-01', true, false)).toBe(false);
  });

  test('compact never opens it unasked', () => {
    expect(flyoutOpensOnArrival('w1-01', false, true)).toBe(false);
  });

  test('a shut flyout stays shut on the way back, trace or no trace', () => {
    rememberFlyoutOpen('w1-01', false);

    expect(flyoutOpensOnArrival('w1-01', false, false)).toBe(false);
  });

  test('an open flyout is still open on the way back, trace and all', () => {
    rememberFlyoutOpen('w1-01', true);

    expect(flyoutOpensOnArrival('w1-01', true, false)).toBe(true);
  });

  test('the answer belongs to the level that was given it', () => {
    rememberFlyoutOpen('w1-01', false);

    expect(flyoutOpensOnArrival('w1-02', false, false)).toBe(true);
  });

  test('the levels menu, which is no level, is asked nothing and told nothing', () => {
    rememberFlyoutOpen(null, false);

    expect([storedFlyoutOpen(null), written.size]).toEqual([null, 0]);
  });

  test('a storage slot someone else scribbled in reads as no answer', () => {
    written.set('as-instructed.flyout-open', '{"w1-01":"yes"}');

    expect(storedFlyoutOpen('w1-01')).toBeNull();
  });

  test('unparseable storage reads as no answer rather than throwing', () => {
    written.set('as-instructed.flyout-open', 'not json');

    expect(storedFlyoutOpen('w1-01')).toBeNull();
  });
});

const WORKSPACE = readFileSync(new URL('../Workspace.tsx', import.meta.url), 'utf8');

const WIRED = [
  ['the arrival rule decides the opening state', /useState\(\(\) =>\s*flyoutOpensOnArrival\(/],
  ['the flap records whichever way it went', /rememberFlyoutOpen\(levelId, !was\)/],
  ['a deliberate open is recorded', /rememberFlyoutOpen\(levelId, true\)/],
  ['escape records the dismissal', /rememberFlyoutOpen\(levelId, false\)/],
  [
    'the next level gets the rule rather than the last level leftovers',
    /arrivedAt\.current = levelId;\s*setOpen\(flyoutOpensOnArrival\(/,
  ],
] as const;

describe('the screen asks the memory and answers back to it', () => {
  for (const [what, pattern] of WIRED) {
    test(what, () => {
      expect([what, pattern.test(WORKSPACE)]).toEqual([what, true]);
    });
  }

  // Dispatch and a run in flight shut the workbench so the board is visible. Recording those
  // would leave every level the player has ever run remembered as shut.
  test('a run shutting the workbench is not an answer', () => {
    const runs = /if \(running\) setOpen\(false\);|const dispatch = useCallback[\s\S]{0,160}?\}/g;
    for (const block of WORKSPACE.match(runs) ?? []) {
      expect([block, /rememberFlyoutOpen/.test(block)]).toEqual([block, false]);
    }
  });
});
