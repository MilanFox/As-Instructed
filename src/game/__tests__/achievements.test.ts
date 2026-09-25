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
    world: 3,
    ticks: 40,
    parTicks: 40,
    beatOwnBest: false,
    seeds: 3,
    seedsPassed: 3,
    moves: 30,
    sensed: 12,
    printed: false,
    markedUnread: false,
    emptyProgram: false,
    unchanged: false,
    routineCalled: false,
    routineOrders: 0,
    singleCall: false,
    sameProgramOtherSector: false,
    sectorClosed: false,
    sectorsClosed: 0,
    sectorAtPar: false,
    sectorStarred: false,
    siteClosed: false,
    siteStarred: false,
    ...patch,
  };
}

describe('the achievement list', () => {
  it('has no duplicate ids', () => {
    const ids = ACHIEVEMENTS.map((achievement) => achievement.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every achievement a title, a requirement and a note', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.title.length, achievement.id).toBeGreaterThan(0);
      expect(achievement.requirement.length, achievement.id).toBeGreaterThan(0);
      expect(achievement.note.length, achievement.id).toBeGreaterThan(0);
    }
  });

  it('never restates a medal', () => {
    const medals = /\b(gold|silver|bronze|medal)\b/i;
    for (const achievement of ACHIEVEMENTS) {
      const line = `${achievement.title} ${achievement.requirement} ${achievement.note}`;
      expect(medals.test(line), achievement.id).toBe(false);
    }
  });

  it('never exclaims', () => {
    for (const achievement of ACHIEVEMENTS) {
      const line = `${achievement.title} ${achievement.requirement} ${achievement.note}`;
      expect(line.includes('!'), achievement.id).toBe(false);
    }
  });

  it('offers no id that saves are told to drop', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(RETIRED_ACHIEVEMENTS.has(achievement.id), achievement.id).toBe(false);
    }
  });

  it('keeps enough of the list on the shelf to be worth opening', () => {
    const listed = ACHIEVEMENTS.filter((achievement) => achievement.hidden !== true);
    expect(listed.length).toBeGreaterThan(ACHIEVEMENTS.length / 3);
  });

  it('resolves every id `earnedBy` can return', () => {
    for (const id of everythingEarned()) expect(getAchievement(id), id).toBeDefined();
  });

  it('can award every achievement it prints', () => {
    const reachable = new Set(everythingEarned());
    const granted = new Set(['built-on-it', 'swept-clean', 'peeked', 'first-hint', 'every-hint']);
    const unreachable = ACHIEVEMENTS.map((achievement) => achievement.id).filter(
      (id) => !granted.has(id) && !reachable.has(id),
    );
    expect(unreachable).toEqual([]);
  });
});

function everythingEarned(): string[] {
  const runs: Partial<RunFacts>[] = [
    { attempt: 1, senseBudgetMet: true, beatOwnBest: true },
    { ticks: 10, parTicks: 40, moves: 0, printed: true, markedUnread: true },
    { ticks: 400, parTicks: 40, routineCalled: true, singleCall: true },
    { routineOrders: 4, sameProgramOtherSector: true },
    { sectorClosed: true, sectorsClosed: 6, sectorAtPar: true },
    { sectorStarred: true, siteClosed: true, siteStarred: true },
    { passed: false, emptyProgram: true, unchanged: true },
    { passed: false, seeds: 5, seedsPassed: 1 },
    { world: 8 },
    { seeds: 4, sensed: 0 },
  ];
  return runs.flatMap((patch) => earnedBy(facts(patch)));
}

