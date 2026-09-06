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
    // par 10 -> silver up to 12.5, so 12 is silver and 13 is bronze.
    expect(medalFor(true, 12, 10)).toBe(Medal.Silver);
    expect(medalFor(true, 13, 10)).toBe(Medal.Bronze);
    // par 7 -> silver up to 8.75.
    expect(medalFor(true, 8, 7)).toBe(Medal.Silver);
    expect(medalFor(true, 9, 7)).toBe(Medal.Bronze);
  });

  /**
   * DESIGN.md §7: the medal is ticks and nothing else. Character count is not an axis, has no par
   * to clear, and cannot move a medal in either direction. This test is the guard on that.
   */
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
    /* Literals, not arithmetic over the constants under test: DESIGN.md §11 A4 fixes these
       weights, so a change to one has to break this line rather than travel through it. */
    expect(BONUS_STAR_POINTS).toBe(1);
    expect(levelPoints(Medal.Gold, 2)).toBe(5);
    expect(levelMaxPoints(2)).toBe(5);
  });
});

describe('reviewTier', () => {
  it('picks the tier at each boundary', () => {
    expect(reviewTier(0).grade).toBe('CONSISTENT WITH EXPECTATION');
    expect(reviewTier(33.4).grade).toBe('CONSISTENT WITH EXPECTATION');
    expect(reviewTier(49.9).grade).toBe('CONSISTENT WITH EXPECTATION');
    expect(reviewTier(50).grade).toBe('ABOVE BASELINE');
    expect(reviewTier(74).grade).toBe('ABOVE BASELINE');
    expect(reviewTier(75).grade).toBe('EXCEPTIONAL (NON-BINDING)');
    expect(reviewTier(92).grade).toBe('EXCEPTIONAL (NON-BINDING)');
    expect(reviewTier(99.9).grade).toBe('EXCEPTIONAL (NON-BINDING)');
    expect(reviewTier(100).grade).toBe('RETAINED');
  });

  it('survives nonsense input', () => {
    expect(reviewTier(Number.NaN).rank).toBe(2);
    expect(reviewTier(-40).rank).toBe(2);
    expect(reviewTier(4000).rank).toBe(5);
  });

  it('has no rung a real record cannot stand on', () => {
    /* The grade is medal points over medal points available and the cheapest closed work order is
       a bronze, so 100/3 is the floor of every graded record and no percentage below it exists.
       A tier whose whole band lies under that floor can never be delivered to anyone, which is
       exactly what `DEVELOPING` was: its band ended at 25. Each tier runs from its own `min` to
       the next one's, so the test is that the band's far end clears the floor. */
    const floor = 100 / 3;
    REVIEW_TIERS.forEach((tier, index) => {
      const next = REVIEW_TIERS[index + 1];
      const bandEnds = next ? next.min : 100;
      expect([tier.grade, bandEnds > floor]).toEqual([tier.grade, true]);
    });
  });

  it('cannot have written a rank 1 into anyone save', () => {
    /* Why deleting tier 1 needs no save migration: `reviewedRanks` only ever gains a rank that
       `reviewTier` returned, and rank 1 was never returned for any input it can be called with.
       So no save on disk can hold it, and the surviving four keep the ids they were saved under. */
    for (let percent = 0; percent <= 100; percent += 0.5) {
      expect([percent, reviewTier(percent).rank]).not.toEqual([percent, 1]);
    }
    expect(reviewTier(Number.NaN).rank).not.toBe(1);
  });

  it('keeps the rank ids saves already carry', () => {
    /* Literals, not `map((_, i) => i + 2)`: these four numbers are in `save.reviewedRanks` on
       disk, and a test that derives them from the array cannot notice a renumbering. */
    expect(REVIEW_TIERS.map((tier) => tier.rank)).toEqual([2, 3, 4, 5]);
  });
});
