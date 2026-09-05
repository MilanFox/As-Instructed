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
    save.levels['w1-01'] = { ...emptyProgress(), code: 'move(Dir.East);', medal: 'silver' };
    const migrated = migrate(JSON.parse(JSON.stringify(save)) as unknown);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-01']?.code).toBe('move(Dir.East);');
    expect(migrated.levels['w1-01']?.medal).toBe('silver');
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
      levels: { 'w1-01': { code: 'x', completed: true, medal: 'gold', bestTicks: 6 } },
    };
    const migrated = migrate(legacy);
    expect(migrated.levels['w1-01']).toMatchObject({
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
      levels: { 'w1-01': { code: 'precious', medal: 'gold', completed: true } },
      settings: { theyAddedThis: true },
    };
    const migrated = migrate(future);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-01']?.code).toBe('precious');
    expect(migrated.levels['w1-01']?.medal).toBe('gold');
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
    save.levels['w1-01'] = { ...emptyProgress(), code: 'const a = `x`;', bestChars: 12 };
    const restored = parseSave(exportSave(save));
    expect(restored.levels['w1-01']?.code).toBe('const a = `x`;');
    expect(restored.levels['w1-01']?.bestChars).toBe(12);
  });
});

describe('mergeProgress', () => {
  it('keeps the better medal and the lower records', () => {
    const merged = mergeProgress(
      { ...emptyProgress(), medal: 'silver', bestTicks: 10, bestChars: 90, stars: ['a'] },
      { ...emptyProgress(), medal: 'bronze', bestTicks: 8, bestChars: 120, stars: ['b'] },
    );
    expect(merged.medal).toBe('silver');
    expect(merged.bestTicks).toBe(8);
    expect(merged.bestChars).toBe(90);
    expect(merged.stars).toEqual(['a', 'b']);
  });

  it('never drops code on import', () => {
    const current = emptySave();
    current.levels['w1-01'] = { ...emptyProgress(), code: 'mine', medal: 'gold' };
    const incoming = exportSave({
      ...emptySave(),
      levels: { 'w1-03': { ...emptyProgress(), code: 'theirs' } },
    });
    const merged = importSave(current, incoming);
    expect(merged.levels['w1-01']?.code).toBe('mine');
    expect(merged.levels['w1-01']?.medal).toBe('gold');
    expect(merged.levels['w1-03']?.code).toBe('theirs');
  });
});

describe('migrate to the reward fields', () => {
  it('gives a fresh save empty commendations, zeroed stats and ceremony on', () => {
    const save = emptySave();
    expect(save.achievements).toEqual({});
    expect(save.stats).toEqual({ runs: 0, passes: 0, fails: 0, streak: 0, bestStreak: 0 });
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

  it('reconstructs only the commendations a version 1 save can prove', () => {
    const v1 = {
      version: 1,
      updatedAt: 1,
      levels: {
        'w1-01': { completed: true, medal: 'gold', stars: [], attempts: 3, clearedAt: 1000 },
        'w1-03': { completed: true, medal: 'bronze', stars: [], attempts: 1, clearedAt: 2000 },
      },
      settings: {},
    };
    const migrated = migrate(v1);

    expect(migrated.achievements['filed']).toBe(1000);
    expect(migrated.achievements['within-budget']).toBe(1000);
    // Nothing else is knowable: a version 1 save has no record of blocked moves or streaks.
    expect(Object.keys(migrated.achievements).sort()).toEqual(['filed', 'within-budget']);
    expect(migrated.stats.passes).toBe(2);
    expect(migrated.stats.runs).toBe(4);
    expect(migrated.stats.streak).toBe(0);
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
      achievements: { filed: 'soon', '': 5 },
      stats: { runs: -4, streak: 'lots', bestStreak: 2 },
      seenRequisitions: ['scan', 'scan', 7],
    });

    expect(migrated.settings.celebrations).toBe(true);
    expect(migrated.achievements['filed']).toBeGreaterThan(0);
    expect(Object.keys(migrated.achievements)).toEqual(['filed']);
    expect(migrated.stats.runs).toBe(0);
    expect(migrated.stats.bestStreak).toBe(2);
    expect(migrated.seenRequisitions).toEqual(['scan']);
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
    save.achievements['filed'] = 4242;
    save.stats = { runs: 9, passes: 4, fails: 5, streak: 2, bestStreak: 3 };
    save.seenRequisitions = ['scan', 'harvest'];
    const back = parseSave(exportSave(save));

    expect(back.achievements['filed']).toBe(4242);
    expect(back.stats.bestStreak).toBe(3);
    expect(back.seenRequisitions).toEqual(['scan', 'harvest']);
  });
});

