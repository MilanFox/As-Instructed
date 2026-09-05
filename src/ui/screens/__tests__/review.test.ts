import { describe, expect, test } from 'vitest';
import { Medal, reviewTier } from '../../../game/score.ts';
import { emptySave } from '../../../game/save.ts';
import type { SaveFile } from '../../../game/save.ts';
import { campaignOrder } from '../../../levels/index.ts';
import { fillPlaceholders, hasReached, reachedByWorld, reportFor } from '../review.ts';

const ORDER = campaignOrder();

function closeFirst(count: number, medal: Medal, allStars = false): SaveFile {
  const save = emptySave();
  for (const level of ORDER.slice(0, count)) {
    save.levels[level.id] = {
      completed: true,
      medal,
      stars: allStars ? (level.bonus ?? []).map((each) => each.id) : [],
      attempts: 1,
      bestTicks: level.par.ticks,
    };
  }
  return save;
}

describe('scope', () => {
  test('a standing start reaches only the first work order', () => {
    const save = emptySave();
    expect(hasReached(save, ORDER[0]?.id as string)).toBe(true);
    expect(hasReached(save, ORDER[1]?.id as string)).toBe(false);
    expect(reportFor(save, 'all').rows).toHaveLength(1);
  });

  test('a work order with attempts on the record counts as reached even if the rules lock it', () => {
    const save = emptySave();
    const stranded = ORDER[9]?.id as string;
    save.levels[stranded] = { completed: false, medal: Medal.None, stars: [], attempts: 3 };
    expect(hasReached(save, stranded)).toBe(true);
    expect(reportFor(save, 'all').rows.some((row) => row.level.id === stranded)).toBe(true);
  });

  test('the scope grows with the campaign and never contains unreached work', () => {
    const save = closeFirst(17, Medal.Gold);
    const report = reportFor(save, 'all');
    // 17 closed plus the one they are standing on.
    expect(report.rows).toHaveLength(18);
    expect(report.closed).toBe(17);
    expect(reachedByWorld(save).get(8) ?? 0).toBe(0);
  });
});

describe('the grade counts closed work orders only', () => {
  test('nothing closed is not assessed rather than graded zero', () => {
    const report = reportFor(emptySave(), 'all');
    expect(report.graded).toBe(false);
    expect(report.percent).toBe(0);
    expect(report.maxPoints).toBe(0);
  });

  test('the open work order on the bench is not counted as a failure', () => {
    const report = reportFor(closeFirst(1, Medal.Gold), 'all');
    expect(report.rows).toHaveLength(2);
    expect(report.points).toBe(3);
    expect(report.maxPoints).toBe(3);
    expect(report.percent).toBe(100);
  });

  test('a flawless run at the halfway mark reads 100%, not 38%', () => {
    const report = reportFor(closeFirst(17, Medal.Gold, true), 'all');
    expect(report.percent).toBe(100);
    expect(reviewTier(report.percent).rank).toBe(5);
  });

  test('a perfect medal wall with no stars at all reads 100%', () => {
    const report = reportFor(closeFirst(ORDER.length, Medal.Gold), 'all');
    expect(report.gold).toBe(ORDER.length);
    expect(report.stars).toBe(0);
    expect(report.points).toBe(ORDER.length * 3);
    expect(report.maxPoints).toBe(ORDER.length * 3);
    expect(report.percent).toBe(100);
  });

  test('stars change nothing about the grade', () => {
    const without = reportFor(closeFirst(ORDER.length, Medal.Silver), 'all');
    const with_ = reportFor(closeFirst(ORDER.length, Medal.Silver, true), 'all');
    expect(with_.percent).toBe(without.percent);
    expect(with_.stars).toBeGreaterThan(0);
    expect(without.stars).toBe(0);
  });

  test('medal quality is the only thing that moves the number', () => {
    expect(reportFor(closeFirst(10, Medal.Bronze), 'all').percent).toBeCloseTo(100 / 3, 5);
    expect(reportFor(closeFirst(10, Medal.Silver), 'all').percent).toBeCloseTo(200 / 3, 5);
    expect(reportFor(closeFirst(10, Medal.Gold), 'all').percent).toBe(100);
  });
});

describe('world scopes', () => {
  test('a world the player has not reached has nothing in it', () => {
    const save = closeFirst(3, Medal.Gold);
    expect(reachedByWorld(save).get(1)).toBe(3);
    expect(reachedByWorld(save).get(2)).toBe(1);
    expect(reachedByWorld(save).get(5) ?? 0).toBe(0);
    expect(reportFor(save, 5).graded).toBe(false);
  });

  test('a world grade is that world alone', () => {
    const save = closeFirst(3, Medal.Gold);
    const world1 = reportFor(save, 1);
    expect(world1.closed).toBe(3);
    expect(world1.percent).toBe(100);
  });
});

describe('placeholders', () => {
  test('[m] is the closed work orders, so the sentence agrees with the grade', () => {
    const save = closeFirst(17, Medal.Gold);
    const report = reportFor(save, 'all');
    const tier = reviewTier(report.percent);
    expect(fillPlaceholders('[n] of [m]', tier, report)).toBe('17 of 17');
  });

  test('tier 3 can no longer claim every work order in the campaign', () => {
    const save = closeFirst(ORDER.length, Medal.Silver);
    const report = reportFor(save, 'all');
    const tier = reviewTier(report.percent);
    expect(tier.rank).toBe(3);
    expect(fillPlaceholders('[n] of [m]', tier, report)).toBe(`${ORDER.length} of ${ORDER.length}`);
  });

  test('tier 4 counts golds, not everything that cleared the bar', () => {
    const save = closeFirst(ORDER.length, Medal.Gold);
    save.levels[ORDER[0]?.id as string] = {
      completed: true,
      medal: Medal.Silver,
      stars: [],
      attempts: 1,
    };
    const report = reportFor(save, 'all');
    const tier = reviewTier(report.percent);
    expect(tier.rank).toBeGreaterThanOrEqual(4);
    expect(fillPlaceholders('[n] gold results', tier, report)).toBe(
      `${ORDER.length - 1} gold results`,
    );
  });
});
