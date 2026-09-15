import { useEffect } from 'react';

import { useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/store.ts';
import { isDeliveryNoteOwed } from '../../meta/unlock.ts';
import { reviewOwed } from '../screens/review.ts';
import type { DocKind, DocPayload } from './papers.ts';
import { DOC_ARRIVAL, DOC_HOME, usePapers } from './papers.ts';
import { snapshotReport } from './report.ts';

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

export function deliverPaperwork(): void {
  const game = useGame.getState();

  if (game.screen === 'workspace' && game.currentLevelId) {
    const levelId = game.currentLevelId;
    issueOnce(
      `order:${levelId}`,
      'order',
      { kind: 'order', levelId },
      game.save.levels[levelId] ? DOC_HOME.order : DOC_ARRIVAL,
      false,
    );
    usePapers.getState().clearLevelPaper();
  }

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
      false,
    );
  }

  if (isDeliveryNoteOwed(useLibrary.getState().save)) {
    issueOnce('issue:repository', 'issue', { kind: 'issue' });
  }

  const tier = reviewOwed(game.save);
  if (tier) {
    issueOnce(`memo:${String(tier.rank)}`, 'memo', { kind: 'memo', rank: tier.rank });
  }
}

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

  useEffect(() => {
    if (runState !== 'running') return;
    usePapers.getState().putDown();
  }, [runState]);
}
