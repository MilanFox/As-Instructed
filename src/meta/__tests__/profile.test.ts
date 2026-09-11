import { describe, expect, test } from 'vitest';
import { Medal } from '../../engine/index.ts';
import { bestProjection, buildReports, projectSavings, upgradeSummary } from '../profile.ts';
import { emptyLibrary } from '../save.ts';
import type { LevelFacts, LevelProfile, LibrarySave } from '../types.ts';

function profile(overrides: Partial<LevelProfile> & { levelId: string }): LevelProfile {
  return {
    key: `key-${overrides.levelId}`,
    passed: true,
    ticks: 100,
    medal: Medal.Silver,
    parTicks: 90,
    usage: { ticks: 0, calls: {} },
    imports: [],
    at: 1,
    ...overrides,
  };
}

function facts(...ids: string[]): Map<string, LevelFacts> {
  return new Map(
    ids.map((id) => [id, { id, title: `Work order ${id}`, world: 4, parTicks: 90, seeds: [1] }]),
  );
}

function saveWith(...profiles: LevelProfile[]): LibrarySave {
  const save = emptyLibrary();
  for (const each of profiles) save.profiles[each.levelId] = each;
  save.published = [{ name: 'pathTo', fromLevel: 'w4-02', at: 1 }];
  return save;
}

describe('attribution across levels', () => {
  const save = saveWith(
    profile({
      levelId: 'w4-05',
      ticks: 100,
      imports: ['pathTo'],
      usage: { ticks: 40, calls: { pathTo: { calls: 4, ticks: 40 } } },
    }),
    profile({
      levelId: 'w5-01',
      ticks: 60,
      imports: ['pathTo'],
      usage: { ticks: 20, calls: { pathTo: { calls: 2, ticks: 20 } } },
    }),
  );

  test('one row per subroutine, totalled across every work order that calls it', () => {
    const [report] = buildReports({
      save,
      exports: ['pathTo'],
      facts: facts('w4-05', 'w5-01'),
      freshKeys: new Set(['key-w4-05', 'key-w5-01']),
    });
    expect(report?.callers).toHaveLength(2);
    expect(report?.calls).toBe(6);
    expect(report?.ticks).toBe(60);
    expect(report?.perCall).toBe(10);
  });

  test('a work order measured against an older library is stale, not counted', () => {
    const [report] = buildReports({
      save,
      exports: ['pathTo'],
      facts: facts('w4-05', 'w5-01'),
      freshKeys: new Set(['key-w4-05']),
    });
    expect(report?.callers.map((each) => each.levelId)).toEqual(['w4-05']);
    expect(report?.stale).toEqual(['w5-01']);
    expect(report?.ticks).toBe(40);
  });

  test('a published subroutine nothing calls reports zero rather than being hidden', () => {
    const [report] = buildReports({
      save: saveWith(),
      exports: ['pathTo'],
      facts: facts(),
      freshKeys: new Set(),
    });
    expect(report?.name).toBe('pathTo');
    expect(report?.callers).toEqual([]);
    expect(report?.perCall).toBe(0);
  });

  test('the origin of a published subroutine travels with its row', () => {
    const [report] = buildReports({
      save,
      exports: ['pathTo'],
      facts: facts('w4-05', 'w5-01'),
      freshKeys: new Set(['key-w4-05', 'key-w5-01']),
    });
    expect(report?.origin?.fromLevel).toBe('w4-02');
  });
});

describe('projection', () => {
  const report = buildReports({
    save: saveWith(
      profile({
        levelId: 'w4-05',
        ticks: 100,
        medal: Medal.Silver,
        parTicks: 90,
        imports: ['pathTo'],
        usage: { ticks: 40, calls: { pathTo: { calls: 4, ticks: 40 } } },
      }),
      profile({
        levelId: 'w5-01',
        ticks: 200,
        medal: Medal.Bronze,
        parTicks: 90,
        imports: ['pathTo'],
        usage: { ticks: 20, calls: { pathTo: { calls: 2, ticks: 20 } } },
      }),
    ),
    exports: ['pathTo'],
    facts: facts('w4-05', 'w5-01'),
    freshKeys: new Set(['key-w4-05', 'key-w5-01']),
  })[0];

  test('saving ticks per call improves every work order that calls it', () => {
    const projection = projectSavings(report!, 1);
    expect(projection.improves).toEqual(['w4-05', 'w5-01']);
  });

  test('a medal upgrade is only claimed when the arithmetic reaches the bracket', () => {
    expect(projectSavings(report!, 2).upgrades).toEqual([]);
    expect(projectSavings(report!, 3).upgrades).toEqual([
      { levelId: 'w4-05', from: Medal.Silver, to: Medal.Gold },
    ]);
  });

  test('the headline names the count of work orders and the count of upgrades', () => {
    const projection = projectSavings(report!, 3);
    expect(projection.headline).toContain('3 ticks off `pathTo`');
    expect(projection.headline).toContain('2 work orders');
    expect(projection.headline).toContain('1 of them to a better medal');
  });

  test('the suggested saving is the cheapest one that changes a bracket', () => {
    const best = bestProjection(report!);
    expect(best?.delta).toBe(3);
    expect(upgradeSummary(best!)).toEqual(['1 work order goes from silver to gold.']);
  });

  test('a subroutine that can never change a bracket suggests nothing', () => {
    const stuck = buildReports({
      save: saveWith(
        profile({
          levelId: 'w4-05',
          ticks: 400,
          medal: Medal.Bronze,
          parTicks: 90,
          imports: ['pathTo'],
          usage: { ticks: 4, calls: { pathTo: { calls: 2, ticks: 4 } } },
        }),
      ),
      exports: ['pathTo'],
      facts: facts('w4-05'),
      freshKeys: new Set(['key-w4-05']),
    })[0];
    expect(bestProjection(stuck!)).toBeUndefined();
  });
});
