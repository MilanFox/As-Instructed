import { describe, expect, test } from 'vitest';
import { Medal } from '../../engine/index.ts';
import type {
  MetaRunOutcome,
  MetaRunRequest,
  MetaRunner,
  RegressionTarget,
} from '../regression.ts';
import {
  applySuite,
  keyFor,
  needsAttention,
  runSuite,
  summarise,
  withCachedRun,
} from '../regression.ts';
import { emptyLibrary, MAX_CACHE_ENTRIES } from '../save.ts';
import type { CachedRun, LibrarySave } from '../types.ts';

/**
 * The regression suite is the part of the feature that can hurt a player, so these tests are about
 * the two guarantees rather than about the plumbing: an edit that breaks something is *reported*,
 * and a worse result never moves a medal on its own.
 */

/** A runner with an answer per work order, which also counts how often it was asked. */
function fakeRunner(
  answers: Record<string, MetaRunOutcome>,
): MetaRunner & { calls: MetaRunRequest[] } {
  const calls: MetaRunRequest[] = [];
  return {
    calls,
    run(request: MetaRunRequest): Promise<MetaRunOutcome> {
      calls.push(request);
      return Promise.resolve(
        answers[request.levelId] ?? { passed: true, ticks: 10, usage: { ticks: 0, calls: {} } },
      );
    },
  };
}

const LIBRARY_LEVEL = `import { pathTo } from 'lib';\npathTo(1, 2);`;
const PLAIN_LEVEL = `move();`;

function target(overrides: Partial<RegressionTarget> = {}): RegressionTarget {
  return {
    levelId: 'w4-05',
    code: LIBRARY_LEVEL,
    seeds: [1, 2, 3],
    parTicks: 100,
    medal: Medal.Gold,
    ticks: 90,
    ...overrides,
  };
}

function options(runner: MetaRunner, save: LibrarySave) {
  return {
    runner,
    librarySource: 'export function pathTo() {}',
    libraryHash: 'lib-2',
    revisionId: 'lib-2',
    dependsOnLibrary: (each: RegressionTarget) => each.code.includes("from 'lib'"),
    save,
  };
}

describe('detecting a regression', () => {
  test('a dependent work order that stops closing is reported as broken', async () => {
    const runner = fakeRunner({
      'w4-05': {
        passed: false,
        ticks: 0,
        failure: { message: 'pathTo returned undefined', file: 'lib', line: 12 },
      },
    });
    const save = emptyLibrary();
    const result = await runSuite([target()], save, options(runner, save));

    expect(result.summary.broken).toBe(1);
    expect(result.run.entries[0]?.state).toBe('broken');
    expect(result.run.entries[0]?.failure?.file).toBe('lib');
    expect(result.run.entries[0]?.failure?.line).toBe(12);
    expect(needsAttention(result.summary)).toBe(true);
  });

  test('a slower run is degraded, a faster one is improved', async () => {
    const save = emptyLibrary();
    const slower = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: true, ticks: 120 } }), save),
    );
    expect(slower.run.entries[0]?.state).toBe('degraded');
    expect(slower.run.entries[0]?.afterMedal).toBe(Medal.Silver);

    const faster = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: true, ticks: 70 } }), save),
    );
    expect(faster.run.entries[0]?.state).toBe('improved');
    expect(faster.run.entries[0]?.note).toContain('20 ticks');
  });

  test('an unchanged run is nominal and needs no attention', async () => {
    const save = emptyLibrary();
    const result = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: true, ticks: 90 } }), save),
    );
    expect(result.run.entries[0]?.state).toBe('nominal');
    expect(needsAttention(result.summary)).toBe(false);
  });
});

describe('never silently downgrading a medal', () => {
  test('a degraded suite writes profiles and cache but hands back no medals', async () => {
    const save = emptyLibrary();
    const result = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: true, ticks: 120 } }), save),
    );
    const applied = applySuite(save, result, { revisionId: 'lib-2' });

    expect(applied.medals).toEqual([]);
    expect(applied.save.profiles['w4-05']?.ticks).toBe(120);
    expect(applied.save.cache[result.cache[0]?.key ?? '']).toBeDefined();
  });

  test('accepting is the one path that produces a medal change', async () => {
    const save = emptyLibrary();
    const result = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: true, ticks: 120 } }), save),
    );
    const applied = applySuite(save, result, { revisionId: 'lib-2', acceptMedals: true });
    expect(applied.medals).toEqual([{ levelId: 'w4-05', medal: Medal.Silver, ticks: 120 }]);
  });

  test('a revision that broke something never becomes the revert target', async () => {
    const save = emptyLibrary();
    const broken = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: false, ticks: 0 } }), save),
    );
    expect(applySuite(save, broken, { revisionId: 'lib-2' }).save.lastKnownGood).toBeUndefined();

    const clean = await runSuite(
      [target()],
      save,
      options(fakeRunner({ 'w4-05': { passed: true, ticks: 90 } }), save),
    );
    expect(applySuite(save, clean, { revisionId: 'lib-2' }).save.lastKnownGood).toBe('lib-2');
  });
});

