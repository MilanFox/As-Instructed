import type { SaveFile } from '../../game/save.ts';
import {
  Medal,
  isGraded,
  levelMaxPoints,
  levelPoints,
  reviewTier,
  starsFor,
} from '../../game/score.ts';
import type { ReviewTier } from '../../game/score.ts';
import { campaignOrder } from '../../levels/index.ts';

export interface ReviewReport {
  points: number;
  maxPoints: number;
  percent: number;
  gold: number;
  silver: number;
  bronze: number;
  stars: number;
  closed: number;
  ungraded: number;
  graded: boolean;
}

export function reportFor(save: SaveFile): ReviewReport {
  const report: ReviewReport = {
    points: 0,
    maxPoints: 0,
    percent: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    stars: 0,
    closed: 0,
    ungraded: 0,
    graded: false,
  };

  for (const level of campaignOrder()) {
    const progress = save.levels[level.id];
    if (!progress) continue;
    report.stars += starsFor(level.bonus, progress.stars);
    if (!isGraded(level) && progress.completed) report.ungraded++;
    if (progress.medal === Medal.None) continue;
    report.points += levelPoints(progress.medal);
    report.maxPoints += levelMaxPoints(0);
    if (progress.medal === Medal.Gold) report.gold++;
    else if (progress.medal === Medal.Silver) report.silver++;
    else report.bronze++;
  }

  report.closed = report.gold + report.silver + report.bronze;
  report.graded = report.closed > 0;
  report.percent = report.maxPoints > 0 ? (report.points / report.maxPoints) * 100 : 0;
  return report;
}

export function reviewOwed(save: SaveFile): ReviewTier | null {
  const report = reportFor(save);
  if (!report.graded) return null;
  const tier = reviewTier(report.percent);
  return save.reviewedRanks.includes(tier.rank) ? null : tier;
}

export function fillPlaceholders(text: string, tier: ReviewTier, report: ReviewReport): string {
  const n = tier.rank >= 4 ? report.gold : report.gold + report.silver;
  return text.replaceAll('[n]', String(n)).replaceAll('[m]', String(report.closed));
}
