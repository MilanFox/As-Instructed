import { describe, expect, test } from 'vitest';
import { Medal, reviewTier } from '../../../game/score.ts';
import { emptySave } from '../../../game/save.ts';
import type { SaveFile } from '../../../game/save.ts';
import { campaignOrder } from '../../../levels/index.ts';
import { fillPlaceholders, reportFor, reviewOwed } from '../review.ts';

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

describe('the grade counts closed work orders only', () => {
  test('nothing closed is not assessed rather than graded zero', () => {
    const report = reportFor(emptySave());
    expect(report.graded).toBe(false);
    expect(report.percent).toBe(0);
    expect(report.maxPoints).toBe(0);
  });

  test('the open work order on the bench is not counted as a failure', () => {
    const save = closeFirst(1, Medal.Gold);
    const bench = ORDER[1]?.id as string;
    save.levels[bench] = { completed: false, medal: Medal.None, stars: [], attempts: 4 };
    const report = reportFor(save);
    expect(report.closed).toBe(1);
    expect(report.points).toBe(3);
    expect(report.maxPoints).toBe(3);
    expect(report.percent).toBe(100);
  });

  test('the grade covers the whole campaign and unreached work is simply absent', () => {
    const report = reportFor(closeFirst(17, Medal.Gold));
    expect(report.closed).toBe(17);
    expect(report.maxPoints).toBe(51);
  });

  test('a flawless run at the halfway mark reads 100%, not 38%', () => {
    const report = reportFor(closeFirst(17, Medal.Gold, true));
    expect(report.percent).toBe(100);
    expect(reviewTier(report.percent).rank).toBe(5);
  });

  test('a perfect medal wall with no stars at all reads 100%', () => {
    const report = reportFor(closeFirst(ORDER.length, Medal.Gold));
    expect(report.gold).toBe(ORDER.length);
    expect(report.stars).toBe(0);
    expect(report.points).toBe(ORDER.length * 3);
    expect(report.maxPoints).toBe(ORDER.length * 3);
    expect(report.percent).toBe(100);
  });

  test('stars change nothing about the grade', () => {
    const without = reportFor(closeFirst(ORDER.length, Medal.Silver));
    const with_ = reportFor(closeFirst(ORDER.length, Medal.Silver, true));
    expect(with_.percent).toBe(without.percent);
    expect(with_.stars).toBeGreaterThan(0);
    expect(without.stars).toBe(0);
  });

  test('medal quality is the only thing that moves the number', () => {
    expect(reportFor(closeFirst(10, Medal.Bronze)).percent).toBeCloseTo(100 / 3, 5);
    expect(reportFor(closeFirst(10, Medal.Silver)).percent).toBeCloseTo(200 / 3, 5);
    expect(reportFor(closeFirst(10, Medal.Gold)).percent).toBe(100);
  });
});

describe('placeholders', () => {
  test('[m] is the closed work orders, so the sentence agrees with the grade', () => {
    const save = closeFirst(17, Medal.Gold);
    const report = reportFor(save);
    const tier = reviewTier(report.percent);
    expect(fillPlaceholders('[n] of [m]', tier, report)).toBe('17 of 17');
  });

  test('tier 3 can no longer claim every work order in the campaign', () => {
    const save = closeFirst(ORDER.length, Medal.Silver);
    const report = reportFor(save);
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
    const report = reportFor(save);
    const tier = reviewTier(report.percent);
    expect(tier.rank).toBeGreaterThanOrEqual(4);
    expect(fillPlaceholders('[n] gold results', tier, report)).toBe(
      `${ORDER.length - 1} gold results`,
    );
  });
});

describe('delivery', () => {
  test('nothing to review is nothing to deliver', () => {
    expect(reviewOwed(emptySave())).toBeNull();
  });

  test('the first closed work order owes a memo', () => {
    const tier = reviewOwed(closeFirst(1, Medal.Gold));
    expect(tier?.rank).toBe(5);
  });

  test('a memo already read is not delivered again', () => {
    const save = closeFirst(1, Medal.Gold);
    save.reviewedRanks = [5];
    expect(reviewOwed(save)).toBeNull();
  });

  test('a grade that falls owes the tier it fell to', () => {
    const save = closeFirst(2, Medal.Gold);
    save.reviewedRanks = [5];
    save.levels[ORDER[1]?.id as string] = {
      completed: true,
      medal: Medal.Silver,
      stars: [],
      attempts: 1,
    };
    expect(reviewOwed(save)?.rank).toBe(4);
  });

  test('climbing back to a tier already read delivers nothing', () => {
    const save = closeFirst(2, Medal.Gold);
    save.reviewedRanks = [4, 5];
    expect(reviewOwed(save)).toBeNull();
  });
});
