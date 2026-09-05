/**
 * The Performance Review's arithmetic, kept out of the screen so it can be tested without a DOM.
 *
 * Three rules, and each replaces one that graded the wrong thing.
 *
 * **The wall lists work orders the player has reached** — open now, or attempted at some point.
 * It used to list all 34 whether or not the site had issued them.
 *
 * **The grade counts only work orders that are closed.** A work order still on the bench is not a
 * zero; it is unfinished. Counting it as a zero made the grade a progress bar, and a contractor
 * halfway through with a gold on every single work order could not arithmetically clear half of
 * the campaign and was told they were average for it.
 *
 * **The denominator is medals only.** A bonus star is an opt-in challenge, and `BONUS_MET` in
 * `src/ui/copy.ts` promises it is "a star", not part of the standard. With stars in the
 * denominator a flawless medal wall scored 73% — below the tier whose own text describes exactly
 * what that player had done. Stars are still counted and still shown; they are not the yardstick.
 *
 * DESIGN.md §11 A4 fixes what a medal is worth. This module changes what is counted, not that.
 */
import { emptyProgress } from '../../game/save.ts';
import type { LevelProgress, SaveFile } from '../../game/save.ts';
import { Medal, levelMaxPoints, levelPoints, starsFor } from '../../game/score.ts';
import type { ReviewTier } from '../../game/score.ts';
import { isLevelUnlocked } from '../../game/store.ts';
import { campaignOrder } from '../../levels/index.ts';
import type { LevelDef } from '../../levels/index.ts';

export type Scope = 'all' | number;

export interface ScopeRow {
  level: LevelDef;
  progress: LevelProgress;
  points: number;
  maxPoints: number;
}

export interface ScopeReport {
  rows: ScopeRow[];
  points: number;
  maxPoints: number;
  percent: number;
  gold: number;
  silver: number;
  bronze: number;
  stars: number;
  /** Work orders in scope carrying a medal. The grade's denominator, in work orders. */
  closed: number;
  /** False until something in scope has been closed. There is nothing to grade before that. */
  graded: boolean;
}

/**
 * Whether the site has put this work order in front of the player.
 *
 * `attempts` is the second half on purpose: a save written before the unlock rules moved, or one a
 * player imported, can hold a result for a work order the current rules call locked. A result on
 * the record is proof it was issued.
 */
export function hasReached(save: SaveFile, levelId: string): boolean {
  if (isLevelUnlocked(save, levelId)) return true;
  return (save.levels[levelId]?.attempts ?? 0) > 0;
}

function progressOf(save: SaveFile, levelId: string): LevelProgress {
  return save.levels[levelId] ?? emptyProgress();
}

/** Reached work orders per world. The scope buttons open as the site issues the work. */
export function reachedByWorld(save: SaveFile): Map<number, number> {
  const counts = new Map<number, number>();
  for (const level of campaignOrder()) {
    if (!hasReached(save, level.id)) continue;
    counts.set(level.world, (counts.get(level.world) ?? 0) + 1);
  }
  return counts;
}

export function reportFor(save: SaveFile, scope: Scope): ScopeReport {
  const rows: ScopeRow[] = campaignOrder()
    .filter((level) => scope === 'all' || level.world === scope)
    .filter((level) => hasReached(save, level.id))
    .map((level) => {
      const progress = progressOf(save, level.id);
      const closed = progress.medal !== Medal.None;
      return {
        level,
        progress,
        points: levelPoints(progress.medal),
        maxPoints: closed ? levelMaxPoints(0) : 0,
      };
    });

  const report: ScopeReport = {
    rows,
    points: 0,
    maxPoints: 0,
    percent: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    stars: 0,
    closed: 0,
    graded: false,
  };

  for (const row of rows) {
    report.points += row.points;
    report.maxPoints += row.maxPoints;
    report.stars += starsFor(row.level.bonus, row.progress.stars);
    if (row.progress.medal === Medal.Gold) report.gold++;
    else if (row.progress.medal === Medal.Silver) report.silver++;
    else if (row.progress.medal === Medal.Bronze) report.bronze++;
  }

  report.closed = report.gold + report.silver + report.bronze;
  report.graded = report.closed > 0;
  report.percent = report.maxPoints > 0 ? (report.points / report.maxPoints) * 100 : 0;
  return report;
}

/**
 * `[m]` is the work orders in scope that are closed — the same set the grade is computed over, so
 * the sentence and the number above it cannot disagree. `[n]` is whichever count makes the
 * sentence true: tier 4 counts golds outright, tier 3 counts results that clear the bar.
 */
export function fillPlaceholders(text: string, tier: ReviewTier, report: ScopeReport): string {
  const n = tier.rank >= 4 ? report.gold : report.gold + report.silver;
  return text.replaceAll('[n]', String(n)).replaceAll('[m]', String(report.closed));
}
