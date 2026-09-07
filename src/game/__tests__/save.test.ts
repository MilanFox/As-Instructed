import { describe, expect, it } from 'vitest';
import { campaignOrder, getLevel } from '../../levels/index.ts';
import { isLevelUnlocked } from '../store.ts';
import {
  DEFAULT_LAYOUT,
  SAVE_VERSION,
  emptyProgress,
  emptySave,
  exportSave,
  importSave,
  mergeProgress,
  migrate,
  parseSave,
} from '../save.ts';
import type { SaveFile } from '../save.ts';

describe('migrate', () => {
  it('reads a current-version save unchanged', () => {
    const save = emptySave();
    save.levels['w1-05'] = { ...emptyProgress(), code: 'move(Dir.East);', medal: 'silver' };
    const migrated = migrate(JSON.parse(JSON.stringify(save)) as unknown);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-05']?.code).toBe('move(Dir.East);');
    expect(migrated.levels['w1-05']?.medal).toBe('silver');
  });

  it('migrates the unversioned v0 shape without losing code', () => {
    const legacy = { 'w1-01': 'move(Dir.East);', 'w1-03': 'print("hi");' };
    const migrated = migrate(legacy);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-01']?.code).toBe('move(Dir.East);');
    expect(migrated.levels['w1-03']?.code).toBe('print("hi");');
    expect(migrated.levels['w1-01']?.completed).toBe(false);
  });

  it('migrates a v0 object shape with partial fields', () => {
    const legacy = {
      levels: { 'w1-05': { code: 'x', completed: true, medal: 'gold', bestTicks: 6 } },
    };
    const migrated = migrate(legacy);
    expect(migrated.levels['w1-05']).toMatchObject({
      code: 'x',
      completed: true,
      medal: 'gold',
      bestTicks: 6,
      attempts: 0,
    });
  });

  it('keeps code when the stored version is from a future build', () => {
    const future = {
      version: SAVE_VERSION + 40,
      levels: { 'w1-05': { code: 'precious', medal: 'gold', completed: true } },
      settings: { theyAddedThis: true },
    };
    const migrated = migrate(future);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-05']?.code).toBe('precious');
    expect(migrated.levels['w1-05']?.medal).toBe('gold');
  });

  it('drops nonsense fields instead of trusting them', () => {
    const hostile = {
      version: 1,
      levels: {
        'w1-01': { code: 42, medal: 'platinum', stars: ['a', 7, 'b'], bestTicks: -3 },
      },
      settings: { layout: { editorFraction: 99 }, speed: 'fast' },
    };
    const migrated = migrate(hostile);
    expect(migrated.levels['w1-01']?.code).toBeUndefined();
    expect(migrated.levels['w1-01']?.medal).toBe('none');
    expect(migrated.levels['w1-01']?.stars).toEqual(['a', 'b']);
    expect(migrated.levels['w1-01']?.bestTicks).toBeUndefined();
    expect(migrated.settings.layout.editorFraction).toBeLessThanOrEqual(0.85);
    expect(migrated.settings.speed).toBe(1);
  });

  it('falls back to an empty save for junk', () => {
    expect(migrate(null).levels).toEqual({});
    expect(migrate('nope').levels).toEqual({});
    expect(migrate(7).settings.layout).toEqual(DEFAULT_LAYOUT);
    expect(parseSave('{not json').levels).toEqual({});
  });

  it('round-trips through export', () => {
    const save = emptySave();
    save.levels['w1-01'] = { ...emptyProgress(), code: 'const a = `x`;', bestTicks: 12 };
    const restored = parseSave(exportSave(save));
    expect(restored.levels['w1-01']?.code).toBe('const a = `x`;');
    expect(restored.levels['w1-01']?.bestTicks).toBe(12);
  });

  /*
   * `bestChars` was written by every build up to this one. A player who opens the game after
   * updating must land on the medals, code and objectives they went to bed with — the retired
   * field is dropped on read, and nothing beside it moves.
   */
  it('loads a save written before the character count was removed', () => {
    const legacy = {
      version: SAVE_VERSION,
      updatedAt: 1_700_000_000_000,
      levels: {
        'w1-05': {
          code: 'move(Dir.East);',
          completed: true,
          medal: 'gold',
          stars: ['fast'],
          objectives: ['reach'],
          bestTicks: 9,
          bestChars: 132,
          attempts: 4,
          clearedAt: 1_699_000_000_000,
        },
      },
      settings: { layout: DEFAULT_LAYOUT, speed: 2, consoleCap: 200, celebrations: false },
      achievements: { 'first-light': 1_699_000_000_000 },
      stats: { runs: 12, passes: 5, fails: 7 },
      seenRequisitions: ['w1'],
    };

    const restored = migrate(legacy);
    const progress = restored.levels['w1-05'];

    expect(progress).toEqual({
      code: 'move(Dir.East);',
      completed: true,
      medal: 'gold',
      stars: ['fast'],
      objectives: ['reach'],
      bestTicks: 9,
      attempts: 4,
      clearedAt: 1_699_000_000_000,
    });
    expect(restored.achievements).toEqual({ 'first-light': 1_699_000_000_000 });
    expect(restored.stats).toEqual({ runs: 12, passes: 5, fails: 7 });
    expect(restored.settings.speed).toBe(2);
  });

  it('survives a legacy save whose only level record is a bestChars', () => {
    const restored = migrate({ version: 1, levels: { 'w2-01': { bestChars: 400 } } });
    expect(restored.levels['w2-01']).toEqual(emptyProgress());
  });
});

