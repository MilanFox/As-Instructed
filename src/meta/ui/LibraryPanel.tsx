import type * as React from 'react';
import { REFACTOR, REGRESSION, REPOSITORY_NAME, UNLOCK_MEMO, UNLOCK_NOTE } from '../copy.ts';
import { openDiscrepancies } from '../discrepancy.ts';
import { useLibrary } from '../store.ts';
import type { MetaPanel } from '../store.ts';
import { DiscrepancyList } from './DiscrepancyList.tsx';
import { LibraryEditor } from './LibraryEditor.tsx';
import { RefactorScreen } from './RefactorScreen.tsx';
import { RegressionReport } from './RegressionReport.tsx';
import './library.css';

/**
 * The Repository, as one tabbed panel.
 *
 * The whole metagame mounts here so the workspace only has to make room for one thing. Before the
 * unlock this component renders nothing at all — no tab, no badge, no hint that anything is
 * missing — which is what keeps the first three worlds a one-file game.
 */

const TABS: { id: MetaPanel; label: string }[] = [
  { id: 'library', label: 'lib.ts' },
  { id: 'refactor', label: 'Cost' },
  { id: 'regression', label: 'Regression' },
  { id: 'discrepancies', label: 'Discrepancies' },
];

/** Delivered once. The player reads it, and it never appears again. */
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
  const suite = useLibrary((state) => state.suite);

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
            {tab.id === 'regression' && (busy || suite) ? (
              <span className="lib__badge">•</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={flush ? 'lib__body lib__body--flush' : 'lib__body'}>
        {panel === 'library' ? <LibraryEditor /> : null}
        {panel === 'refactor' ? <RefactorScreen /> : null}
        {panel === 'regression' ? <RegressionReport /> : null}
        {panel === 'discrepancies' ? <DiscrepancyList /> : null}
      </div>
    </section>
  );
}

/** One line for the workspace status bar: what the Repository is doing right now, if anything. */
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
