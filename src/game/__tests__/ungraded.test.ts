import { describe, expect, it } from 'vitest';
import { Medal } from '../../engine/index.ts';
import { campaignOrder, getLevel, levelIsGraded } from '../../levels/index.ts';
import { reportFor } from '../../ui/screens/review.ts';
import { isGraded, levelPoints, medalForLevel, medalOf, progressPoints } from '../score.ts';
import { emptyProgress, emptySave, migrate, parseSave } from '../save.ts';
import type { LevelProgress, SaveFile } from '../save.ts';

const UNGRADED = ['w1-01', 'w1-03', 'w5-02', 'w6-01', 'w6-03', 'w6-05'];

const closed = (patch: Partial<LevelProgress> = {}): LevelProgress => ({
  ...emptyProgress(),
  completed: true,
  attempts: 1,
  ...patch,
});

describe('the ungraded set', () => {
  it('is exactly the six the measurement produced', () => {
    const flagged = campaignOrder()
      .filter((level) => level.graded === false)
      .map((level) => level.id);
    expect(flagged).toEqual(UNGRADED);
  });

  it('leaves every other work order graded, World 2 included', () => {
    for (const level of campaignOrder()) {
      expect(isGraded(level), level.id).toBe(!UNGRADED.includes(level.id));
    }
  });

  it('keeps `w2-04` graded — the clock cannot see its lesson, but it can still grade it', () => {
    expect(isGraded(getLevel('w2-04') as { graded?: boolean })).toBe(true);
  });

  it('changes no par', () => {
    expect(getLevel('w1-01')?.par.ticks).toBe(78);
    expect(getLevel('w1-03')?.par.ticks).toBe(24);
    expect(getLevel('w5-02')?.par.ticks).toBe(2);
    expect(getLevel('w6-01')?.par.ticks).toBe(1);
    expect(getLevel('w6-03')?.par.ticks).toBe(38);
    expect(getLevel('w6-05')?.par.ticks).toBe(60);
  });

  it('keeps every objective and bonus the levels already had', () => {
    expect(getLevel('w1-01')?.objectives.map((objective) => objective.id)).toContain('bay-booking');
    expect(getLevel('w1-03')?.bonus?.length).toBe(1);
    expect(getLevel('w6-05')?.bonus?.length).toBeGreaterThan(0);
  });
});

describe('an ungraded level never carries a medal', () => {
  const level = { graded: false, par: { ticks: 78 } };

  it('earns none however fast the run was', () => {
    expect(medalForLevel(level, true, 1)).toBeNull();
    expect(medalForLevel(level, true, 999)).toBeNull();
  });

  it('earns none when the run failed either — there is nothing to withhold', () => {
    expect(medalForLevel(level, false, 1)).toBeNull();
  });

  it('is null rather than `Medal.None`, because a missing medal is a different state', () => {
    expect(medalOf(level, { medal: Medal.None })).toBeNull();
    expect(medalOf(level, { medal: Medal.Gold })).toBeNull();
    expect(medalOf({}, { medal: Medal.None })).toBe(Medal.None);
  });

  it('still grades a graded level exactly as before', () => {
    const graded = { par: { ticks: 78 } };
    expect(medalForLevel(graded, true, 78)).toBe(Medal.Gold);
    expect(medalForLevel(graded, true, 97)).toBe(Medal.Silver);
    expect(medalForLevel(graded, true, 98)).toBe(Medal.Bronze);
    expect(medalForLevel(graded, false, 1)).toBe(Medal.None);
  });
});

describe('an ungraded level is worth three points, the same as a gold', () => {
  it('weighs a null medal as a gold', () => {
    expect(levelPoints(null)).toBe(levelPoints(Medal.Gold));
    expect(levelPoints(null)).toBe(3);
  });

  it('adds bonus stars on top, exactly as a gold does', () => {
    expect(levelPoints(null, 2)).toBe(levelPoints(Medal.Gold, 2));
  });

  it('pays the three only once the work order is closed', () => {
    const level = { graded: false };
    expect(progressPoints(level, closed())).toBe(3);
    expect(progressPoints(level, emptyProgress())).toBe(0);
  });

  it('counts only stars the level still offers, as a graded level does', () => {
    const level = { graded: false, bonus: [{ id: 'kept' }] };
    expect(progressPoints(level, closed({ stars: ['kept', 'retired'] }))).toBe(4);
  });

  it('leaves a graded level arithmetic untouched', () => {
    const level = { bonus: [{ id: 'kept' }] };
    expect(progressPoints(level, closed({ medal: Medal.Silver, stars: ['kept'] }))).toBe(3);
    expect(progressPoints(level, emptyProgress())).toBe(0);
  });
});

