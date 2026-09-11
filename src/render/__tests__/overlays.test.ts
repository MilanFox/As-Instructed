import { describe, expect, it } from 'vitest';

import { BRACKET_CLOSED_PX, BRACKET_TIGHTEN_PX, bracketCloseness } from '../overlays.ts';

describe('bracketCloseness', () => {
  it('leaves the corner brackets alone at comfortable tile sizes', () => {
    expect(bracketCloseness(48)).toBe(0);
    expect(bracketCloseness(BRACKET_TIGHTEN_PX)).toBe(0);
    expect(bracketCloseness(96, 2)).toBe(0);
  });

  it('closes them completely once a tile is smaller than the marker needs', () => {
    expect(bracketCloseness(BRACKET_CLOSED_PX)).toBe(1);
    expect(bracketCloseness(8)).toBe(1);
    expect(bracketCloseness(26, 2)).toBe(1);
  });

  it('reads device pixels through the ratio, so 14 css px behaves the same at any dpr', () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      expect(bracketCloseness(14 * dpr, dpr)).toBe(1);
      expect(bracketCloseness(40 * dpr, dpr)).toBe(0);
      expect(bracketCloseness(22 * dpr, dpr)).toBeCloseTo(bracketCloseness(22), 10);
    }
  });

  it('moves monotonically between the two thresholds', () => {
    let previous = -1;
    for (let css = BRACKET_TIGHTEN_PX; css >= BRACKET_CLOSED_PX; css--) {
      const close = bracketCloseness(css);
      expect(close).toBeGreaterThanOrEqual(previous);
      expect(close).toBeGreaterThanOrEqual(0);
      expect(close).toBeLessThanOrEqual(1);
      previous = close;
    }
  });
});
