import { describe, expect, it } from 'vitest';
import type { RunFacts } from '../achievements.ts';
import {
  ACHIEVEMENTS,
  RETIRED_ACHIEVEMENTS,
  earnedBy,
  getAchievement,
  isSenseBudget,
} from '../achievements.ts';

/**
 * A run that earns nothing.
 *
 * Every default is the boring answer: it passed, on the third go, on a mid-campaign work order,
 * at par, with a program that moved a bit and did nothing remarkable. A test that earns something
 * says which fact earned it, and no test has to restate the other twenty-five.
 */
function facts(patch: Partial<RunFacts> = {}): RunFacts {
  return {
    passed: true,
    attempt: 3,
    senseBudgetMet: false,
    returnedForStar: false,
    world: 3,
    ticks: 40,
    ops: 400,
    parTicks: 40,
    seeds: 3,
    seedsPassed: 3,
    waited: 0,
    moves: 30,
    turnsInPlace: 1,
    onOneTile: 1,
    printed: false,
    markedUnread: false,
    emptyProgram: false,
    wroteComment: false,
    unchanged: false,
    routineCalled: false,
    routineOrders: 0,
    sectorClosed: false,
    sectorStarred: false,
    siteClosed: false,
    siteStarred: false,
    unclosedRuns: 4,
    hour: 14,
    laterDay: false,
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

  /*
   * Rule 5's one prohibition, and the only one a machine can check. A commendation that says
   * "gold" is restating the certificate the player is already holding.
   */
  it('never restates a medal', () => {
    const medals = /\b(gold|silver|bronze|medal)\b/i;
    for (const achievement of ACHIEVEMENTS) {
      const line = `${achievement.title} ${achievement.requirement} ${achievement.note}`;
      expect(medals.test(line), achievement.id).toBe(false);
    }
  });

  /* NARRATIVE.md §1.2: the company is never excited. Personnel least of all. */
  it('never exclaims', () => {
    for (const achievement of ACHIEVEMENTS) {
      const line = `${achievement.title} ${achievement.requirement} ${achievement.note}`;
      expect(line.includes('!'), achievement.id).toBe(false);
    }
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

  /* Rule 2. A hidden one is unreachable from the shelf, so it must never be a thing to aim at. */
  it('keeps enough of the list on the shelf to be worth opening', () => {
    const listed = ACHIEVEMENTS.filter((achievement) => achievement.hidden !== true);
    expect(listed.length).toBeGreaterThan(ACHIEVEMENTS.length / 3);
  });

  it('resolves every id `earnedBy` can return', () => {
    for (const id of everythingEarned()) expect(getAchievement(id), id).toBeDefined();
  });

  /* The list and the evaluator are two halves of one thing, and a line nothing can award is a
     promise the game does not keep. `repository` is the exception: it is raised by the Repository
     through `store.award`, because `src/game` may not see `src/meta`. */
  it('can award every commendation it prints', () => {
    const reachable = new Set(everythingEarned());
    const unreachable = ACHIEVEMENTS.map((achievement) => achievement.id).filter(
      (id) => id !== 'repository' && !reachable.has(id),
    );
    expect(unreachable).toEqual([]);
  });
});

/** Every id any run can produce, gathered from the runs the suite below builds. */
function everythingEarned(): string[] {
  const runs: Partial<RunFacts>[] = [
    { attempt: 10, senseBudgetMet: true, returnedForStar: true },
    { ticks: 10, parTicks: 40, waited: 8, moves: 0, printed: true },
    { ticks: 400, parTicks: 40, onOneTile: 20, turnsInPlace: 4, markedUnread: true },
    { ops: 1_000_000, routineCalled: true, routineOrders: 4 },
    { sectorClosed: true, sectorStarred: true, siteClosed: true, siteStarred: true },
    { passed: false, emptyProgram: true, wroteComment: true, unchanged: true },
    { passed: false, seeds: 5, seedsPassed: 1 },
    { world: 8, unclosedRuns: 100, hour: 4, laterDay: true },
  ];
  return runs.flatMap((patch) => earnedBy(facts(patch)));
}

describe('earnedBy, on a closed work order', () => {
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

  it('notices a run at half par and a run at ten times par', () => {
    expect(earnedBy(facts({ ticks: 20, parTicks: 40 }))).toContain('under-the-estimate');
    expect(earnedBy(facts({ ticks: 21, parTicks: 40 }))).not.toContain('under-the-estimate');
    expect(earnedBy(facts({ ticks: 400, parTicks: 40 }))).toContain('outside-the-estimate');
    expect(earnedBy(facts({ ticks: 399, parTicks: 40 }))).not.toContain('outside-the-estimate');
  });

  /*
   * DESIGN.md §11 A7. A work order may carry no par at all, and the two entries that read one are
   * the only place that could break on it. They read `null` and decline rather than dividing by it.
   */
  it('reads no par at all on an ungraded work order', () => {
    const ungraded = earnedBy(facts({ ticks: 4000, parTicks: null }));
    expect(ungraded).not.toContain('outside-the-estimate');
    expect(earnedBy(facts({ ticks: 1, parTicks: null }))).not.toContain('under-the-estimate');
  });

  it('notices the repository doing part of the work, and doing it repeatedly', () => {
    expect(earnedBy(facts({ routineCalled: true }))).toContain('off-the-shelf');
    expect(earnedBy(facts({ routineCalled: false }))).not.toContain('off-the-shelf');
    expect(earnedBy(facts({ routineOrders: 3 }))).not.toContain('in-service');
    expect(earnedBy(facts({ routineOrders: 4 }))).toContain('in-service');
  });

  it('closes out a sector and the whole site', () => {
    expect(earnedBy(facts({ sectorClosed: true }))).toContain('sector-closed');
    expect(earnedBy(facts({ sectorStarred: true }))).toContain('sector-starred');
    expect(earnedBy(facts({ siteClosed: true }))).toContain('site-closed');
    expect(earnedBy(facts({ siteStarred: true }))).toContain('site-starred');
    expect(earnedBy(facts())).not.toEqual(expect.arrayContaining(['sector-closed', 'site-closed']));
  });

  it('notices the diagnostics nobody took back out', () => {
    expect(earnedBy(facts({ printed: true }))).toContain('diagnostics-retained');
    expect(earnedBy(facts({ printed: false }))).not.toContain('diagnostics-retained');
  });

  it('notices a bot that never went anywhere', () => {
    expect(earnedBy(facts({ moves: 0 }))).toContain('did-not-move');
    expect(earnedBy(facts({ moves: 1 }))).not.toContain('did-not-move');
  });

  it('notices a shift spent mostly holding still', () => {
    expect(earnedBy(facts({ ticks: 40, waited: 21 }))).toContain('standing-still');
    expect(earnedBy(facts({ ticks: 40, waited: 20 }))).not.toContain('standing-still');
    expect(earnedBy(facts({ ticks: 0, waited: 0 }))).not.toContain('standing-still');
  });

  it('notices a mark that was written and never read back', () => {
    expect(earnedBy(facts({ markedUnread: true }))).toContain('note-on-the-ground');
    expect(earnedBy(facts({ markedUnread: false }))).not.toContain('note-on-the-ground');
  });

  it('notices twenty goes at the same tile', () => {
    expect(earnedBy(facts({ onOneTile: 19 }))).not.toContain('one-tile');
    expect(earnedBy(facts({ onOneTile: 20 }))).toContain('one-tile');
  });

  it('notices a bot turning all the way around', () => {
    expect(earnedBy(facts({ turnsInPlace: 3 }))).not.toContain('full-revolution');
    expect(earnedBy(facts({ turnsInPlace: 4 }))).toContain('full-revolution');
  });

  it('notices a million operations', () => {
    expect(earnedBy(facts({ ops: 999_999 }))).not.toContain('considerable-computation');
    expect(earnedBy(facts({ ops: 1_000_000 }))).toContain('considerable-computation');
  });

  /* The ordinary close earns nothing. Most closes are ordinary and that is the point. */
  it('awards nothing for closing a work order on the second run', () => {
    expect(earnedBy(facts({ attempt: 2 }))).toEqual([]);
  });
});

/*
 * Rule 4. A failed run is still a run, and the things a player does that are worth noticing are
 * mostly things the bot did not survive. Nothing below asks whether the order closed.
 */
describe('earnedBy, on a run that did not close', () => {
  const failed = (patch: Partial<RunFacts> = {}): string[] =>
    earnedBy(facts({ passed: false, ...patch }));

  it('still notices an empty program', () => {
    expect(failed({ emptyProgram: true })).toContain('empty-dispatch');
    expect(failed({ emptyProgram: false })).not.toContain('empty-dispatch');
  });

  it('still notices a comment the player wrote', () => {
    expect(failed({ wroteComment: true })).toContain('left-a-comment');
    expect(failed({ wroteComment: false })).not.toContain('left-a-comment');
  });

  it('still notices the same program sent twice', () => {
    expect(failed({ unchanged: true })).toContain('resubmitted');
    expect(failed({ unchanged: false })).not.toContain('resubmitted');
  });

  it('notices a program that was right on exactly one layout', () => {
    expect(failed({ seeds: 5, seedsPassed: 1 })).toContain('one-layout');
    expect(failed({ seeds: 5, seedsPassed: 2 })).not.toContain('one-layout');
    expect(failed({ seeds: 1, seedsPassed: 1 })).not.toContain('one-layout');
  });

  it('notices arriving in the eighth sector', () => {
    expect(failed({ world: 8 })).toContain('last-sector');
    expect(failed({ world: 7 })).not.toContain('last-sector');
  });

  it('notices a hundred runs that went nowhere', () => {
    expect(failed({ unclosedRuns: 99 })).not.toContain('hundred-runs');
    expect(failed({ unclosedRuns: 100 })).toContain('hundred-runs');
  });

  it('notices a dispatch in the small hours', () => {
    expect(failed({ hour: 4 })).toContain('core-hours');
    expect(failed({ hour: 1 })).not.toContain('core-hours');
    expect(failed({ hour: 5 })).not.toContain('core-hours');
  });

  it('notices somebody coming back another day', () => {
    expect(failed({ laterDay: true })).toContain('came-back');
    expect(failed({ laterDay: false })).not.toContain('came-back');
  });

  /* It costs nothing. It never has. */
  it('takes nothing that needs the order closed', () => {
    expect(failed({ attempt: 10, senseBudgetMet: true, ticks: 1, moves: 0 })).toEqual([]);
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
