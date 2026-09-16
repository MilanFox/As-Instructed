import type * as React from 'react';
import { REFACTOR, REGRESSION, REPOSITORY_NAME, UNLOCK_MEMO, UNLOCK_NOTE } from '../copy.ts';
import { openDiscrepancies } from '../discrepancy.ts';
import { needsAttention, worthShowing } from '../regression.ts';
import { suiteSummary, useLibrary } from '../store.ts';
import type { MetaPanel } from '../store.ts';
import { DiscrepancyList } from './DiscrepancyList.tsx';
import { LibraryEditor } from './LibraryEditor.tsx';
import { RefactorScreen } from './RefactorScreen.tsx';
import { RegressionReport } from './RegressionReport.tsx';
import { StructureScreen } from './StructureScreen.tsx';
import './library.css';

const TABS: { id: MetaPanel; label: string }[] = [
  { id: 'library', label: 'lib.ts' },
  { id: 'refactor', label: 'Cost' },
  { id: 'structure', label: 'Structure' },
  { id: 'regression', label: 'Regression' },
  { id: 'discrepancies', label: 'Discrepancies' },
];

export function UnlockMemo(): React.JSX.Element {
  const markBriefed = useLibrary((state) => state.markBriefed);
  return (
    <div className="lib-memo">
      <div className="lib-memo__head">
        {UNLOCK_MEMO.ref}
        <br />
        FROM: {UNLOCK_MEMO.from}
        <br />
        CC: {UNLOCK_MEMO.cc}
        <br />
        RE: {UNLOCK_MEMO.re}
      </div>
      <div className="lib-memo__body">
        {UNLOCK_MEMO.body.split('\n\n').map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="lib-memo__dot">{UNLOCK_NOTE}</div>
      <p className="lib-memo__legal">{UNLOCK_MEMO.legal[0]}</p>
      <div className="lib-modal__actions">
        <button type="button" className="lib__btn lib__btn--primary" onClick={markBriefed}>
          Acknowledge
        </button>
      </div>
    </div>
  );
}

export function LibraryPanel(): React.JSX.Element | null {
  const save = useLibrary((state) => state.save);
  const panel = useLibrary((state) => state.panel);
  const setPanel = useLibrary((state) => state.setPanel);
  const busy = useLibrary((state) => state.busy);
  const summary = useLibrary(suiteSummary);

  if (!save.unlocked) return null;
  if (!save.briefed) {
    return (
      <section className="lib" aria-label={REPOSITORY_NAME}>
        <div className="lib__body">
          <UnlockMemo />
        </div>
      </section>
    );
  }

  const openCount = openDiscrepancies(save).filter((each) => !each.seen).length;
  const flagRegression = busy || (summary !== undefined && worthShowing(summary));
  const regressionAlarms = summary !== undefined && needsAttention(summary);
  const flush = panel === 'library';

  return (
    <section className="lib" aria-label={REPOSITORY_NAME}>
      <div className="lib__tabs" role="tablist" aria-label={REPOSITORY_NAME}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="lib__tab"
            aria-selected={panel === tab.id}
            onClick={() => setPanel(tab.id)}
          >
            {tab.label}
            {tab.id === 'discrepancies' && openCount > 0 ? (
              <span className="lib__badge">{openCount}</span>
            ) : null}
            {tab.id === 'regression' && flagRegression ? (
              <span className={regressionAlarms ? 'lib__badge' : 'lib__badge lib__badge--ok'}>
                •
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={flush ? 'lib__body lib__body--flush' : 'lib__body'}>
        {panel === 'library' ? <LibraryEditor /> : null}
        {panel === 'refactor' ? <RefactorScreen /> : null}
        {panel === 'structure' ? <StructureScreen /> : null}
        {panel === 'regression' ? <RegressionReport /> : null}
        {panel === 'discrepancies' ? <DiscrepancyList /> : null}
      </div>
    </section>
  );
}

export function libraryStatusLine(state: {
  busy: boolean;
  suiteProgress: { done: number; total: number } | null;
  save: { published: { name: string }[] };
}): string {
  if (state.suiteProgress) {
    return REGRESSION.running(state.suiteProgress.done, state.suiteProgress.total);
  }
  if (state.save.published.length === 0) return REFACTOR.empty;
  const count = state.save.published.length;
  return `${count} ${count === 1 ? 'subroutine' : 'subroutines'} published.`;
}
