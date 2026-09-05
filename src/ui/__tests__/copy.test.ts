import { describe, expect, test } from 'vitest';
import { Medal } from '../../engine/index.ts';
import { BONUS_MET, UNDER_PAR, successLine } from '../copy.ts';

/**
 * DESIGN.md §11 A7. Six levels admit one route, so par is not a budget there and a medal ladder
 * would teach the player the grade is noise. `medalForLevel` hands those a `null` instead of a
 * `Medal`, and the close ceremony still fires — what it must not do is grade.
 */
describe('successLine on an ungraded level', () => {
  const GRADING = /par|gold|silver|bronze|medal|budget|under|record|faster|slower/i;

  test('says the work order is closed without grading it', () => {
    for (let ticks = 0; ticks < 12; ticks++) {
      const line = successLine(null, ticks, 78);
      expect(line).toMatch(/closed/i);
      expect(line).not.toMatch(GRADING);
    }
  });

  test('never reaches the par lines, even at, under and over par', () => {
    for (const ticks of [40, 77, 78, 79, 200]) {
      const line = successLine(null, ticks, 78);
      expect(line).not.toBe(UNDER_PAR);
      expect(line).not.toBe(BONUS_MET);
      expect(line).not.toContain('par');
    }
  });

  test('is stable for a given run, like every other line in this file', () => {
    expect(successLine(null, 78, 78)).toBe(successLine(null, 78, 78));
  });

  test('the graded ladder is untouched', () => {
    expect(successLine(Medal.Gold, 70, 78)).toBe(UNDER_PAR);
    expect(successLine(Medal.Gold, 78, 78)).toContain('par');
    expect(successLine(Medal.Silver, 90, 78)).not.toMatch(/closed/i);
    expect(successLine(Medal.Bronze, 300, 78)).not.toBe(UNDER_PAR);
  });
});
