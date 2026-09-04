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
