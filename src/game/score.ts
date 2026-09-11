import { MEDAL_WEIGHT, Medal, SILVER_FACTOR, medalFor } from '../engine/index.ts';

export { Medal, medalFor, MEDAL_WEIGHT };

export const BONUS_STAR_POINTS = 1;

export { SILVER_FACTOR };

export function starsFor(
  bonus: readonly { id: string }[] | undefined,
  stars: readonly string[],
): number {
  const ids = new Set((bonus ?? []).map((objective) => objective.id));
  return stars.filter((id) => ids.has(id)).length;
}

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
  stars: number;
  ticks: number;
}

export function levelPoints(medal: Medal | null, stars = 0): number {
  const weight = medal === null ? MEDAL_WEIGHT[Medal.Gold] : MEDAL_WEIGHT[medal];
  return weight + stars * BONUS_STAR_POINTS;
}

export function levelMaxPoints(bonusCount = 0): number {
  return MEDAL_WEIGHT[Medal.Gold] + bonusCount * BONUS_STAR_POINTS;
}

export function isGraded(level: { graded?: boolean }): boolean {
  return level.graded !== false;
}

export function medalForLevel(
  level: { graded?: boolean; par: { ticks: number } },
  passed: boolean,
  ticks: number,
): Medal | null {
  return isGraded(level) ? medalFor(passed, ticks, level.par.ticks) : null;
}

export function medalOf(level: { graded?: boolean }, progress: { medal: Medal }): Medal | null {
  return isGraded(level) ? progress.medal : null;
}

export function progressPoints(
  level: { graded?: boolean; bonus?: readonly { id: string }[] },
  progress: { completed: boolean; medal: Medal; stars: readonly string[] },
): number {
  const stars = starsFor(level.bonus, progress.stars);
  if (isGraded(level)) return levelPoints(progress.medal, stars);
  return progress.completed ? levelPoints(null, stars) : 0;
}

export interface ReviewTier {
  rank: number;
  grade: string;
  min: number;
  body: string;
  dot: string;
  legal?: string[];
}

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

export function reviewTier(percent: number): ReviewTier {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  let tier = REVIEW_TIERS[0] as ReviewTier;
  for (const candidate of REVIEW_TIERS) if (clamped >= candidate.min) tier = candidate;
  return tier;
}
