import { describe, expect, it } from 'vitest';
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
    const legacy = { 'w1-01': 'move(Dir.East);', 'w1-02': 'print("hi");' };
    const migrated = migrate(legacy);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-01']?.code).toBe('move(Dir.East);');
    expect(migrated.levels['w1-02']?.code).toBe('print("hi");');
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
      levels: { 'w1-02': { ...emptyProgress(), code: 'theirs' } },
    });
    const merged = importSave(current, incoming);
    expect(merged.levels['w1-01']?.code).toBe('mine');
    expect(merged.levels['w1-01']?.medal).toBe('gold');
    expect(merged.levels['w1-02']?.code).toBe('theirs');
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
        'w1-02': { code: 'print("x");', completed: false, medal: 'none', stars: [], attempts: 2 },
      },
      settings: { layout: DEFAULT_LAYOUT, speed: 2, consoleCap: 500 },
    };
    const migrated = migrate(v1);

    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.levels['w1-01']?.code).toBe('move(Dir.East);');
    expect(migrated.levels['w1-02']?.code).toBe('print("x");');
    expect(migrated.settings.speed).toBe(2);
  });

  it('reconstructs only the commendations a version 1 save can prove', () => {
    const v1 = {
      version: 1,
      updatedAt: 1,
      levels: {
        'w1-01': { completed: true, medal: 'gold', stars: [], attempts: 3, clearedAt: 1000 },
        'w1-02': { completed: true, medal: 'bronze', stars: [], attempts: 1, clearedAt: 2000 },
      },
      settings: {},
    };
    const migrated = migrate(v1);

    expect(migrated.achievements['filed']).toBe(1000);
    expect(migrated.achievements['within-budget']).toBe(1000);
    expect(Object.keys(migrated.achievements).sort()).toEqual(['filed', 'within-budget']);
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
      achievements: { filed: 'soon', '': 5 },
      stats: { runs: -4, passes: 'lots' },
      seenRequisitions: ['scan', 'scan', 7],
    });

    expect(migrated.settings.celebrations).toBe(true);
    expect(migrated.achievements['filed']).toBeGreaterThan(0);
    expect(Object.keys(migrated.achievements)).toEqual(['filed']);
    expect(migrated.stats.runs).toBe(0);
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
    save.stats = { runs: 9, passes: 4, fails: 5 };
    save.seenRequisitions = ['scan', 'harvest'];
    const back = parseSave(exportSave(save));

    expect(back.achievements['filed']).toBe(4242);
    expect(back.stats.passes).toBe(4);
    expect(back.seenRequisitions).toEqual(['scan', 'harvest']);
  });
});

describe('importSave and the reward fields', () => {
  it('unions commendations and keeps the earlier date for each', () => {
    const current = emptySave();
    current.achievements = { filed: 500, 'no-contact': 900 };
    const incoming = emptySave();
    incoming.achievements = { filed: 100, 'raised-again': 700 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.achievements).toEqual({ filed: 100, 'no-contact': 900, 'raised-again': 700 });
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

  it('still never drops code while merging the new fields', () => {
    const current = emptySave();
    current.levels['w1-01'] = { ...emptyProgress(), code: 'mine();' };
    const incoming = emptySave();
    incoming.achievements = { filed: 1 };

    const merged = importSave(current, JSON.stringify(incoming));
    expect(merged.levels['w1-01']?.code).toBe('mine();');
  });
});
