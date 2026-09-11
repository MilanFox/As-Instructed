import { beforeEach, describe, expect, test } from 'vitest';
import { Medal } from '../../engine/index.ts';
import { emptyLibrary } from '../save.ts';
import { suiteSummary, useLibrary } from '../store.ts';
import type { MetaHost } from '../store.ts';
import type { SuiteResult } from '../regression.ts';
import type { LevelFacts, LevelProfile, LibrarySave } from '../types.ts';

const FACTS: LevelFacts[] = [
  { id: 'w4-01', title: 'Regolith survey', world: 4, parTicks: 90, seeds: [1] },
];

function host(): MetaHost {
  return {
    runner: { run: () => Promise.reject(new Error('not used')) },
    targets: () => [],
    facts: () => FACTS,
    completed: () => [{ levelId: 'w4-01', world: 4 }],
    applyMedals: () => undefined,
    setLevelCode: () => undefined,
    openLevel: () => undefined,
  };
}

function profile(): LevelProfile {
  return {
    levelId: 'w4-01',
    key: 'key-w4-01',
    passed: true,
    ticks: 100,
    medal: Medal.Silver,
    parTicks: 90,
    usage: { ticks: 40, calls: { pathTo: { calls: 4, ticks: 40 } } },
    imports: ['pathTo'],
    at: 1,
  };
}

function saveWithReports(): LibrarySave {
  const save = emptyLibrary();
  save.unlocked = true;
  save.published = [{ name: 'pathTo', fromLevel: 'w4-01', at: 1 }];
  save.profiles = { 'w4-01': profile() };
  return save;
}

describe('the Cost tab reads a stable value', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.getState().attach(host());
    useLibrary.setState({ save: saveWithReports() });
  });

  test('reports() hands back the same array on every read', () => {
    const first = useLibrary.getState().reports();
    expect(first.map((each) => each.name)).toEqual(['pathTo']);
    expect(useLibrary.getState().reports()).toBe(first);
    expect(useLibrary.getState().reports()).toBe(first);
  });

  test('a changed save is measured again rather than served from the last answer', () => {
    const before = useLibrary.getState().reports();
    useLibrary.setState({
      save: { ...useLibrary.getState().save, published: [] },
    });
    const after = useLibrary.getState().reports();
    expect(after).not.toBe(before);
    expect(after).toEqual([]);
  });

  test('attaching a different host re-derives', () => {
    const before = useLibrary.getState().reports();
    useLibrary.getState().attach(host());
    expect(useLibrary.getState().reports()).not.toBe(before);
  });

  test('structure() hands back the same tree on every read', () => {
    const source =
      'export function step(): void {}\n\nexport function pathTo(): void {\n  step();\n}\n';
    useLibrary.setState({ save: { ...useLibrary.getState().save, source } });

    const first = useLibrary.getState().structure();
    expect(first.roots).toEqual(['pathTo']);
    expect(useLibrary.getState().structure()).toBe(first);

    useLibrary.setState({ save: { ...useLibrary.getState().save, source: 'export {};\n' } });
    expect(useLibrary.getState().structure()).not.toBe(first);
  });
});

describe('the regression summary reads a stable value', () => {
  test('no suite is undefined, and one suite is always the same summary', () => {
    useLibrary.getState().hydrate(null);
    expect(suiteSummary(useLibrary.getState())).toBeUndefined();

    const suite: SuiteResult = {
      run: { revisionId: 'r1', startedAt: 1, finishedAt: 2, entries: [] },
      summary: { total: 0, broken: 0, degraded: 0, improved: 0, nominal: 0, cached: 0 },
      cache: [],
      profiles: [],
    };
    useLibrary.setState({ suite });

    const first = suiteSummary(useLibrary.getState());
    expect(first).toBeDefined();
    expect(suiteSummary(useLibrary.getState())).toBe(first);
  });
});
