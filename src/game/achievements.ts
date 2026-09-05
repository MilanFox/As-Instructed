/**
 * Commendations — the game's achievements, written as things Personnel would print.
 *
 * Three rules govern the list:
 *  1. **Nothing is ever gated behind one.** A commendation is a note on a record. It does not
 *     unlock a level, a hint, a doc page, or a piece of hardware, and it never will.
 *  2. **The requirement is public before it is met.** A secret achievement is a thing you find out
 *     you failed at, which is the opposite of the point.
 *  3. **None of them can be lost.** Once earned, the timestamp is in the save forever, and no run
 *     — however bad — takes one back.
 *
 * Evaluation is pure: `earnedBy` takes a snapshot of what just happened and returns ids. The store
 * owns the save; this module owns the rules.
 */
import { Medal } from '../engine/index.ts';

export interface Achievement {
  id: string;
  /** As Personnel would head the line. Short, flat, no exclamation. */
  title: string;
  /** What has to be true. Plain language — this is read by someone deciding whether to try. */
  requirement: string;
  /** The commendation itself, house cadence: a flat statement then a flatter qualifier. */
  note: string;
}

/**
 * Sensing commands, for recognising a met information budget from its objective id.
 *
 * `Objectives.withinSenses(name, n)` mints the id `within-<n>-<name>`, which is also the shape
 * `withinTicks` and `withinOps` produce — so the tail has to be a command the bot actually has,
 * or "finish within 40 ticks" would read as an act of restraint.
 */
const SENSING_COMMANDS: readonly string[] = [
  'scan',
  'probe',
  'look',
  'pos',
  'canMove',
  'carrying',
  'inventory',
  'readMark',
  'receive',
];

const SENSE_BUDGET_ID = /^within-\d+-([A-Za-z]+)$/;

export function isSenseBudget(objectiveId: string): boolean {
  const match = SENSE_BUDGET_ID.exec(objectiveId);
  return match ? SENSING_COMMANDS.includes(match[1] as string) : false;
}

/** Half of par, the threshold the elegant-solve commendation hangs on. */
export const ELEGANT_FACTOR = 0.5;

