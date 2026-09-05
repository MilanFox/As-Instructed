import { describe, expect, it } from 'vitest';
import { Medal } from '../../engine/index.ts';
import type { RunFacts, WorldResult } from '../achievements.ts';
import { ACHIEVEMENTS, earnedBy, getAchievement, isSenseBudget } from '../achievements.ts';

const closed = (medal: Medal | null): WorldResult => ({ medal, closed: true });
const open: WorldResult = { medal: Medal.None, closed: false };
/** A closed work order on an ungraded level: no medal, and none missing either. §11 A7. */
const ungraded: WorldResult = { medal: null, closed: true };

function facts(patch: Partial<RunFacts> = {}): RunFacts {
  return {
    passed: true,
    medal: Medal.Bronze,
    ticks: 40,
    parTicks: 20,
    attempt: 3,
    blockedMoves: 2,
    stars: 0,
    senseBudgetMet: false,
    returnedForStar: false,
    worldResults: [closed(Medal.Bronze), open],
    ...patch,
  };
}

describe('the commendation list', () => {
  it('has no duplicate ids', () => {
    const ids = ACHIEVEMENTS.map((achievement) => achievement.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every commendation a title, a requirement and a note', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.title.length, achievement.id).toBeGreaterThan(0);
      expect(achievement.requirement.length, achievement.id).toBeGreaterThan(0);
      expect(achievement.note.length, achievement.id).toBeGreaterThan(0);
    }
  });

  it('resolves every id `earnedBy` can return', () => {
    const everything = earnedBy(
      facts({
        medal: Medal.Gold,
        ticks: 1,
        attempt: 1,
        blockedMoves: 0,
        stars: 2,
        senseBudgetMet: true,
        previousBestTicks: 9,
        worldResults: [closed(Medal.Gold), closed(Medal.Gold)],
      }),
    );
    for (const id of everything) expect(getAchievement(id), id).toBeDefined();
  });
});

describe('earnedBy', () => {
  it('rewards coming back to a closed order for its star', () => {
    expect(earnedBy(facts({ returnedForStar: true }))).toContain('came-back-for-it');
    expect(earnedBy(facts({ returnedForStar: false }))).not.toContain('came-back-for-it');
  });

  it('awards the persistence tiers at four runs and at ten', () => {
    expect(earnedBy(facts({ attempt: 3 }))).not.toContain('second-look');
    expect(earnedBy(facts({ attempt: 4 }))).toContain('second-look');
    expect(earnedBy(facts({ attempt: 9 }))).not.toContain('raised-again');
    expect(earnedBy(facts({ attempt: 10 }))).toEqual(
      expect.arrayContaining(['second-look', 'raised-again']),
    );
  });

  it('awards nothing at all for a failed run', () => {
    expect(earnedBy(facts({ passed: false, medal: Medal.Gold, attempt: 1 }))).toEqual([]);
  });

  it('always files the first close', () => {
    expect(earnedBy(facts())).toContain('filed');
  });

  it('awards gold only on gold', () => {
    expect(earnedBy(facts({ medal: Medal.Gold }))).toContain('within-budget');
    expect(earnedBy(facts({ medal: Medal.Silver }))).not.toContain('within-budget');
  });

  it('awards the first-run commendation only on attempt one', () => {
    expect(earnedBy(facts({ attempt: 1 }))).toContain('first-run');
    expect(earnedBy(facts({ attempt: 2 }))).not.toContain('first-run');
  });

  it('recognises a personal best, and only a strict one', () => {
    expect(earnedBy(facts({ ticks: 10, previousBestTicks: 11 }))).toContain('revised-downward');
    expect(earnedBy(facts({ ticks: 11, previousBestTicks: 11 }))).not.toContain('revised-downward');
    expect(earnedBy(facts({ ticks: 10 }))).not.toContain('revised-downward');
  });

  it('puts the elegant-solve bar strictly under half of par', () => {
    expect(earnedBy(facts({ ticks: 9, parTicks: 20 }))).toContain('outside-tolerance');
    expect(earnedBy(facts({ ticks: 10, parTicks: 20 }))).not.toContain('outside-tolerance');
  });

  it('awards a clean run only with zero blocked moves', () => {
    expect(earnedBy(facts({ blockedMoves: 0 }))).toContain('no-contact');
    expect(earnedBy(facts({ blockedMoves: 1 }))).not.toContain('no-contact');
  });

  it('rewards persistence at the tenth attempt', () => {
    expect(earnedBy(facts({ attempt: 9 }))).not.toContain('raised-again');
    expect(earnedBy(facts({ attempt: 10 }))).toContain('raised-again');
  });

  it('closes a sector only when every issued order in it is closed', () => {
    expect(earnedBy(facts({ worldResults: [closed(Medal.Bronze), open] }))).not.toContain(
      'sector-nominal',
    );
    expect(
      earnedBy(facts({ worldResults: [closed(Medal.Bronze), closed(Medal.Silver)] })),
    ).toContain('sector-nominal');
  });

  it('awards a perfect sector only on all gold', () => {
    expect(earnedBy(facts({ worldResults: [closed(Medal.Gold), closed(Medal.Silver)] }))).not
      .toContain('sector-gold');
    expect(earnedBy(facts({ worldResults: [closed(Medal.Gold), closed(Medal.Gold)] }))).toContain(
      'sector-gold',
    );
  });

  it('never awards a sector from an empty world', () => {
    expect(earnedBy(facts({ worldResults: [] }))).not.toContain('sector-nominal');
  });

  it('counts an ungraded order as closed and as gold, so a sector stays winnable', () => {
    expect(earnedBy(facts({ worldResults: [closed(Medal.Gold), ungraded] }))).toContain(
      'sector-nominal',
    );
    expect(earnedBy(facts({ worldResults: [closed(Medal.Gold), ungraded] }))).toContain(
      'sector-gold',
    );
  });

  it('does not close a sector on an ungraded order still on the bench', () => {
    expect(
      earnedBy(facts({ worldResults: [closed(Medal.Gold), { medal: null, closed: false }] })),
    ).not.toContain('sector-nominal');
  });

  it('pays no gold and no half-budget commendation on an ungraded order', () => {
    /* `w6-01` is the live case: par 1, and the only solution costs 0 ticks. */
    const earned = earnedBy(facts({ medal: null, ticks: 0, parTicks: 1 }));
    expect(earned).not.toContain('within-budget');
    expect(earned).not.toContain('outside-tolerance');
    expect(earned).toContain('filed');
  });

  it('still lowers a personal best on an ungraded order', () => {
    expect(earnedBy(facts({ medal: null, ticks: 20, previousBestTicks: 24 }))).toContain(
      'revised-downward',
    );
  });

  it('awards the bonus star commendation from stars, not from the medal', () => {
    expect(earnedBy(facts({ stars: 0 }))).not.toContain('there-is-a-star');
    expect(earnedBy(facts({ stars: 1 }))).toContain('there-is-a-star');
  });
});

describe('isSenseBudget', () => {
  it('recognises a withinSenses objective id', () => {
    expect(isSenseBudget('within-10-probe')).toBe(true);
    expect(isSenseBudget('within-4-scan')).toBe(true);
  });

  it('does not mistake a tick or op budget for restraint', () => {
    expect(isSenseBudget('within-40-ticks')).toBe(false);
    expect(isSenseBudget('within-900-ops')).toBe(false);
  });

  it('ignores anything that is not a budget id at all', () => {
    expect(isSenseBudget('all-crops-harvested')).toBe(false);
    expect(isSenseBudget('')).toBe(false);
  });
});