describe('mergeProgress', () => {
  it('keeps the better medal and the lower records', () => {
    const merged = mergeProgress(
      { ...emptyProgress(), medal: 'silver', bestTicks: 10, stars: ['a'] },
      { ...emptyProgress(), medal: 'bronze', bestTicks: 8, stars: ['b'] },
    );
    expect(merged.medal).toBe('silver');
    expect(merged.bestTicks).toBe(8);
    expect(merged.stars).toEqual(['a', 'b']);
  });

  it('never drops code on import', () => {
    const current = emptySave();
    current.levels['w1-05'] = { ...emptyProgress(), code: 'mine', medal: 'gold' };
    const incoming = exportSave({
      ...emptySave(),
      levels: { 'w1-03': { ...emptyProgress(), code: 'theirs' } },
    });
    const merged = importSave(current, incoming);
    expect(merged.levels['w1-05']?.code).toBe('mine');
    expect(merged.levels['w1-05']?.medal).toBe('gold');
    expect(merged.levels['w1-03']?.code).toBe('theirs');
  });
});

describe('migrate to the reward fields', () => {
  it('gives a fresh save empty commendations, zeroed stats and ceremony on', () => {
    const save = emptySave();
    expect(save.achievements).toEqual({});
    expect(save.stats).toEqual({ runs: 0, passes: 0, fails: 0 });
    expect(save.seenRequisitions).toEqual([]);
    expect(save.settings.celebrations).toBe(true);
  });

  it('lifts a version 1 save without touching a line of its code', () => {
    const v1 = {
      version: 1,
      updatedAt: 1,
      levels: {
        'w1-01': {
          code: 'move(Dir.East);',
          completed: true,
          medal: 'gold',
          stars: [],
          bestTicks: 6,
          attempts: 4,
          clearedAt: 1000,
        },
        'w1-03': { code: 'print("x");', completed: false, medal: 'none', stars: [], attempts: 2 },
      },
      settings: { layout: DEFAULT_LAYOUT, speed: 2, consoleCap: 500 },
    };
    const migrated = migrate(v1);

    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-01']?.code).toBe('move(Dir.East);');
    expect(migrated.levels['w1-03']?.code).toBe('print("x");');
    expect(migrated.settings.speed).toBe(2);
  });

  it('reconstructs no commendation from a version 1 save, because none of the five follows', () => {
    const v1 = {
      version: 1,
      updatedAt: 1,
      levels: {
        'w1-05': { completed: true, medal: 'gold', stars: [], attempts: 3, clearedAt: 1000 },
        'w2-01': { completed: true, medal: 'bronze', stars: [], attempts: 1, clearedAt: 2000 },
      },
      settings: {},
    };
    const migrated = migrate(v1);

    /* A medal and a clear date cannot prove which run closed it, or that a budget was met. */
    expect(migrated.achievements).toEqual({});
    expect(migrated.stats.passes).toBe(2);
    expect(migrated.stats.runs).toBe(4);
  });

  it('awards nothing to a version 1 save that never closed anything', () => {
    const migrated = migrate({
      version: 1,
      updatedAt: 1,
      levels: { 'w1-01': { completed: false, medal: 'none', stars: [], attempts: 7 } },
      settings: {},
    });
    expect(migrated.achievements).toEqual({});
    expect(migrated.stats.fails).toBe(7);
  });

  it('drops nonsense in the new fields instead of trusting it', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      updatedAt: 1,
      levels: {},
      settings: { celebrations: 'yes please' },
      achievements: { 'second-look': 'soon', '': 5 },
      stats: { runs: -4, passes: 'lots' },
      seenRequisitions: ['scan', 'scan', 7],
    });

    expect(migrated.settings.celebrations).toBe(true);
    expect(migrated.achievements['second-look']).toBeGreaterThan(0);
    expect(Object.keys(migrated.achievements)).toEqual(['second-look']);
    expect(migrated.stats.runs).toBe(0);
    expect(migrated.seenRequisitions).toEqual(['scan']);
  });

  it('loads a save written before the review was delivered rather than hosted', () => {
    const before = {
      version: SAVE_VERSION,
      updatedAt: 1,
      levels: { 'w1-05': { completed: true, medal: 'gold', stars: [], attempts: 2 } },
      settings: {},
      achievements: {},
      stats: { runs: 2, passes: 1, fails: 1 },
      seenRequisitions: ['move'],
    };
    const migrated = migrate(before);

    expect(migrated.reviewedRanks).toEqual([]);
    expect(migrated.levels['w1-05']?.medal).toBe('gold');
    expect(migrated.seenRequisitions).toEqual(['move']);
  });

  it('keeps only whole tier ranks out of a hand-edited review history', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      updatedAt: 1,
      levels: {},
      reviewedRanks: [3, 3, 4.5, 0, -2, '5', null, 5],
    });
    expect(migrated.reviewedRanks).toEqual([3, 5]);
  });

  it('keeps ceremony off once the player has turned it off', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      updatedAt: 1,
      levels: {},
      settings: { celebrations: false },
    });
    expect(migrated.settings.celebrations).toBe(false);
  });

  it('round-trips the reward fields through export', () => {
    const save = emptySave();
    save.achievements['second-look'] = 4242;
    save.stats = { runs: 9, passes: 4, fails: 5 };
    save.seenRequisitions = ['scan', 'harvest'];
    const back = parseSave(exportSave(save));

    expect(back.achievements['second-look']).toBe(4242);
    expect(back.stats.passes).toBe(4);
    expect(back.seenRequisitions).toEqual(['scan', 'harvest']);
  });
});

