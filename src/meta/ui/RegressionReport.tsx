import type * as React from 'react';
import { MEDAL_WORDS, REGRESSION } from '../copy.ts';
import { needsAttention, readershipLines, summarise, summaryLine } from '../regression.ts';
import { lastKnownGoodRevision } from '../save.ts';
import { useLibrary } from '../store.ts';
import type { RegressionEntry } from '../types.ts';
import './library.css';

function detailOf(entry: RegressionEntry): string {
  const parts: string[] = [];
  if (entry.beforeTicks !== undefined && entry.afterTicks !== undefined) {
    parts.push(`${entry.beforeTicks} → ${entry.afterTicks} ticks`);
  } else if (entry.afterTicks !== undefined) {
    parts.push(`${entry.afterTicks} ticks`);
  }
  if (entry.beforeMedal && entry.afterMedal && entry.beforeMedal !== entry.afterMedal) {
    parts.push(`${MEDAL_WORDS[entry.beforeMedal]} → ${MEDAL_WORDS[entry.afterMedal]}`);
  }
  if (entry.failure?.file === 'lib' && entry.failure.line !== undefined) {
    parts.push(`lib.ts line ${entry.failure.line}`);
  }
  return parts.join(' · ');
}

export function RegressionReport(): React.JSX.Element {
  const suite = useLibrary((state) => state.suite);
  const progress = useLibrary((state) => state.suiteProgress);
  const save = useLibrary((state) => state.save);
  const accept = useLibrary((state) => state.acceptResults);
  const dismiss = useLibrary((state) => state.dismissSuite);
  const revert = useLibrary((state) => state.revertToLastKnownGood);
  const readersOf = useLibrary((state) => state.readers);

  if (progress) {
    return <p className="lib__note">{REGRESSION.running(progress.done, progress.total)}</p>;
  }
  if (!suite) {
    return (
      <div>
        <p className="lib__note">{REGRESSION.lede}</p>
        {readershipLines(readersOf()).map((line) => (
          <p key={line} className="lib__empty">
            {line}
          </p>
        ))}
      </div>
    );
  }

  const summary = summarise(suite.run);
  const attention = needsAttention(summary);
  const known = lastKnownGoodRevision(save);

  return (
    <div>
      <p className="lib__note">{REGRESSION.lede}</p>
      <p className={attention ? 'lib__warn' : 'lib__note'}>{summaryLine(summary)}</p>

      {suite.run.entries.map((entry) => (
        <div key={entry.levelId} className={`lib-entry lib-entry--${entry.state}`}>
          <span className="lib-entry__state">{entry.state}</span>
          <span>{entry.note ?? entry.levelId}</span>
          <span className="lib__spacer" />
          <span className="lib-entry__detail">{detailOf(entry)}</span>
        </div>
      ))}

      <div className="lib-modal__actions">
        <button
          type="button"
          className="lib__btn lib__btn--danger"
          disabled={!known}
          onClick={() => void revert()}
          title={known ? REGRESSION.revertConfirm(save.revisions.length) : undefined}
        >
          {REGRESSION.revert}
        </button>
        <button
          type="button"
          className="lib__btn"
          onClick={accept}
          title={REGRESSION.acceptConfirm}
        >
          {REGRESSION.accept}
        </button>
        <span className="lib__spacer" />
        <button type="button" className="lib__btn" onClick={dismiss}>
          Close
        </button>
      </div>

      <p className="lib-modal__footnote">{REGRESSION.footnote}</p>
    </div>
  );
}
