import { describe, expect, it } from 'vitest';
import {
  BONUS_STAR_POINTS,
  Medal,
  REVIEW_TIERS,
  levelMaxPoints,
  levelPoints,
  medalFor,
  reviewTier,
} from '../score.ts';

describe('medalFor', () => {
  it('is gold at exactly par and below', () => {
    expect(medalFor(true, 6, 6)).toBe(Medal.Gold);
    expect(medalFor(true, 5, 6)).toBe(Medal.Gold);
    expect(medalFor(true, 0, 6)).toBe(Medal.Gold);
  });

  it('is silver up to and including par * 1.25', () => {
    expect(medalFor(true, 10, 8)).toBe(Medal.Silver);
    expect(medalFor(true, 7, 6)).toBe(Medal.Silver);
    expect(medalFor(true, 9, 8)).toBe(Medal.Silver);
  });

  it('is bronze one tick past the silver bound', () => {
    expect(medalFor(true, 11, 8)).toBe(Medal.Bronze);
    expect(medalFor(true, 8, 6)).toBe(Medal.Bronze);
  });

  it('is none when the run did not pass, however fast', () => {
    expect(medalFor(false, 1, 6)).toBe(Medal.None);
  });

  it('lands exactly on the silver bound when par * 1.25 is not an integer', () => {
    expect(medalFor(true, 12, 10)).toBe(Medal.Silver);
    expect(medalFor(true, 13, 10)).toBe(Medal.Bronze);
    expect(medalFor(true, 8, 7)).toBe(Medal.Silver);
    expect(medalFor(true, 9, 7)).toBe(Medal.Bronze);
  });

  it('takes only ticks, par and the pass — there is no third argument', () => {
    expect(medalFor.length).toBe(3);
    const golfed = medalFor(true, 6, 6);
    const verbose = medalFor(true, 6, 6);
    expect(golfed).toBe(verbose);
  });
});

describe('points', () => {
  it('weights gold 3, silver 2, bronze 1, star +1', () => {
    expect(levelPoints(Medal.Gold)).toBe(3);
    expect(levelPoints(Medal.Silver)).toBe(2);
    expect(levelPoints(Medal.Bronze)).toBe(1);
    expect(levelPoints(Medal.None)).toBe(0);
    expect(BONUS_STAR_POINTS).toBe(1);
    expect(levelPoints(Medal.Gold, 2)).toBe(5);
    expect(levelMaxPoints(2)).toBe(5);
  });
});

describe('reviewTier', () => {
  it('picks the tier at each boundary', () => {
    expect(reviewTier(0).grade).toBe('AS EXPECTED');
    expect(reviewTier(33.4).grade).toBe('AS EXPECTED');
    expect(reviewTier(49.9).grade).toBe('AS EXPECTED');
    expect(reviewTier(50).grade).toBe('ABOVE TARGET');
    expect(reviewTier(74).grade).toBe('ABOVE TARGET');
    expect(reviewTier(75).grade).toBe('EXCEPTIONAL (UNOFFICIAL)');
    expect(reviewTier(92).grade).toBe('EXCEPTIONAL (UNOFFICIAL)');
    expect(reviewTier(99.9).grade).toBe('EXCEPTIONAL (UNOFFICIAL)');
    expect(reviewTier(100).grade).toBe('RETAINED');
  });

  it('survives nonsense input', () => {
    expect(reviewTier(Number.NaN).rank).toBe(2);
    expect(reviewTier(-40).rank).toBe(2);
    expect(reviewTier(4000).rank).toBe(5);
  });

  it('has no rung a real record cannot stand on', () => {
    const floor = 100 / 3;
    REVIEW_TIERS.forEach((tier, index) => {
      const next = REVIEW_TIERS[index + 1];
      const bandEnds = next ? next.min : 100;
      expect([tier.grade, bandEnds > floor]).toEqual([tier.grade, true]);
    });
  });

  it('cannot have written a rank 1 into anyone save', () => {
    for (let percent = 0; percent <= 100; percent += 0.5) {
      expect([percent, reviewTier(percent).rank]).not.toEqual([percent, 1]);
    }
    expect(reviewTier(Number.NaN).rank).not.toBe(1);
  });

  it('keeps the rank ids saves already carry', () => {
    expect(REVIEW_TIERS.map((tier) => tier.rank)).toEqual([2, 3, 4, 5]);
  });
});