describe('the cache', () => {
  test('an unchanged library and source answers from cache without running anything', async () => {
    const first = fakeRunner({ 'w4-05': { passed: true, ticks: 88 } });
    const save = emptyLibrary();
    const one = await runSuite([target()], save, options(first, save));
    expect(first.calls).toHaveLength(1);

    const warmed = applySuite(save, one, { revisionId: 'lib-2' }).save;
    const second = fakeRunner({ 'w4-05': { passed: true, ticks: 999 } });
    const two = await runSuite([target()], warmed, options(second, warmed));

    expect(second.calls).toHaveLength(0);
    expect(two.run.entries[0]?.cached).toBe(true);
    expect(two.run.entries[0]?.afterTicks).toBe(88);
    expect(two.summary.cached).toBe(1);
  });

  test('a work order that imports nothing keeps its key when the library changes', () => {
    const independent = target({ levelId: 'w2-01', code: PLAIN_LEVEL });
    expect(keyFor(independent, 'lib-1', false)).toBe(keyFor(independent, 'lib-2', false));
  });

  test('a work order that imports gets a new key when the library changes', () => {
    expect(keyFor(target(), 'lib-1', true)).not.toBe(keyFor(target(), 'lib-2', true));
  });

  test('an independent work order is not re-run after a library edit', async () => {
    const runner = fakeRunner({ 'w2-01': { passed: true, ticks: 5 } });
    const save = emptyLibrary();
    const independent = target({ levelId: 'w2-01', code: PLAIN_LEVEL, ticks: 5 });

    const first = await runSuite([independent], save, options(runner, save));
    const warmed = applySuite(save, first, { revisionId: 'lib-1' }).save;
    await runSuite([independent], warmed, {
      ...options(runner, warmed),
      libraryHash: 'totally-different',
      revisionId: 'totally-different',
    });

    expect(runner.calls).toHaveLength(1);
  });

  test('the cache drops its oldest entries rather than growing without bound', () => {
    let save = emptyLibrary();
    for (let i = 0; i < MAX_CACHE_ENTRIES + 10; i++) {
      const run: CachedRun = {
        key: `k${i}`,
        levelId: 'w4-05',
        passed: true,
        ticks: i,
        medal: Medal.Gold,
        usage: { ticks: 0, calls: {} },
        at: i,
      };
      save = withCachedRun(save, run);
    }
    expect(Object.keys(save.cache)).toHaveLength(MAX_CACHE_ENTRIES);
    expect(save.cache['k0']).toBeUndefined();
    expect(save.cache[`k${MAX_CACHE_ENTRIES + 9}`]).toBeDefined();
  });
});

describe('running incrementally', () => {
  test('cancelling mid-suite marks the rest skipped instead of abandoning the results', async () => {
    const targets = [
      target({ levelId: 'a', ticks: 10 }),
      target({ levelId: 'b', ticks: 10 }),
      target({ levelId: 'c', ticks: 10 }),
    ];
    const save = emptyLibrary();
    let seen = 0;
    const result = await runSuite(targets, save, {
      ...options(fakeRunner({}), save),
      cancelled: () => seen++ >= 2,
    });

    expect(result.run.cancelled).toBe(true);
    expect(result.run.entries.map((entry) => entry.state)).toEqual([
      'nominal',
      'nominal',
      'skipped',
    ]);
  });

  test('the summary counts every state exactly once', async () => {
    const targets = [
      target({ levelId: 'a', ticks: 10 }),
      target({ levelId: 'b', ticks: 10 }),
      target({ levelId: 'c', ticks: 10 }),
    ];
    const save = emptyLibrary();
    const result = await runSuite(
      targets,
      save,
      options(
        fakeRunner({
          a: { passed: true, ticks: 10 },
          b: { passed: true, ticks: 20 },
          c: { passed: false, ticks: 0 },
        }),
        save,
      ),
    );
    const summary = summarise(result.run);
    expect(summary).toMatchObject({ total: 3, nominal: 1, degraded: 1, broken: 1, improved: 0 });
  });
});