describe('importSave and the reward fields', () => {
  it('unions commendations and keeps the earlier date for each', () => {
    const current = emptySave();
    current.achievements = { filed: 500, 'no-contact': 900 };
    const incoming = emptySave();
    incoming.achievements = { filed: 100, 'streak-3': 700 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.achievements).toEqual({ filed: 100, 'no-contact': 900, 'streak-3': 700 });
  });

  it('never lowers a best streak, and takes the live streak from the import', () => {
    const current = emptySave();
    current.stats = { runs: 20, passes: 8, fails: 12, streak: 4, bestStreak: 6 };
    const incoming = emptySave();
    incoming.stats = { runs: 3, passes: 2, fails: 1, streak: 1, bestStreak: 1 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.stats.bestStreak).toBe(6);
    expect(merged.stats.streak).toBe(1);
    expect(merged.stats.runs).toBe(20);
  });

  it('unions signed requisitions so hardware is never re-delivered', () => {
    const current = emptySave();
    current.seenRequisitions = ['move', 'pos'];
    const incoming = emptySave();
    incoming.seenRequisitions = ['pos', 'scan'];

    const merged = importSave(current, JSON.stringify(incoming));
    expect([...merged.seenRequisitions].sort()).toEqual(['move', 'pos', 'scan']);
  });

  it('still never drops code while merging the new fields', () => {
    const current = emptySave();
    current.levels['w1-01'] = { ...emptyProgress(), code: 'mine();' };
    const incoming = emptySave();
    incoming.achievements = { filed: 1 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.levels['w1-01']?.code).toBe('mine();');
  });
});

/**
 * Six work orders were withdrawn (docs/FIX-COMPRESSION.md) and their ids will never be reissued.
 * A save written before the cut still names them, and the rule that player code is never lost has
 * no exception for a work order that no longer exists.
 */
describe('a save that names a withdrawn work order', () => {
  const WITHDRAWN = ['w1-02', 'w1-04', 'w2-03', 'w3-03', 'w3-05', 'w4-03'];

  const beforeTheCut = (): SaveFile => {
    const save = emptySave();
    save.levels['w1-01'] = { ...emptyProgress(), code: 'kept();', completed: true, medal: 'gold' };
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
    expect(migrated.levels['w1-01']?.code).toBe('kept();');
    expect(migrated.levels['w1-01']?.medal).toBe('gold');
    expect(migrated.levels['w1-03']?.bestTicks).toBe(24);
  });

  it('keeps the withdrawn records too, because code is never thrown away', () => {
    const migrated = reloaded();
    for (const id of WITHDRAWN) expect(migrated.levels[id]?.code, id).toBe(`${id} code`);
  });

  it('imports over another save without losing either side', () => {
    const current = emptySave();
    current.levels['w1-05'] = { ...emptyProgress(), code: 'ours();' };
    const merged = importSave(current, exportSave(beforeTheCut()));

    expect(merged.levels['w1-05']?.code).toBe('ours();');
    expect(merged.levels['w1-01']?.medal).toBe('gold');
    expect(merged.levels['w2-03']?.code).toBe('w2-03 code');
  });

  it('does not gate the order that followed it', () => {
    const save = emptySave();
    save.levels['w1-01'] = { ...emptyProgress(), completed: true };
    expect(isLevelUnlocked(save, 'w1-03')).toBe(true);
    expect(isLevelUnlocked(save, 'w1-05')).toBe(false);
  });

  it('counts only issued work orders towards the campaign', () => {
    const migrated = reloaded();
    const closed = campaignOrder().filter((level) => migrated.levels[level.id]?.completed);
    expect(closed.map((level) => level.id)).toEqual(['w1-01']);
  });
});
