/**
 * Every work order tells the player which half of its board is the level and which half is the
 * draw.
 *
 * The question that produced this file was asked about `w3-01`: *is it always a 3-high corridor?*
 * It is — `build` fixes a 14x5 frame on every seed — and there was nowhere the player could have
 * read that. The rows crates and pads sit in are redrawn, the row count never is, and the two look
 * identical on the one board in front of you. The honest general solution and the lazy one differ
 * exactly along that line, so a player who cannot see the line loses gold on seed 2 for a guess
 * they had no way to check. DESIGN.md §11.4 says seeds catch laziness; collecting from a player who
 * was not being lazy is the failure this guards.
 *
 * The rule is: `board.fixed` and `board.redrawn` are both stated, or the level is on
 * `FINDING_THE_SHAPE_IS_THE_PUZZLE` below. Nothing else passes.
 *
 * There is deliberately no check here for the words `src/__tests__/confessed-invariants.test.ts`
 * indexes. A `board` entry lives under `src/levels/`, which that file already scans, so an entry
 * saying "the same rows the generator draws" fails there as an unregistered hit without this file
 * owning a second copy of its regex — and a second copy of the index is the exact bug the index
 * exists to find.
 */
import { describe, expect, test } from 'vitest';
import { LEVELS } from '../index.ts';

/**
 * The two work orders where the board's shape is the question, not the premise.
 *
 * This is DESIGN.md §11's single exception, and it is the same two levels the exception names:
 * `w5-02`, where sensing is the mechanic, and `w8-01`, where re-sensing replaces remembering.
 * Printing "here is what changes between seeds" on either would be printing the answer. Both say
 * so in their brief, which is what makes the withholding perfect information rather than a gotcha.
 *
 * Adding a third entry is a design decision about a level, not a way to skip writing two lines.
 */
const FINDING_THE_SHAPE_IS_THE_PUZZLE: readonly string[] = ['w5-02', 'w8-01'];

describe('the board block', () => {
  for (const level of LEVELS) {
    const exempt = FINDING_THE_SHAPE_IS_THE_PUZZLE.includes(level.id);

    test(`${level.id} ${exempt ? 'withholds its shape on purpose' : 'says what its seeds share'}`, () => {
      if (exempt) {
        expect(level.board).toBeUndefined();
        return;
      }
      expect(level.board).toBeDefined();
      expect(level.board?.fixed.length ?? 0).toBeGreaterThan(0);
      expect(level.board?.redrawn.length ?? 0).toBeGreaterThan(0);
    });
  }

  test('the exemption list names only levels that exist', () => {
    const ids = new Set(LEVELS.map((level) => level.id));
    expect(FINDING_THE_SHAPE_IS_THE_PUZZLE.filter((id) => !ids.has(id))).toEqual([]);
  });

  /**
   * A single-seed level has nothing to redraw, and `w1-01` is the campaign's declared hardcode
   * exception (CURRICULUM §2 rule 2) — a memorised path is the intended answer there. It still
   * files a `redrawn` row, because the row a player needs on that sheet is the one that says
   * *nothing* is redrawn. Saying it explicitly is what stops them surveying a board that will
   * never change.
   */
  test('a single-seed order says so rather than leaving the row empty', () => {
    for (const level of LEVELS.filter((candidate) => candidate.seeds.length === 1)) {
      expect(level.board?.redrawn.join(' ')).toMatch(/nothing|single seed|one seed|never/i);
    }
  });
});
