import { describe, expect, it } from 'vitest';
import { Medal } from '../../engine/index.ts';
import type { RunFacts } from '../achievements.ts';
import { ACHIEVEMENTS, earnedBy, getAchievement, isSenseBudget } from '../achievements.ts';

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
    streak: 1,
    worldMedals: [Medal.Bronze, Medal.None],
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
        streak: 9,
        worldMedals: [Medal.Gold, Medal.Gold],
      }),
    );
    for (const id of everything) expect(getAchievement(id), id).toBeDefined();
  });
});

describe('earnedBy', () => {
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

  it('awards the streaks at exactly three and five', () => {
    expect(earnedBy(facts({ streak: 2 }))).not.toContain('streak-3');
    expect(earnedBy(facts({ streak: 3 }))).toContain('streak-3');
    expect(earnedBy(facts({ streak: 4 }))).not.toContain('streak-5');
    expect(earnedBy(facts({ streak: 5 }))).toContain('streak-5');
    expect(earnedBy(facts({ streak: 6 }))).toEqual(
      expect.arrayContaining(['streak-3', 'streak-5']),
    );
  });

  it('rewards persistence at the tenth attempt', () => {
    expect(earnedBy(facts({ attempt: 9 }))).not.toContain('raised-again');
    expect(earnedBy(facts({ attempt: 10 }))).toContain('raised-again');
  });

  it('closes a sector only when every issued order in it has a medal', () => {
    expect(earnedBy(facts({ worldMedals: [Medal.Bronze, Medal.None] }))).not.toContain(
      'sector-nominal',
    );
    expect(earnedBy(facts({ worldMedals: [Medal.Bronze, Medal.Silver] }))).toContain(
      'sector-nominal',
    );
  });

  it('awards a perfect sector only on all gold', () => {
    expect(earnedBy(facts({ worldMedals: [Medal.Gold, Medal.Silver] }))).not.toContain(
      'sector-gold',
    );
    expect(earnedBy(facts({ worldMedals: [Medal.Gold, Medal.Gold] }))).toContain('sector-gold');
  });

  it('never awards a sector from an empty world', () => {
    expect(earnedBy(facts({ worldMedals: [] }))).not.toContain('sector-nominal');
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
