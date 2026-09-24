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

export function ticksOnSeeds(
  results: readonly { seed: number; ticks: number }[],
  seeds: readonly number[],
): number | null {
  const wanted = new Set(seeds);
  let worst: number | null = null;
  for (const result of results) {
    if (!wanted.has(result.seed)) continue;
    if (worst === null || result.ticks > worst) worst = result.ticks;
  }
  return worst;
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
    grade: 'AS EXPECTED',
    min: 0,
    body:
      'Your work is as expected. The site was built around this grade.\n\n' +
      'It is not the top grade. In practice, it is.',
    dot: 'as expected is fine. that is how the fields got planted.',
  },
  {
    rank: 3,
    grade: 'ABOVE TARGET',
    min: 50,
    body:
      'You beat the target in [n] of [m] levels. The target was not meant to be beaten. ' +
      'It is used to set the next one.\n\n' +
      'I have not sent these numbers to management. I kept them. That is meant kindly.',
    dot: 'your numbers are going up. then the managers start to look.',
    legal: ['Keeping these numbers does not make them a record.'],
  },
  {
    rank: 4,
    grade: 'EXCEPTIONAL (UNOFFICIAL)',
    min: 75,
    body:
      '[n] gold results. Finance asked if par was wrong. It was not. ' +
      'They asked again.\n\n' +
      'Usually the site fixes this by changing par.\n\n' +
      'Contractor #4470 had this grade for half a year.',
    dot: '4470 got this grade too. be careful.',
    legal: ['"Exceptional" gives you no rights.'],
  },
  {
    rank: 5,
    grade: 'RETAINED',
    min: 100,
    body:
      'Every level is closed at or under par. There is no higher grade.\n\n' +
      'Your record is now marked "retained", which means kept. That is not a promotion. ' +
      'It means your record can never be closed.\n\n' +
      'Contractor #4470 is also retained. I have never been able to remove it.',
    dot: 'hey. good work. really. kept forever is a long time.',
    legal: ['A retained record stays after the contract ends.', 'See footnote 7.'],
  },
];

export function reviewTier(percent: number): ReviewTier {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  let tier = REVIEW_TIERS[0] as ReviewTier;
  for (const candidate of REVIEW_TIERS) if (clamped >= candidate.min) tier = candidate;
  return tier;
}
