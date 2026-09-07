/**
 * The failure's two cells, recovered from the report so the board can keep them.
 *
 * The one thing the game computes about *where* a run went wrong must outlive the report that
 * names it. On the desk the report is paper and stays on the desk, so the sentence survives — but
 * the requirement is that the *place* survives too, marked on the site view where the two
 * coordinates are.
 *
 * **Bound by: feedback is a diff and never an oracle.** Marking the two cells the engine already
 * computed is a diff. Drawing the route between them that the player should have taken is an
 * oracle, and nothing here goes near one — this reads coordinates and marks them, and it invents
 * nothing that was not already printed on the certificate.
 *
 * It parses, and that is a known weakness rather than a preference. `Divergence` in
 * `src/engine/objectives.ts` is three strings — `where`, `expected`, `received` — written in each
 * objective's own unit: `line 3`, `tick 12`, `(4, 6)`, `the depot at (5, 3)`, `sub-5 · tick 74`.
 * The cells are in there because `src/levels/world-3/objectives.ts` `at()` writes every coordinate
 * the same way, but they are in there as *prose*, and this codebase has already been burned once by
 * reading meaning out of player-facing text: `BudgetMeter` exists because `budgetFor` used to work
 * out which meter an objective was denominated in by matching its English label, and rewording a
 * label silently changed the score. The honest fix is the same one that finding got — a declared
 * field, `Divergence.cells?: readonly Vec[]`, populated where a level already has the vectors in
 * hand. That is an `src/engine` and `src/levels` change and this lane does not own either.
 *
 * Until then: a strict scan, clamped to the board, capped at two, and silent when it finds nothing.
 * A divergence about a line number or a printed figure simply marks nothing, which is correct.
 */
import type { Vec, World } from '../../../engine/index.ts';

/** `(4, 6)` and `(23,12)`. Deliberately strict: no bare pairs, no negatives, no ranges. */
const COORDINATE = /\((\d{1,3}),\s*(\d{1,3})\)/g;

export interface ReportCause {
  where: string;
  want: string;
  got: string;
}

/**
 * Up to two cells, `want` before `got`, falling back to `where` when the pair says nothing.
 *
 * `want` first because that is the order the report prints them in, and the player who has just
 * read the certificate is looking for the first one they read.
 */
export function divergenceCells(cause: ReportCause | null, world: World | null): Vec[] {
  if (!cause || !world) return [];
  const cells: Vec[] = [];
  const seen = new Set<string>();
  const scan = (text: string): void => {
    COORDINATE.lastIndex = 0;
    let match = COORDINATE.exec(text);
    while (match && cells.length < 2) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      const key = `${String(x)},${String(y)}`;
      if (x < world.w && y < world.h && !seen.has(key)) {
        seen.add(key);
        cells.push({ x, y });
      }
      match = COORDINATE.exec(text);
    }
  };
  scan(cause.want);
  scan(cause.got);
  if (cells.length === 0) scan(cause.where);
  return cells;
}

/** `want (23, 12) · got (21, 12)`, for the strip under the picture. Empty when nothing is marked. */
export function divergenceLine(cause: ReportCause | null, cells: readonly Vec[]): string {
  if (!cause || cells.length === 0) return '';
  const at = (cell: Vec): string => `(${String(cell.x)}, ${String(cell.y)})`;
  if (cells.length === 1) return `MARKED ${at(cells[0] as Vec)}`;
  return `WANT ${at(cells[0] as Vec)} · GOT ${at(cells[1] as Vec)}`;
}
