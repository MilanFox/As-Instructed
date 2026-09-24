import { describe, expect, test } from 'vitest';
import type { DebugView } from '../useWorkspace.ts';
import { describeDebug } from '../useWorkspace.ts';

function view(patch: Partial<DebugView> = {}): DebugView {
  return {
    index: 1,
    total: 697,
    kind: 'move',
    origin: null,
    attributed: true,
    note: null,
    ...patch,
  };
}

describe('the strip names the line, and never guesses one', () => {
  test('an attributed event names its file and line', () => {
    expect(describeDebug(view({ origin: { file: 'program', line: 12 } }))).toBe(
      'event 2 of 697 · move · program line 12',
    );
  });

  test('a line in the subroutines file is named as that file, not as the program', () => {
    expect(describeDebug(view({ origin: { file: 'lib', line: 4 } }))).toBe(
      'event 2 of 697 · move · lib.ts line 4',
    );
  });
});

describe('three different reasons for having no line read as three different sentences', () => {
  test('a run that recorded no attribution blames the run', () => {
    const text = describeDebug(view({ attributed: false }));

    expect(text).toContain('run Debug to see lines');
    expect(text).not.toContain('merged');
  });

  test('a coalesced sense call says there is more than one line, not none', () => {
    const text = describeDebug(view({ kind: 'sense' }));

    expect(text).toContain('no single line');
    expect(text).not.toContain('run Debug');
  });

  test('an event the engine raised says the engine raised it', () => {
    const text = describeDebug(view({ kind: 'objective' }));

    expect(text).toContain('game event');
    expect(text).not.toContain('run Debug');
    expect(text).not.toContain('merged');
  });

  test('the three are not interchangeable', () => {
    const reasons = new Set([
      describeDebug(view({ attributed: false })),
      describeDebug(view({ kind: 'sense' })),
      describeDebug(view({ kind: 'objective' })),
    ]);

    expect(reasons.size).toBe(3);
  });
});

describe('the event counter cannot be read as the tick counter beside it', () => {
  test('it counts in words where the tick readout counts in a padded fraction', () => {
    const text = describeDebug(view({ origin: { file: 'program', line: 12 } }));

    expect(text).toContain('event 2 of 697');
    expect(text).not.toMatch(/\d\/\d/);
  });
});

describe('the empty states say which emptiness it is', () => {
  test('a trace with no events at all', () => {
    expect(describeDebug(view({ total: 0, index: null }))).toBe('no events recorded');
  });

  test('a tick that sits before the first event', () => {
    expect(describeDebug(view({ index: null }))).toBe('before the first of 697 events');
  });

  test('a note from a refused jump stands in front of everything else', () => {
    expect(describeDebug(view({ note: 'No event came from program line 42.' }))).toBe(
      'No event came from program line 42.',
    );
  });
});