describe('importSave and the reward fields', () => {
  it('unions commendations and keeps the earlier date for each', () => {
    const current = emptySave();
    current.achievements = { 'second-look': 500, 'minimal-observation': 900 };
    const incoming = emptySave();
    incoming.achievements = { 'second-look': 100, 'raised-again': 700 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.achievements).toEqual({
      'second-look': 100,
      'minimal-observation': 900,
      'raised-again': 700,
    });
  });

  it('keeps the higher tally of each counter', () => {
    const current = emptySave();
    current.stats = { runs: 20, passes: 8, fails: 12 };
    const incoming = emptySave();
    incoming.stats = { runs: 3, passes: 2, fails: 1 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.stats.runs).toBe(20);
    expect(merged.stats.passes).toBe(8);
  });

  it('unions signed requisitions so hardware is never re-delivered', () => {
    const current = emptySave();
    current.seenRequisitions = ['move', 'pos'];
    const incoming = emptySave();
    incoming.seenRequisitions = ['pos', 'scan'];

    const merged = importSave(current, JSON.stringify(incoming));
    expect([...merged.seenRequisitions].sort()).toEqual(['move', 'pos', 'scan']);
  });

  it('unions read reviews so a memo is never re-delivered', () => {
    const current = emptySave();
    current.reviewedRanks = [3, 4];
    const incoming = emptySave();
    incoming.reviewedRanks = [4, 5];

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.reviewedRanks).toEqual([3, 4, 5]);
  });

  it('still never drops code while merging the new fields', () => {
    const current = emptySave();
    current.levels['w1-01'] = { ...emptyProgress(), code: 'mine();' };
    const incoming = emptySave();
    incoming.achievements = { 'second-look': 1 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.levels['w1-01']?.code).toBe('mine();');
  });
});