describe('an ungraded level never enters the Performance Review denominator', () => {
  const withLevels = (levels: Record<string, LevelProgress>): SaveFile => ({
    ...emptySave(),
    levels,
  });

  it('contributes to neither side of the fraction', () => {
    const alone = reportFor(withLevels({ 'w1-01': closed() }));
    expect(alone.points).toBe(0);
    expect(alone.maxPoints).toBe(0);
    expect(alone.closed).toBe(0);
    expect(alone.graded).toBe(false);
  });

  it('cannot drag a perfect record down', () => {
    const perfect = reportFor(withLevels({ 'w1-05': closed({ medal: Medal.Gold }) }));
    const withUngraded = reportFor(
      withLevels({ 'w1-05': closed({ medal: Medal.Gold }), 'w1-01': closed(), 'w6-01': closed() }),
    );
    expect(withUngraded.percent).toBe(perfect.percent);
    expect(withUngraded.percent).toBe(100);
    expect(withUngraded.closed).toBe(perfect.closed);
  });

  it('cannot inflate a weak one either', () => {
    const weak = reportFor(withLevels({ 'w1-05': closed({ medal: Medal.Bronze }) }));
    const withUngraded = reportFor(
      withLevels({ 'w1-05': closed({ medal: Medal.Bronze }), 'w1-01': closed() }),
    );
    expect(withUngraded.percent).toBe(weak.percent);
  });

  it('still counts a bonus star it earned, because stars are not the yardstick', () => {
    const report = reportFor(withLevels({ 'w1-03': closed({ stars: ['within-7-canMove'] }) }));
    expect(report.stars).toBe(1);
    expect(report.closed).toBe(0);
  });
});

describe('a save written by a build that graded these levels', () => {
  const beforeA7 = JSON.stringify({
    version: 2,
    updatedAt: 1_700_000_000_000,
    levels: {
      'w1-01': {
        code: 'move(Dir.East);',
        completed: true,
        medal: 'gold',
        stars: [],
        objectives: ['parked-on-pad'],
        bestTicks: 78,
        attempts: 4,
        clearedAt: 1_699_000_000_000,
        hintsRevealed: 1,
      },
      'w6-03': {
        code: 'decode();',
        completed: true,
        medal: 'silver',
        stars: ['shorter-encoding'],
        bestTicks: 38,
        attempts: 2,
      },
      'w1-05': { code: 'sweep();', completed: true, medal: 'gold', stars: [], attempts: 1 },
    },
    settings: {},
    achievements: {},
    stats: { runs: 7, passes: 3, fails: 4 },
    seenRequisitions: ['move'],
    reviewedRanks: [],
  });

  it('still loads', () => {
    expect(() => parseSave(beforeA7)).not.toThrow();
    expect(Object.keys(parseSave(beforeA7).levels).sort()).toEqual(['w1-01', 'w1-05', 'w6-03']);
  });

  it('drops the medal the level no longer carries', () => {
    const save = parseSave(beforeA7);
    expect(save.levels['w1-01']?.medal).toBe(Medal.None);
    expect(save.levels['w6-03']?.medal).toBe(Medal.None);
  });

  it('keeps everything beside it, so no work is lost', () => {
    const progress = parseSave(beforeA7).levels['w1-01'];
    expect(progress?.code).toBe('move(Dir.East);');
    expect(progress?.completed).toBe(true);
    expect(progress?.bestTicks).toBe(78);
    expect(progress?.objectives).toEqual(['parked-on-pad']);
    expect(progress?.attempts).toBe(4);
    expect(progress?.clearedAt).toBe(1_699_000_000_000);
    expect(progress?.hintsRevealed).toBe(1);
    expect(parseSave(beforeA7).levels['w6-03']?.stars).toEqual(['shorter-encoding']);
  });

  it('leaves a still-graded level medal exactly where it was', () => {
    expect(parseSave(beforeA7).levels['w1-05']?.medal).toBe(Medal.Gold);
  });

  it('loses no points by the drop — the close is still worth three', () => {
    const save = parseSave(beforeA7);
    const level = getLevel('w1-01') as { graded?: boolean };
    expect(progressPoints(level, save.levels['w1-01'] as LevelProgress)).toBe(3);
  });

  it('carries no commendation forward from a gold recorded on an ungraded level', () => {
    const v1 = {
      version: 1,
      updatedAt: 1,
      levels: {
        'w1-01': { completed: true, medal: 'gold', stars: [], attempts: 1, clearedAt: 500 },
      },
      settings: {},
    };
    const migrated = migrate(v1);
    expect(migrated.achievements).toEqual({});
  });

  it('keeps a medal recorded against an id this build has never heard of', () => {
    const withdrawn = JSON.stringify({
      version: 2,
      updatedAt: 1,
      levels: { 'w2-03': { code: 'x', completed: true, medal: 'gold', stars: [], attempts: 1 } },
      settings: {},
    });
    expect(levelIsGraded('w2-03')).toBe(true);
    expect(parseSave(withdrawn).levels['w2-03']?.medal).toBe(Medal.Gold);
  });
});
