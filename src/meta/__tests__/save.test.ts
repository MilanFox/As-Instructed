import { describe, expect, test } from 'vitest';
import { Medal } from '../../engine/index.ts';
import {
  LIBRARY_SAVE_KEY,
  LIBRARY_SAVE_VERSION,
  MAX_REVISIONS,
  emptyLibrary,
  lastKnownGoodRevision,
  loadLibrary,
  mergeLibrary,
  migrateLibrary,
  parseLibrary,
  recordRevision,
  revisionOf,
  writeLibrary,
} from '../save.ts';
import {
  COMPLETIONS_PER_DISCREPANCY,
  MIN_CLOSED_BEFORE_FIRST,
  offScheduleSeeds,
  patchDiscrepancy,
  pickCandidate,
  shouldProbe,
  withDiscrepancy,
} from '../discrepancy.ts';
import type { LibraryStorage } from '../save.ts';

/**
 * The one rule this file exists to enforce: **no read path may discard the player's source.**
 * Everything else in the save is derived data that can be recomputed; `lib.ts` cannot.
 */

function memory(initial: Record<string, string> = {}): LibraryStorage & { data: typeof initial } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('migration', () => {
  test('an empty save is the current version', () => {
    expect(migrateLibrary(undefined).version).toBe(LIBRARY_SAVE_VERSION);
    expect(migrateLibrary(null).source.length).toBeGreaterThan(0);
  });

  test('a bare string is rescued as the library source', () => {
    const save = migrateLibrary('export function pathTo() {}');
    expect(save.source).toBe('export function pathTo() {}');
    expect(save.unlocked).toBe(true);
  });

  test('an unversioned object keeps its source and its revisions', () => {
    const save = migrateLibrary({
      source: 'export const a = 1;',
      revisions: [{ source: 'export const a = 0;', at: 5, reason: 'edit' }],
    });
    expect(save.source).toBe('export const a = 1;');
    expect(save.revisions).toHaveLength(1);
    expect(save.revisions[0]?.source).toBe('export const a = 0;');
    expect(save.revisions[0]?.id).toBeTruthy();
  });

  test('a save with no source falls back to the newest revision rather than the starter', () => {
    const save = migrateLibrary({
      revisions: [{ source: 'export const kept = 1;', at: 5, reason: 'edit' }],
    });
    expect(save.source).toBe('export const kept = 1;');
  });

  test('a save from a newer build keeps its writing and drops only derived data', () => {
    const save = migrateLibrary({
      version: LIBRARY_SAVE_VERSION + 5,
      source: 'export const future = 1;',
      revisions: [{ source: 'export const future = 0;', at: 1, reason: 'edit' }],
      somethingUnknown: { nested: true },
    });
    expect(save.version).toBe(LIBRARY_SAVE_VERSION);
    expect(save.source).toBe('export const future = 1;');
    expect(save.revisions).toHaveLength(1);
  });

  test('a revision list of bare strings is still a revision list', () => {
    const save = migrateLibrary({ revisions: ['a', 'b'] });
    expect(save.revisions.map((each) => each.source)).toEqual(['a', 'b']);
  });

  test('junk in the derived fields never takes the source with it', () => {
    const save = migrateLibrary({
      source: 'export const a = 1;',
      profiles: 'not an object',
      cache: 42,
      published: [{ nope: true }, { name: 'pathTo' }],
      discrepancies: 'no',
    });
    expect(save.source).toBe('export const a = 1;');
    expect(save.profiles).toEqual({});
    expect(save.cache).toEqual({});
    expect(save.published.map((each) => each.name)).toEqual(['pathTo']);
  });

  test('a library with code in it is unlocked whatever the flag says', () => {
    const save = migrateLibrary({
      unlocked: false,
      revisions: [{ source: 'export const a = 1;', at: 1, reason: 'edit' }],
    });
    expect(save.unlocked).toBe(true);
  });

  test('a profile keeps its measured usage through a migration', () => {
    const save = migrateLibrary({
      profiles: {
        'w4-05': {
          key: 'k',
          passed: true,
          ticks: 100,
          medal: Medal.Silver,
          parTicks: 90,
          usage: { ticks: 12, calls: { pathTo: { calls: 3, ticks: 12 } } },
          imports: ['pathTo'],
          at: 1,
        },
      },
    });
    expect(save.profiles['w4-05']?.usage.calls['pathTo']).toEqual({ calls: 3, ticks: 12 });
  });
});

