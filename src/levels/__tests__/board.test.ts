import { describe, expect, test } from 'vitest';
import { LEVELS } from '../index.ts';

const FINDING_THE_SHAPE_IS_THE_PUZZLE: readonly string[] = ['w5-02', 'w8-01'];

describe('the board block', () => {
  for (const level of LEVELS) {
    const exempt = FINDING_THE_SHAPE_IS_THE_PUZZLE.includes(level.id);

    test(`${level.id} ${exempt ? 'withholds its shape on purpose' : 'says what changes between seeds'}`, () => {
      if (exempt) {
        expect(level.board).toBeUndefined();
        return;
      }
      expect(level.board).toBeDefined();
      expect(level.board?.redrawn.length ?? 0).toBeGreaterThan(0);
    });
  }

  test('the exemption list names only levels that exist', () => {
    const ids = new Set(LEVELS.map((level) => level.id));
    expect(FINDING_THE_SHAPE_IS_THE_PUZZLE.filter((id) => !ids.has(id))).toEqual([]);
  });

  test('a single-seed order says so rather than leaving the row empty', () => {
    for (const level of LEVELS.filter((candidate) => candidate.seeds.length === 1)) {
      expect(level.board?.redrawn.join(' ')).toMatch(/nothing|single seed|one seed|never/i);
    }
  });
});