/**
 * Seven work orders were withdrawn — w1-02, w1-04, w2-01, w2-03, w3-03, w3-05, w4-03 — and their
 * ids will never be reissued.
 * A save written before the cut still names them, and the rule that player code is never lost has
 * no exception for a work order that no longer exists.
 */
describe('a save that names a withdrawn work order', () => {
  const WITHDRAWN = ['w1-02', 'w1-04', 'w2-01', 'w2-03', 'w3-03', 'w3-05', 'w4-03'];

  const beforeTheCut = (): SaveFile => {
    const save = emptySave();
    save.levels['w1-05'] = { ...emptyProgress(), code: 'kept();', completed: true, medal: 'gold' };
    save.levels['w1-03'] = { ...emptyProgress(), code: 'also kept();', bestTicks: 24 };
    for (const id of WITHDRAWN) {
      save.levels[id] = {
        ...emptyProgress(),
        code: `${id} code`,
        completed: true,
        medal: 'silver',
      };
    }
    return save;
  };

  const reloaded = (): SaveFile => migrate(JSON.parse(exportSave(beforeTheCut())) as unknown);

  it('names nothing the campaign will offer', () => {
    for (const id of WITHDRAWN) expect(getLevel(id), id).toBeUndefined();
  });

  it('loads without throwing and keeps every surviving record', () => {
    const migrated = reloaded();
    expect(migrated.levels['w1-05']?.code).toBe('kept();');
    expect(migrated.levels['w1-05']?.medal).toBe('gold');
    expect(migrated.levels['w1-03']?.bestTicks).toBe(24);
  });

  it('keeps the withdrawn records too, because code is never thrown away', () => {
    const migrated = reloaded();
    for (const id of WITHDRAWN) expect(migrated.levels[id]?.code, id).toBe(`${id} code`);
  });

  it('imports over another save without losing either side', () => {
    const current = emptySave();
    current.levels['w2-02'] = { ...emptyProgress(), code: 'ours();' };
    const merged = importSave(current, exportSave(beforeTheCut()));

    expect(merged.levels['w2-02']?.code).toBe('ours();');
    expect(merged.levels['w1-05']?.medal).toBe('gold');
    expect(merged.levels['w2-03']?.code).toBe('w2-03 code');
  });

  it('does not gate the order that followed it', () => {
    const save = emptySave();
    save.levels['w1-01'] = { ...emptyProgress(), completed: true };
    /* `w1-02` was withdrawn, so the order after `w1-01` is `w1-03`. The gate walks campaign order,
       not the ids. Two open at a time reaches `w1-05`; `w2-02` is three along and still shut. */
    expect(isLevelUnlocked(save, 'w1-03')).toBe(true);
    expect(isLevelUnlocked(save, 'w1-05')).toBe(true);
    expect(isLevelUnlocked(save, 'w2-02')).toBe(false);
  });

  it('counts only issued work orders towards the campaign', () => {
    const migrated = reloaded();
    const closed = campaignOrder().filter((level) => migrated.levels[level.id]?.completed);
    expect(closed.map((level) => level.id)).toEqual(['w1-05']);
  });
});

/**
 * Ten of the fifteen commendations were retired. A save written by the
 * build that issued them is the ordinary case, not the edge case, so the drop has to be surgical:
 * the retired ids go, everything beside them stays, and an id this build simply does not recognise
 * is left alone because it belongs to a build that is not this one.
 */