describe('storage', () => {
  test('a round trip preserves the source', () => {
    const storage = memory();
    const save = { ...emptyLibrary(), source: 'export const a = 1;', unlocked: true };
    writeLibrary(save, storage);
    expect(loadLibrary(storage).source).toBe('export const a = 1;');
  });

  test('a stored value that is not JSON is treated as the source itself', () => {
    const storage = memory({ [LIBRARY_SAVE_KEY]: 'export function pathTo() {}' });
    expect(loadLibrary(storage).source).toBe('export function pathTo() {}');
  });

  test('a storage that throws never loses the in-memory save', () => {
    const hostile: LibraryStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(() => writeLibrary(emptyLibrary(), hostile)).not.toThrow();
    expect(loadLibrary(hostile).source).toBe(emptyLibrary().source);
  });

  test('parsing an exported fragment gives the same save back', () => {
    const save = { ...emptyLibrary(), source: 'export const a = 1;' };
    expect(parseLibrary(JSON.stringify(save)).source).toBe('export const a = 1;');
  });
});

describe('revisions', () => {
  test('an identical source does not make a second revision', () => {
    const first = recordRevision(emptyLibrary(), revisionOf('a', 'edit'));
    const second = recordRevision(first, revisionOf('a', 'edit'));
    expect(second.revisions).toHaveLength(1);
  });

  test('the list is capped by dropping the oldest, never the newest', () => {
    let save = emptyLibrary();
    for (let i = 0; i < MAX_REVISIONS + 5; i++) {
      save = recordRevision(save, revisionOf(`export const a = ${i};`, 'edit'));
    }
    expect(save.revisions).toHaveLength(MAX_REVISIONS);
    expect(save.revisions[save.revisions.length - 1]?.source).toBe(
      `export const a = ${MAX_REVISIONS + 4};`,
    );
  });

  test('the revert target is found by id', () => {
    const revision = revisionOf('export const a = 1;', 'edit');
    const save = { ...recordRevision(emptyLibrary(), revision), lastKnownGood: revision.id };
    expect(lastKnownGoodRevision(save)?.source).toBe('export const a = 1;');
    expect(lastKnownGoodRevision(emptyLibrary())).toBeUndefined();
  });
});

describe('merging an imported save', () => {
  test('incoming source wins but no revision from either side is lost', () => {
    const mine = recordRevision(emptyLibrary(), revisionOf('export const mine = 1;', 'edit'));
    const theirs = recordRevision(emptyLibrary(), revisionOf('export const theirs = 1;', 'edit'));
    const merged = mergeLibrary(mine, theirs);

    expect(merged.source).toBe('export const theirs = 1;');
    expect(merged.revisions.map((each) => each.source).sort()).toEqual([
      'export const mine = 1;',
      'export const theirs = 1;',
    ]);
  });

  test('the unlock survives a merge with a locked save', () => {
    const unlocked = { ...emptyLibrary(), unlocked: true, briefed: true };
    const merged = mergeLibrary(unlocked, emptyLibrary());
    expect(merged.unlocked).toBe(true);
    expect(merged.briefed).toBe(true);
  });
});

describe('discrepancies', () => {
  test('the probe seed is outside the work order own schedule', () => {
    const seeds = offScheduleSeeds([1, 2, 3], 'w4-05', 0);
    expect(seeds.every((seed) => ![1, 2, 3].includes(seed))).toBe(true);
    expect(offScheduleSeeds([1, 2, 3], 'w4-05', 0)).toEqual(seeds);
  });

  test('nothing is raised while the player is early, muted, or already has one open', () => {
    const save = { ...emptyLibrary(), unlocked: true };
    expect(shouldProbe(save, 2)).toBe(false);
    expect(shouldProbe(save, 20)).toBe(true);
    expect(shouldProbe({ ...save, discrepanciesMuted: true }, 20)).toBe(false);

    const raised = withDiscrepancy(save, {
      id: 'D1',
      levelId: 'w4-05',
      seed: 100,
      raisedAt: 1,
    });
    expect(shouldProbe(raised, 20)).toBe(false);

    /* Closing it re-opens the door, but only once enough has happened since. */
    const closed = patchDiscrepancy(raised, 'D1', { closed: true });
    expect(shouldProbe(closed, MIN_CLOSED_BEFORE_FIRST + COMPLETIONS_PER_DISCREPANCY - 1)).toBe(
      false,
    );
    expect(shouldProbe(closed, 20)).toBe(true);
  });

  test('only a work order that reads the Repository is ever probed', () => {
    const save = { ...emptyLibrary(), unlocked: true };
    const base = { seeds: [1], parTicks: 10, medal: Medal.Gold, ticks: 5 };
    expect(
      pickCandidate(save, [
        { ...base, levelId: 'w1-01', code: 'move();', dependsOnLibrary: false },
      ]),
    ).toBeUndefined();
    expect(
      pickCandidate(save, [
        { ...base, levelId: 'w1-01', code: 'move();', dependsOnLibrary: false },
        { ...base, levelId: 'w4-05', code: "import { a } from 'lib';", dependsOnLibrary: true },
      ])?.levelId,
    ).toBe('w4-05');
  });
});