describe('earnedBy, on a closed work order', () => {
  it('pays a first-run close only where several layouts had to agree', () => {
    expect(earnedBy(facts({ attempt: 1, seeds: 3 }))).toContain('first-dispatch');
    expect(earnedBy(facts({ attempt: 2, seeds: 3 }))).not.toContain('first-dispatch');
    expect(earnedBy(facts({ attempt: 1, seeds: 1 }))).not.toContain('first-dispatch');
  });

  it('pays the information budget only where one was offered and met', () => {
    expect(earnedBy(facts({ senseBudgetMet: true }))).toContain('minimal-observation');
    expect(earnedBy(facts({ senseBudgetMet: false }))).not.toContain('minimal-observation');
  });

  it('notices a run under par and a run at ten times par', () => {
    expect(earnedBy(facts({ ticks: 39, parTicks: 40 }))).toContain('under-the-estimate');
    expect(earnedBy(facts({ ticks: 40, parTicks: 40 }))).not.toContain('under-the-estimate');
    expect(earnedBy(facts({ ticks: 400, parTicks: 40 }))).toContain('outside-the-estimate');
    expect(earnedBy(facts({ ticks: 399, parTicks: 40 }))).not.toContain('outside-the-estimate');
  });

  it('reads no par at all on an ungraded work order', () => {
    const ungraded = earnedBy(facts({ ticks: 4000, parTicks: null }));
    expect(ungraded).not.toContain('outside-the-estimate');
    expect(earnedBy(facts({ ticks: 1, parTicks: null }))).not.toContain('under-the-estimate');
  });

  it('notices a re-close that came in faster than the one before it', () => {
    expect(earnedBy(facts({ beatOwnBest: true }))).toContain('own-estimate');
    expect(earnedBy(facts({ beatOwnBest: false }))).not.toContain('own-estimate');
  });

  it('notices the repository doing part of the work, and doing it repeatedly', () => {
    expect(earnedBy(facts({ routineCalled: true }))).toContain('off-the-shelf');
    expect(earnedBy(facts({ routineCalled: false }))).not.toContain('off-the-shelf');
    expect(earnedBy(facts({ routineOrders: 3 }))).not.toContain('in-service');
    expect(earnedBy(facts({ routineOrders: 4 }))).toContain('in-service');
  });

  it('asks a one-line program to be a call on the repository, not just one line', () => {
    expect(earnedBy(facts({ singleCall: true, routineCalled: true }))).toContain('the-whole-thing');
    expect(earnedBy(facts({ singleCall: true, routineCalled: false }))).not.toContain(
      'the-whole-thing',
    );
    expect(earnedBy(facts({ singleCall: false, routineCalled: true }))).not.toContain(
      'the-whole-thing',
    );
  });

  it('notices one program filed against two sectors', () => {
    expect(earnedBy(facts({ sameProgramOtherSector: true }))).toContain('one-program-two-sectors');
    expect(earnedBy(facts({ sameProgramOtherSector: false }))).not.toContain(
      'one-program-two-sectors',
    );
  });

  it('closes out a sector and the whole site', () => {
    expect(earnedBy(facts({ sectorClosed: true }))).toContain('sector-closed');
    expect(earnedBy(facts({ sectorStarred: true }))).toContain('sector-starred');
    expect(earnedBy(facts({ siteClosed: true }))).toContain('site-closed');
    expect(earnedBy(facts({ siteStarred: true }))).toContain('site-starred');
    expect(earnedBy(facts())).not.toEqual(expect.arrayContaining(['sector-closed', 'site-closed']));
  });

  it('marks the second, fourth and sixth sector and nothing in between', () => {
    expect(earnedBy(facts({ sectorsClosed: 1 }))).toEqual([]);
    expect(earnedBy(facts({ sectorsClosed: 2 }))).toEqual(['two-sectors']);
    expect(earnedBy(facts({ sectorsClosed: 3 }))).toEqual(['two-sectors']);
    expect(earnedBy(facts({ sectorsClosed: 4 }))).toEqual(['two-sectors', 'four-sectors']);
    expect(earnedBy(facts({ sectorsClosed: 6 }))).toEqual([
      'two-sectors',
      'four-sectors',
      'six-sectors',
    ]);
  });

  it('pays a sector that came in on estimate only once every order in it did', () => {
    expect(earnedBy(facts({ sectorAtPar: true }))).toContain('sector-on-estimate');
    expect(earnedBy(facts({ sectorAtPar: false }))).not.toContain('sector-on-estimate');
  });

  it('marks the eighth sector on a close, not on a dispatch', () => {
    expect(earnedBy(facts({ world: 8 }))).toContain('last-sector');
    expect(earnedBy(facts({ world: 7 }))).not.toContain('last-sector');
    expect(earnedBy(facts({ world: 8, passed: false }))).not.toContain('last-sector');
  });

  it('notices the diagnostics nobody took back out', () => {
    expect(earnedBy(facts({ printed: true }))).toContain('diagnostics-retained');
    expect(earnedBy(facts({ printed: false }))).not.toContain('diagnostics-retained');
  });

  it('notices a bot that never went anywhere', () => {
    expect(earnedBy(facts({ moves: 0 }))).toContain('did-not-move');
    expect(earnedBy(facts({ moves: 1 }))).not.toContain('did-not-move');
  });

  it('notices a mark that was written and never read back', () => {
    expect(earnedBy(facts({ markedUnread: true }))).toContain('note-on-the-ground');
    expect(earnedBy(facts({ markedUnread: false }))).not.toContain('note-on-the-ground');
  });

  it('awards nothing for closing a work order on the second run', () => {
    expect(earnedBy(facts({ attempt: 2 }))).toEqual([]);
  });
});

describe('earnedBy, on a run that did not close', () => {
  const failed = (patch: Partial<RunFacts> = {}): string[] =>
    earnedBy(facts({ passed: false, ...patch }));

  it('still notices an empty program', () => {
    expect(failed({ emptyProgram: true })).toContain('empty-dispatch');
    expect(failed({ emptyProgram: false })).not.toContain('empty-dispatch');
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

  it('takes nothing that needs the order closed', () => {
    expect(failed({ attempt: 1, senseBudgetMet: true, ticks: 1, moves: 0, world: 8 })).toEqual([]);
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