describe('a save written by a build that had fifteen commendations', () => {
  const beforeTheCut = JSON.stringify({
    version: SAVE_VERSION,
    updatedAt: 1,
    levels: {
      'w3-03': {
        code: 'sort();',
        completed: true,
        medal: 'silver',
        stars: ['one-depot-at-a-time'],
        bestTicks: 402,
        attempts: 11,
        clearedAt: 1_699_000_000_000,
      },
    },
    settings: {},
    achievements: {
      filed: 100,
      'within-budget': 200,
      'first-run': 300,
      'no-contact': 400,
      'sector-gold': 500,
      'second-look': 600,
      'raised-again': 700,
      repository: 800,
    },
    stats: { runs: 42, passes: 17, fails: 25 },
    seenRequisitions: ['scan'],
    reviewedRanks: [2],
  });

  it('still loads', () => {
    expect(() => parseSave(beforeTheCut)).not.toThrow();
  });

  it('drops every retired commendation', () => {
    const { achievements } = parseSave(beforeTheCut);
    for (const id of ['filed', 'within-budget', 'first-run', 'no-contact', 'sector-gold']) {
      expect(achievements[id], id).toBeUndefined();
    }
  });

  it('keeps the surviving commendations, dates and all', () => {
    const { achievements } = parseSave(beforeTheCut);
    expect(achievements['second-look']).toBe(600);
    expect(achievements['raised-again']).toBe(700);
    expect(achievements['repository']).toBe(800);
  });

  it('loses nothing else the player had', () => {
    const save = parseSave(beforeTheCut);
    expect(save.levels['w3-03']?.code).toBe('sort();');
    expect(save.levels['w3-03']?.medal).toBe('silver');
    expect(save.levels['w3-03']?.stars).toEqual(['one-depot-at-a-time']);
    expect(save.levels['w3-03']?.bestTicks).toBe(402);
    expect(save.levels['w3-03']?.attempts).toBe(11);
    expect(save.stats).toEqual({ runs: 42, passes: 17, fails: 25 });
    expect(save.seenRequisitions).toEqual(['scan']);
    expect(save.reviewedRanks).toEqual([2]);
  });

  it('keeps a commendation id this build has never heard of', () => {
    const fromAheadOfUs = JSON.stringify({
      ...(JSON.parse(beforeTheCut) as Record<string, unknown>),
      achievements: { 'shipped-it-twice': 900, filed: 100 },
    });
    const { achievements } = parseSave(fromAheadOfUs);
    expect(achievements['shipped-it-twice']).toBe(900);
    expect(achievements['filed']).toBeUndefined();
  });

  it('does not resurrect a retired commendation through import', () => {
    const current = emptySave();
    current.achievements = { 'second-look': 10 };
    const merged = importSave(current, beforeTheCut);

    expect(merged.achievements['filed']).toBeUndefined();
    expect(merged.achievements['second-look']).toBe(10);
    expect(merged.achievements['repository']).toBe(800);
  });
});

/**
 * The two fields the commendation layer added, and the reason neither needed a version step: both
 * are optional, and a save written by any earlier build already satisfies the shape.
 */
describe('the fields that outlive a session', () => {
  it('loads a save that has never heard of either of them', () => {
    const save = parseSave(exportSave(emptySave()));
    expect(save.firstRunAt).toBeUndefined();
    expect(save.routineOrders).toBeUndefined();
  });

  it('round-trips a start date and the orders a subroutine has run on', () => {
    const save: SaveFile = {
      ...emptySave(),
      firstRunAt: 1_699_000_000_000,
      routineOrders: { pathTo: ['w4-01', 'w4-02'], survey: ['w3-01'] },
    };
    const reloaded = parseSave(exportSave(save));

    expect(reloaded.firstRunAt).toBe(1_699_000_000_000);
    expect(reloaded.routineOrders).toEqual({ pathTo: ['w4-01', 'w4-02'], survey: ['w3-01'] });
  });

  it('drops nonsense rather than trusting it', () => {
    const save = migrate({
      version: SAVE_VERSION,
      levels: {},
      firstRunAt: 'tuesday',
      routineOrders: { pathTo: ['w4-01', 7, 'w4-01'], survey: 'w3-01', '': ['w1-01'] },
    });

    expect(save.firstRunAt).toBeUndefined();
    expect(save.routineOrders).toEqual({ pathTo: ['w4-01'] });
  });

  /* Import can raise a total and can never lower one. For a start date that means the earlier. */
  it('merges on import, keeping the earlier start and the union of the orders', () => {
    const current: SaveFile = {
      ...emptySave(),
      firstRunAt: 500,
      routineOrders: { pathTo: ['w4-01'] },
    };
    const incoming: SaveFile = {
      ...emptySave(),
      firstRunAt: 900,
      routineOrders: { pathTo: ['w4-02'], waves: ['w7-01'] },
    };
    const merged = importSave(current, exportSave(incoming));

    expect(merged.firstRunAt).toBe(500);
    expect(merged.routineOrders).toEqual({ pathTo: ['w4-01', 'w4-02'], waves: ['w7-01'] });
  });

  it('takes an incoming start date when there was none to keep', () => {
    const merged = importSave(emptySave(), exportSave({ ...emptySave(), firstRunAt: 700 }));
    expect(merged.firstRunAt).toBe(700);
  });
});