/** Runs on one work order before a close still counts as persistence rather than as noise. */
export const PERSISTENCE_ATTEMPTS = 10;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'filed',
    title: 'FILED',
    requirement: 'Close your first work order.',
    note: 'One work order closed. A number moved, and the site considers that the whole of it.',
  },
  {
    id: 'within-budget',
    title: 'WITHIN BUDGET',
    requirement: 'Take a gold result on any work order.',
    note: 'Gold. Finance have asked whether the budget was set correctly. It was.',
  },
  {
    id: 'first-run',
    title: 'AS PER THE BRIEF',
    requirement: 'Close a work order on the first Run.',
    note: 'Closed on the first run. Dot has read the trace twice and found nothing to correct.',
  },
  {
    id: 'revised-downward',
    title: 'REVISED DOWNWARD',
    requirement: 'Beat your own recorded tick count on a work order.',
    note: 'Your own figure, lowered by you. The old figure has been retained, as they all are.',
  },
  {
    id: 'outside-tolerance',
    title: 'OUTSIDE OF TOLERANCE',
    requirement: 'Close a work order in under half its tick budget.',
    note: 'Half the budget, all of the work. Par has not been adjusted. Par will be adjusted.',
  },
  {
    id: 'no-contact',
    title: 'NO CONTACT REPORTED',
    requirement: 'Close a work order without a single blocked move.',
    note: 'Not one blocked move in the whole run. The walls have filed nothing.',
  },
  {
    id: 'minimal-observation',
    title: 'MINIMAL OBSERVATION',
    requirement: 'Meet an information budget — sense no more than a work order allows.',
    note: 'You looked less and knew more. Procurement have deprioritised the sensor upgrade.',
  },
  {
    id: 'there-is-a-star',
    title: 'THERE IS NO BONUS',
    requirement: 'Meet a bonus objective.',
    note: 'Bonus met. There is no bonus. There is a star.',
  },
  {
    id: 'streak-3',
    title: 'THREE NOMINAL SHIFTS',
    requirement: 'Close three work orders in a row without a failed run.',
    note: 'Three closed, none reopened. Scheduling would like to know how, and will not ask.',
  },
  {
    id: 'streak-5',
    title: 'AN UNINTERRUPTED WEEK',
    requirement: 'Close five work orders in a row without a failed run.',
    note: 'Five clean shifts. The last recorded instance was in 2204 and is disputed.',
  },
  {
    id: 'raised-again',
    title: 'RAISED, AND RAISED AGAIN',
    requirement: `Close a work order on your ${PERSISTENCE_ATTEMPTS}th run or later.`,
    note: 'Ten runs, then a closed work order. Attempts are not recorded against you.',
  },
  {
    id: 'sector-nominal',
    title: 'SECTOR NOMINAL',
    requirement: 'Close every issued work order in one world.',
    note: 'A whole sector closed. Facilities have been informed and have acknowledged receipt.',
  },
  {
    id: 'sector-gold',
    title: 'THE BUDGETS WERE SET CORRECTLY',
    requirement: 'Take gold on every issued work order in one world.',
    note: 'Gold across a sector. The budgets are now under review, which is the thanks you get.',
  },
  {
    id: 'repository',
    title: 'ADDED TO THE REPOSITORY',
    requirement: 'Publish a function to the shared subroutine repository.',
    note: "One subroutine, published. It is now everybody's, which was always the intention.",
  },
  {
    id: 'no-regressions',
    title: 'NO REGRESSIONS AT THIS TIME',
    requirement: 'Finish a regression pass with nothing broken.',
    note: 'Every closed order re-run, nothing broke. Legal have asked for that in writing.',
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function getAchievement(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

/**
 * Everything a finished run knows about itself, flattened.
 *
 * Deliberately not a `Verdict`: the interesting facts are comparisons against the *save* (was this
 * a personal best, is the world now closed), and the verdict cannot see the save.
 */
export interface RunFacts {
  passed: boolean;
  medal: Medal;
  ticks: number;
  parTicks: number;
  /** Runs on this work order including this one. */
  attempt: number;
  /** `move` events in the trace that reported `ok: false`. */
  blockedMoves: number;
  /** Bonus objective ids met on this run. */
  stars: number;
  /** A `withinSenses` objective was offered and met. */
  senseBudgetMet: boolean;
  /** The recorded best before this run, when there was one. */
  previousBestTicks?: number;
  /** Consecutive closes with no failed run in between, counting this one. */
  streak: number;
  /** Medals across every issued work order in this world, with this result already folded in. */
  worldMedals: readonly Medal[];
}

/**
 * The commendation ids this run earns. Order is the order they will be shown in.
 *
 * Returns every id the run qualifies for, including ones already in the save — deduplication is
 * the store's job, because only the store knows what has been awarded before.
 */
export function earnedBy(facts: RunFacts): string[] {
  if (!facts.passed) return [];

  const earned: string[] = ['filed'];

  if (facts.medal === Medal.Gold) earned.push('within-budget');
  if (facts.attempt === 1) earned.push('first-run');
  if (facts.previousBestTicks !== undefined && facts.ticks < facts.previousBestTicks) {
    earned.push('revised-downward');
  }
  if (facts.parTicks > 0 && facts.ticks < facts.parTicks * ELEGANT_FACTOR) {
    earned.push('outside-tolerance');
  }
  if (facts.blockedMoves === 0) earned.push('no-contact');
  if (facts.senseBudgetMet) earned.push('minimal-observation');
  if (facts.stars > 0) earned.push('there-is-a-star');
  if (facts.streak >= 3) earned.push('streak-3');
  if (facts.streak >= 5) earned.push('streak-5');
  if (facts.attempt >= PERSISTENCE_ATTEMPTS) earned.push('raised-again');

  const world = facts.worldMedals;
  if (world.length > 0 && world.every((medal) => medal !== Medal.None)) {
    earned.push('sector-nominal');
    if (world.every((medal) => medal === Medal.Gold)) earned.push('sector-gold');
  }

  return earned;
}
