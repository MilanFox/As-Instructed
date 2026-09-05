import { describe, expect, it } from 'vitest';
import type { RunFacts } from '../achievements.ts';
import {
  ACHIEVEMENTS,
  RETIRED_ACHIEVEMENTS,
  earnedBy,
  getAchievement,
  isSenseBudget,
} from '../achievements.ts';

function facts(patch: Partial<RunFacts> = {}): RunFacts {
  return {
    passed: true,
    attempt: 3,
    senseBudgetMet: false,
    returnedForStar: false,
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
      facts({ attempt: 10, senseBudgetMet: true, returnedForStar: true }),
    );
    for (const id of everything) expect(getAchievement(id), id).toBeDefined();
  });

  /*
   * An id cannot be live and retired at once: `save.ts` drops the retired set on read, so a
   * commendation reissued under an id this build had already retired would be awarded on the run
   * and gone again by the next load.
   */
  it('offers no id that saves are told to drop', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(RETIRED_ACHIEVEMENTS.has(achievement.id), achievement.id).toBe(false);
    }
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

  it('pays the information budget only where one was offered and met', () => {
    expect(earnedBy(facts({ senseBudgetMet: true }))).toContain('minimal-observation');
    expect(earnedBy(facts({ senseBudgetMet: false }))).not.toContain('minimal-observation');
  });

  it('awards nothing at all for a failed run', () => {
    expect(earnedBy(facts({ passed: false, attempt: 10, senseBudgetMet: true }))).toEqual([]);
  });

  /* The ordinary close earns nothing, which is the point of a list of five. */
  it('awards nothing for closing a work order on the second run', () => {
    expect(earnedBy(facts({ attempt: 2 }))).toEqual([]);
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
