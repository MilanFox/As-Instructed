/**
 * Commendations — the game's achievements, written as things Personnel would print.
 *
 * Four rules govern the list:
 *  1. **Nothing is ever gated behind one.** A commendation is a note on a record. It does not
 *     unlock a level, a hint, a doc page, or a piece of hardware, and it never will.
 *  2. **The requirement is public before it is met.** A secret achievement is a thing you find out
 *     you failed at, which is the opposite of the point.
 *  3. **None of them can be lost.** Once earned, the timestamp is in the save forever, and no run
 *     — however bad — takes one back.
 *  4. **Each one names something the player did that they would be pleased to have noticed.** Not
 *     attendance, not completion, and never a restatement of the medal already on the screen. Both
 *     playtesters reported that a list of fifteen changed their behaviour zero times, so the list
 *     is five, and the bar for a sixth is that it survives this rule.
 *
 * Evaluation is pure: `earnedBy` takes a snapshot of what just happened and returns ids. The store
 * owns the save; this module owns the rules.
 */

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

/** Runs on one work order before a close still counts as persistence rather than as noise. */
export const PERSISTENCE_ATTEMPTS = 10;

export const SECOND_LOOK_ATTEMPTS = 4;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'second-look',
    title: 'A SECOND LOOK, AND A THIRD',
    requirement: `Close a work order on your ${SECOND_LOOK_ATTEMPTS}th run or later.`,
    note: 'Four runs, one closed order. The runs in between are not filed anywhere.',
  },
  {
    id: 'raised-again',
    title: 'RAISED, AND RAISED AGAIN',
    requirement: `Close a work order on your ${PERSISTENCE_ATTEMPTS}th run or later.`,
    note: 'Ten runs, then a closed work order. Attempts are not recorded against you.',
  },
  {
    id: 'came-back-for-it',
    title: 'REOPENED ON PURPOSE',
    requirement: 'Meet a bonus objective on a work order you had already closed.',
    note: 'The order was closed. You reopened it anyway. Scheduling has stopped asking why.',
  },
  {
    id: 'minimal-observation',
    title: 'MINIMAL OBSERVATION',
    requirement: 'Meet an information budget — sense no more than a work order allows.',
    note: 'You looked less and knew more. Procurement have deprioritised the sensor upgrade.',
  },
  {
    id: 'repository',
    title: 'ADDED TO THE REPOSITORY',
    requirement: 'Publish a function to the shared subroutine repository.',
    note: "One subroutine, published. It is now everybody's, which was always the intention.",
  },
];

/**
 * Commendations this build has retired, so that a save written by a build that had them can be
 * read without carrying a dead award forward.
 *
 * This is the whitelist-on-read pattern `save.ts` already uses for a medal on a level that no
 * longer carries one, and it exists for the same reason: the drop belongs in one place, on read,
 * rather than at every screen that counts. It is deliberately a *named* list rather than "anything
 * not in `ACHIEVEMENTS`" — an id this build has never heard of belongs to a build that is not this
 * one, and a player who downgrades must not have their record eaten by the older binary.
 */
export const RETIRED_ACHIEVEMENTS: ReadonlySet<string> = new Set([
  'filed',
  'within-budget',
  'first-run',
  'revised-downward',
  'outside-tolerance',
  'no-contact',
  'there-is-a-star',
  'sector-nominal',
  'sector-gold',
  'no-regressions',
]);

const BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function getAchievement(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

/**
 * Everything a finished run knows about itself that a commendation reads.
 *
 * Deliberately not a `Verdict`: two of these are comparisons against the *save* — how many times
 * this order has been run, and whether it was already closed — and the verdict cannot see the save.
 *
 * There is no medal here, and that is the point rather than an omission. A level may be ungraded
 * (DESIGN.md §11 A7) and carry no medal at all; the two commendations that read par as a ladder
 * were the two that had to be taught about that, and both were cut. Nothing left needs to know.
 */
export interface RunFacts {
  passed: boolean;
  /** Runs on this work order including this one. */
  attempt: number;
  /** A `withinSenses` objective was offered and met. */
  senseBudgetMet: boolean;
  /** A bonus met on a work order that was already closed, and had no star before. */
  returnedForStar: boolean;
}

/**
 * The commendation ids this run earns. Order is the order they will be shown in.
 *
 * Returns every id the run qualifies for, including ones already in the save — deduplication is
 * the store's job, because only the store knows what has been awarded before. A passing run that
 * earns nothing is the ordinary case and returns an empty list.
 */
export function earnedBy(facts: RunFacts): string[] {
  if (!facts.passed) return [];

  const earned: string[] = [];

  if (facts.attempt >= SECOND_LOOK_ATTEMPTS) earned.push('second-look');
  if (facts.attempt >= PERSISTENCE_ATTEMPTS) earned.push('raised-again');
  if (facts.returnedForStar) earned.push('came-back-for-it');
  if (facts.senseBudgetMet) earned.push('minimal-observation');

  return earned;
}
