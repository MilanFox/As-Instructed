/**
 * Scoring, as the player sees it. DESIGN.md §7 and §7.
 *
 * `Verdict.stats` is the engine's, and it wins wherever the two overlap; this module is what the
 * shell uses for the live readouts, the medal wall and the Performance Review, and it must agree
 * with the engine on every number it also produces.
 */
import { MEDAL_WEIGHT, Medal, SILVER_FACTOR, medalFor } from '../engine/index.ts';

export { Medal, medalFor, MEDAL_WEIGHT };

/** DESIGN.md §7. */
export const BONUS_STAR_POINTS = 1;

/** Re-exported, not redeclared: `src/engine/verdict.ts` holds the only copy. */
export { SILVER_FACTOR };

/**
 * Stars actually earned on a level, counting only bonus objectives the level still offers.
 *
 * A save outlives the level definition that wrote it. When a work order's bonus is retired or
 * renamed, the old star id lingers in the save and would otherwise score points that no longer
 * exist — a total of `4/3`, which reads as a bug because it is one.
 */
export function starsFor(
  bonus: readonly { id: string }[] | undefined,
  stars: readonly string[],
): number {
  const ids = new Set((bonus ?? []).map((objective) => objective.id));
  return stars.filter((id) => ids.has(id)).length;
}

/**
 * Required objective ids that held on every seed of this run.
 *
 * The credit unit for a multi-objective level. An objective that passed on two layouts out of
 * three is not closed — a level's seeds are a conjunction (DESIGN.md §5) — but an objective that
 * held on all of them is, whether or not the run as a whole passed. That distinction is the
 * difference between "still open" and "four of five, and here is the fifth".
 */
export function objectivesOnEverySeed(
  seeds: readonly { objectives: readonly { id: string; met: boolean }[] }[],
  required: readonly string[],
): string[] {
  if (seeds.length === 0) return [];
  return required.filter((id) =>
    seeds.every((seed) => seed.objectives.some((entry) => entry.id === id && entry.met)),
  );
}

export interface LevelScore {
  medal: Medal;
  /** Bonus objective ids met on this run. */
  stars: number;
  ticks: number;
}

/**
 * Medal points for one level result. DESIGN.md §7: gold 3, silver 2, bronze 1, star +1.
 *
 * `null` is an ungraded work order (§7) and weighs a gold's three. The player loses nothing by
 * a level having no ladder, which is the whole reason ungrading one is safe.
 */
export function levelPoints(medal: Medal | null, stars = 0): number {
  const weight = medal === null ? MEDAL_WEIGHT[Medal.Gold] : MEDAL_WEIGHT[medal];
  return weight + stars * BONUS_STAR_POINTS;
}

/** The best a level can be worth: gold plus every bonus star it offers. */
export function levelMaxPoints(bonusCount = 0): number {
  return MEDAL_WEIGHT[Medal.Gold] + bonusCount * BONUS_STAR_POINTS;
}

/**
 * The two facts about a level that A7 separates, in one type.
 *
 * `Medal.None` and `null` are not the same state and nothing may treat them as one. `Medal.None`
 * is *no medal yet* — a graded work order still on the bench. `null` is *no medal ever* — a work
 * order whose level admits one solution, so its par is a price rather than a budget. A missing
 * medal is a gap the player can close; an absent one is not, and drawing them the same way tells
 * the player their finished work is unfinished.
 */
export function isGraded(level: { graded?: boolean }): boolean {
  return level.graded !== false;
}

/** The medal a finished run earns, or `null` where the level carries no ladder (§7). */
export function medalForLevel(
  level: { graded?: boolean; par: { ticks: number } },
  passed: boolean,
  ticks: number,
): Medal | null {
  return isGraded(level) ? medalFor(passed, ticks, level.par.ticks) : null;
}

/** The medal on record for a level, or `null` where the level carries no ladder (§7). */
export function medalOf(level: { graded?: boolean }, progress: { medal: Medal }): Medal | null {
  return isGraded(level) ? progress.medal : null;
}

/**
 * What one saved result is worth, medal plus surviving stars.
 *
 * An ungraded work order scores a gold's three the moment it closes and nothing before, so the
 * site map's per-world totals stay honest in both directions: it cannot be short-changed for
 * having no ladder, and it cannot be paid for work that has not happened.
 */
export function progressPoints(
  level: { graded?: boolean; bonus?: readonly { id: string }[] },
  progress: { completed: boolean; medal: Medal; stars: readonly string[] },
): number {
  const stars = starsFor(level.bonus, progress.stars);
  if (isGraded(level)) return levelPoints(progress.medal, stars);
  return progress.completed ? levelPoints(null, stars) : 0;
}

