/**
 * The Performance Review's arithmetic, kept out of the memo so it can be tested without a DOM.
 *
 * Two rules, and each replaces one that graded the wrong thing.
 *
 * **The grade counts only work orders that are closed.** A work order still on the bench is not a
 * zero; it is unfinished. Counting it as a zero made the grade a progress bar, and a contractor
 * halfway through with a gold on every single work order could not arithmetically clear half of
 * the campaign and was told they were average for it.
 *
 * **The denominator is medals only.** A bonus star is an opt-in challenge, and `BONUS_MET` in
 * `src/ui/copy.ts` promises it is "a star", not part of the standard. With stars in the
 * denominator a flawless medal wall scored 73% — below the tier whose own text describes exactly
 * what that player had done. Stars are still counted; they are not the yardstick.
 *
 * Nothing here filters by unlock state any more. It used to, to decide which rows the medal wall
 * drew; the wall is gone, and an unreached work order carries no medal, so it contributes nothing
 * to either side of the fraction whether it is listed or not. An ungraded level (DESIGN.md §11 A7)
 * falls out the same way for the same reason.
 *
 * DESIGN.md §11 A4 fixes what a medal is worth. This module changes what is counted, not that.
 */
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
  /** Work orders carrying a medal. The grade's denominator, in work orders. */
  closed: number;
  /**
   * Work orders closed that the site never graded (DESIGN.md §11 A7). Not in `closed`, because
   * they are not in the fraction; counted at all because a record holding two of them and no
   * medals is a record with work behind it, and the standing sheet was telling that player to go
   * and close a work order.
   */
  ungraded: number;
  /** False until something has been closed. There is nothing to grade before that. */
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

/**
 * The memo the site owes the player, or nothing.
 *
 * One per tier, ever — the same rule as a requisition. The grade is a quality average rather than
 * a progress bar, so it moves both ways: a first gold reads 100% and a later silver takes it back
 * down. Delivering on every crossing would re-issue the same memo, so what is remembered is which
 * memos have been read, not where the grade was last time.
 */
export function reviewOwed(save: SaveFile): ReviewTier | null {
  const report = reportFor(save);
  if (!report.graded) return null;
  const tier = reviewTier(report.percent);
  return save.reviewedRanks.includes(tier.rank) ? null : tier;
}

/**
 * `[m]` is the closed work orders — the same set the grade is computed over, so the sentence and
 * the number above it cannot disagree. `[n]` is whichever count makes the sentence true: tier 4
 * counts golds outright, tier 3 counts results that clear the bar.
 */
export function fillPlaceholders(text: string, tier: ReviewTier, report: ReviewReport): string {
  const n = tier.rank >= 4 ? report.gold : report.gold + report.silver;
  return text.replaceAll('[n]', String(n)).replaceAll('[m]', String(report.closed));
}
