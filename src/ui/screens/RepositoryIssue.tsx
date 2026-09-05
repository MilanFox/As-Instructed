import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useGame } from '../../game/store.ts';
import { campaignOrder } from '../../levels/index.ts';
// Deep imports on purpose: `src/meta/ui/index.ts` re-exports `LibraryPanel`, which pulls Monaco
// into whatever chunk reaches it, and this note is rendered from the entry chunk.
import { REPOSITORY_ISSUE } from '../../meta/copy.ts';
import { useLibrary } from '../../meta/store.ts';
import {
  isDeliveryNoteOwed,
  nextRequirementAfter,
  requirementLevelCount,
} from '../../meta/unlock.ts';
import { audio } from '../audio.ts';
import { useReveal } from '../hooks/useReveal.ts';
import './repository-issue.css';

/**
 * The Repository's delivery note.
 *
 * DESIGN.md §7: "Hardware unlocks are a ceremony." The Repository is not hardware, but it is the
 * biggest capability the game hands over, and until this existed it was the only one that arrived
 * without one — `save.unlocked` flipped, a grey status bar appeared along the bottom of the editor,
 * and the memo explaining the whole system sat behind the toggle nobody clicked.
 *
 * It shares `Requisition`'s markup and classes rather than inventing a second visual language,
 * because the inconsistency *was* the defect. Three jobs, and nothing else: state that a second
 * file now exists, show what will ask for it, and put the player one click from opening it.
 *
 * Shown once, ever. `save.briefed` is in the Repository save and both buttons set it.
 */
export function RepositoryIssue(): JSX.Element | null {
  const owed = useLibrary((state) => isDeliveryNoteOwed(state.save));
  const screen = useGame((state) => state.screen);
  const showResults = useGame((state) => state.showResults);
  const requisition = useGame((state) => state.requisition);

  // Queued behind the medal and behind the hardware crate. Two ceremonies on one transition is
  // already one more than the veteran wanted; two ceremonies *stacked* is the thing he named.
  if (!owed) return null;
  if (screen !== 'workspace' || showResults || requisition) return null;
  return <IssueNote />;
}

function IssueNote(): JSX.Element {
  const markBriefed = useLibrary((state) => state.markBriefed);
  const setPanel = useLibrary((state) => state.setPanel);
  const currentLevelId = useGame((state) => state.currentLevelId);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const next = nextRequirementAfter(
    campaignOrder().map((level) => level.id),
    currentLevelId,
  );
  const sample = next?.requirements[0]?.name ?? 'pathTo';

  const { stage, done, skip } = useReveal(2, celebrations, 260);

  useEffect(() => {
    if (done) primaryRef.current?.focus({ preventScroll: true });
  }, [done]);

  const cued = useRef(0);
  useEffect(() => {
    for (let step = cued.current + 1; step <= stage; step++) audio.cue('spawn', step);
    cued.current = Math.max(cued.current, stage);
  }, [stage]);

  const open = (): void => {
    markBriefed();
    setPanel('library');
  };

  return (
    <div className="overlay" role="presentation">
      <div
        className="modal modal--requisition"
        role="dialog"
        aria-modal="true"
        aria-label="Shared Subroutines Repository provisioned"
        onClick={() => {
          if (!done) skip();
        }}
        onKeyDownCapture={() => {
          if (!done) skip();
        }}
      >
        <header className="requisition__head">
          <p className="requisition__from numeric">{REPOSITORY_ISSUE.from}</p>
          <h2 className="requisition__title">{REPOSITORY_ISSUE.title}</h2>
          <p className="requisition__intro">{REPOSITORY_ISSUE.intro}</p>
        </header>

        <div className="requisition__body">
          <article className={stage > 0 ? 'crate crate--in' : 'crate crate--out'}>
            <div className="crate__head">
              <code className="crate__name">{REPOSITORY_ISSUE.file}</code>
            </div>
            <p className="crate__spec">{REPOSITORY_ISSUE.spec}</p>
            <pre className="issue__code">
              <code>{`import { ${sample} } from 'lib';`}</code>
            </pre>
            <p className="crate__opens">{REPOSITORY_ISSUE.importLabel}</p>
          </article>

          <aside className={stage > 1 ? 'issue__asks issue__asks--in' : 'issue__asks'}>
            <p className="issue__asks-line">
              {REPOSITORY_ISSUE.asksLabel(requirementLevelCount())}{' '}
              <code>{next?.levelId ?? 'w4-05'}</code>.
            </p>
            <p className="issue__charge">{REPOSITORY_ISSUE.perCall}</p>
          </aside>
        </div>

        <aside className="requisition__dot">
          <span className="memo__dot-tag">dot:</span>
          <p>{REPOSITORY_ISSUE.dot}</p>
        </aside>

        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={markBriefed}>
            {REPOSITORY_ISSUE.dismiss}
          </button>
          <span className="modal__foot-spacer" />
          <button type="button" className="btn btn--run" ref={primaryRef} onClick={open}>
            {REPOSITORY_ISSUE.open}
          </button>
        </footer>
      </div>
    </div>
  );
}