export interface ReviewTier {
  /**
   * Which memo this is. Stable, and 2..5 rather than 1..4 because it is persisted:
   * `save.reviewedRanks` records the memos a contractor has already been sent, so renumbering the
   * surviving four would re-point every existing save at the wrong memo and silently withhold one
   * the player had never read. Tier 1 was deleted (see `REVIEW_TIERS`); its number was not reused.
   */
  rank: number;
  grade: string;
  /** Inclusive lower bound, as a percentage of available medal points. */
  min: number;
  body: string;
  dot: string;
  legal?: string[];
}

/**
 * The four Performance Review tiers, verbatim from NARRATIVE.md §7 — an invariant enforced by
 * `src/__tests__/confessed-invariants.test.ts`, not by whoever reads this next. `[n]` and `[m]` are
 * filled by the screen. The escalation runs upward on purpose: a weak review is gentle, a perfect
 * one is a threat assessment. Do not invert it.
 *
 * There were five. `DEVELOPING`, at 0–24%, could never be shown to anyone: the grade is medal
 * points over medal points *available*, the cheapest closed work order is a bronze at 1 of 3, so a
 * record with anything in it floors at 33% and a record with nothing in it is not graded at all.
 * A grade nobody can reach is dead content dressed as a ladder rung, and it made the ladder read
 * as harsher than it is — every player who saw `CONSISTENT WITH EXPECTATION` was in fact on the
 * bottom rung and being shown the second. Deleting it moves no threshold and regrades no save:
 * every percentage a real record can produce lands on exactly the tier it landed on before.
 */
export const REVIEW_TIERS: readonly ReviewTier[] = [
  {
    rank: 2,
    grade: 'CONSISTENT WITH EXPECTATION',
    min: 0,
    body:
      'Your output is consistent with expectation. Expectation was established in 2204 by a ' +
      'contractor who has since been reassigned, or has not.\n\n' +
      'This is the grade the site was designed around. Please do not feel that it is the ceiling. ' +
      'It is, functionally, the ceiling.',
    dot: 'consistent is fine. consistent is how the fields got planted.',
  },
  {
    rank: 3,
    grade: 'ABOVE BASELINE',
    min: 50,
    body:
      'You are exceeding baseline in [n] of [m] work orders. Baseline is a planning figure and ' +
      "was not intended to be exceeded, as it is used to set next quarter's baseline.\n\n" +
      'I have not forwarded these numbers upward. I have retained them, which protects both of us, ' +
      'and I would ask you to read that generously.',
    dot: "you're making the numbers move. numbers moving makes people upstairs look at the numbers.",
    legal: ['Retention of performance data does not constitute a record.'],
  },
  {
    rank: 4,
    grade: 'EXCEPTIONAL (NON-BINDING)',
    min: 75,
    body:
      '[n] gold results. Finance have asked whether the tick budgets were set correctly. They ' +
      'were. I have told them they were. They have asked again.\n\n' +
      'Please understand that when a contractor performs at this level, the question the site asks ' +
      'is not "how", it is "why is this possible", and that question has historically been resolved ' +
      'by adjusting the budgets.\n\n' +
      'Contractor #4470 held this grade for two consecutive quarters.',
    dot: "4470 got this grade too. i'd slow down. i wouldn't, but i'd say it.",
    legal: ['"Exceptional" is descriptive and confers no entitlement, escalation, or standing.'],
  },
  {
    rank: 5,
    grade: 'RETAINED',
    min: 100,
    body:
      'Every work order issued to you is closed at or under par. There is no grade above this one. ' +
      'There has never needed to be.\n\n' +
      'Your engagement has been marked for retention. Retention is not a promotion, a bonus, or a ' +
      'term of employment. It is a flag on a record that prevents the record from being closed.\n\n' +
      'Contractor #4470 is also retained. I have never been able to withdraw it.',
    dot: 'hey. good work. genuinely. now go and look at what "retained" means in the glossary.',
    legal: ['Retention persists beyond the term of the engagement.', 'See footnote 7.'],
  },
];

/**
 * Tier for a percentage of medal points earned, 0..100. NARRATIVE.md §7.
 *
 * The floor tier's `min` is 0 rather than the 33% a graded record cannot go below, so that the
 * table describes a total function and nonsense input still lands somewhere.
 */
export function reviewTier(percent: number): ReviewTier {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  let tier = REVIEW_TIERS[0] as ReviewTier;
  for (const candidate of REVIEW_TIERS) if (clamped >= candidate.min) tier = candidate;
  return tier;
}
