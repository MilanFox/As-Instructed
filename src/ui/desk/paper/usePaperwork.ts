/**
 * The company's side of the desk: what arrives on it, and when.
 *
 * Every ceremony in this game used to be a modal that destroyed itself, and the run report was
 * the worst of them: `showResults` was set true by a run and by
 * nothing else, so a stray click on the backdrop took the medal, the cause, the divergence, the
 * objectives, the record and the seeds with it and the only route back was to run the program
 * again. **That is a data-loss bug, not a styling complaint.**
 *
 * So nothing here opens anything. It *issues* paper, and paper stays on the desk until it is
 * filed — stamped or acknowledged — and filed paper goes into the commendation book rather than
 * to nowhere. The standing sheet is never filed, because a grade delivered once and then deleted
 * is not a grade, it is an event (F18). Signing a requisition is not filing either — it stows the sheet
 * rather than filing it into the book, so the delivery note it signed for stays reachable.
 *
 * `deliverPaperwork` is the whole of it and it is a plain function: every issue is idempotent by
 * id, so running it too often is free and running it once too few times is the only failure mode
 * worth designing against. The hook is six lines of "when might that have changed".
 */
import { useEffect } from 'react';

import { useGame } from '../../../game/store.ts';
import { useLibrary } from '../../../meta/store.ts';
import { isDeliveryNoteOwed } from '../../../meta/unlock.ts';
import { reviewOwed } from '../../screens/review.ts';
import type { DocKind, DocPayload } from './papers.ts';
import { DOC_ARRIVAL, DOC_HOME, usePapers } from './papers.ts';
import { snapshotReport } from './report.ts';

/**
 * Put a sheet on the desk, once.
 *
 * Idempotent by id, including for paper that has already been filed: re-issuing a certificate the
 * player stamped last week would hand them the same work order to close twice.
 */
function issueOnce(
  id: string,
  kind: DocKind,
  payload: DocPayload,
  home = DOC_HOME[kind],
  stowed = true,
): void {
  const papers = usePapers.getState();
  if (papers.docs.some((doc) => doc.id === id)) return;
  papers.issue({ id, kind, home, stowed, payload });
}

/** Everything the company owes you right now, on the desk. Safe to call at any time. */
export function deliverPaperwork(): void {
  /* Always on the desk, and it is the only sheet with no way off it. */
  issueOnce('standing', 'standing', { kind: 'standing' });

  const game = useGame.getState();

  /*
   * A work order the player has never opened lands in front of them; one they have run before
   * lands where a read order lives, off to the side. That is the difference between the desk at
   * rest and the desk mid-run.
   */
  if (game.screen === 'workspace' && game.currentLevelId) {
    const levelId = game.currentLevelId;
    issueOnce(
      `order:${levelId}`,
      'order',
      { kind: 'order', levelId },
      game.save.levels[levelId] ? DOC_HOME.order : DOC_ARRIVAL,
      /*
       * The order always lies out. Everything else goes to the in-tray, because five documents
       * arriving at once buried both screens and the program is the largest thing on this desk
       * while it is being written. The requisition below is the one exception, and only at the
       * moment it is granted.
       */
      false,
    );
    /*
     * Retire the *other* work orders, and only after this one is on the desk. The shell used to do
     * this on its own mount and it raced the issue — `issueOnce` will not re-issue an id it has
     * already seen, so a clear that won left the player at a desk with no brief on it, and a
     * player who cannot find the brief cannot play. Issuing and retiring are one decision.
     */
    usePapers.getState().clearLevelPaper();
  }

  /*
   * A run finished. Snapshot it and hand the player the paper, then tell the store the report has
   * been delivered so it does not deliver it again. The snapshot is the point: the store's
   * `verdict`, `failureCursor` and `personalBest` are all overwritten by the next run.
   */
  if (game.showResults) {
    const report = snapshotReport(game);
    game.dismissResults();
    if (report) {
      const kind = report.passed ? 'certificate' : 'halt';
      issueOnce(`${kind}:${report.levelId}:${String(game.resultId)}`, kind, { kind, report });
    }
  }

  if (game.requisition) {
    issueOnce(
      `requisition:${game.requisition.levelId}`,
      'requisition',
      {
        kind: 'requisition',
        levelId: game.requisition.levelId,
        hardware: [...game.requisition.hardware],
      },
      DOC_HOME.requisition,
      /*
       * Opens on the level that grants it, same as the order — a delivery note nobody sees land is
       * a delivery note nobody signs. `issueOnce` never re-issues an id it has already handed out,
       * so this is the only moment it surfaces; the signature is a quiet way back to the tray, not
       * the only way to notice the sheet.
       */
      false,
    );
  }

  if (isDeliveryNoteOwed(useLibrary.getState().save)) {
    issueOnce('issue:repository', 'issue', { kind: 'issue' });
  }

  /*
   * The memo used to be raised on the site map, on the grounds that it was the one screen with no
   * ceremony on it. The desk has no ceremonies to stack behind, so it arrives at the desk, which
   * is where a memo arrives. DESIGN.md §7.1 still binds: it is a memo, not a screen.
   */
  const tier = reviewOwed(game.save);
  if (tier) {
    issueOnce(`memo:${String(tier.rank)}`, 'memo', { kind: 'memo', rank: tier.rank });
  }
}

/** Called once, from `App`. */
export function usePaperwork(): void {
  const screen = useGame((state) => state.screen);
  const levelId = useGame((state) => state.currentLevelId);
  const resultId = useGame((state) => state.resultId);
  const showResults = useGame((state) => state.showResults);
  const requisition = useGame((state) => state.requisition);
  const runState = useGame((state) => state.runState);
  const save = useGame((state) => state.save);
  const librarySave = useLibrary((state) => state.save);

  useEffect(() => {
    deliverPaperwork();
  }, [screen, levelId, resultId, showResults, requisition, save, librarySave]);

  /*
   * A held sheet is over the site monitor — that is where the lift parks it, so it never covers
   * the terminal. Dispatching a program puts it down, because the run is the thing you asked to
   * watch and paper in front of it is paper in the way.
   */
  useEffect(() => {
    if (runState !== 'running') return;
    usePapers.getState().putDown();
  }, [runState]);
}
