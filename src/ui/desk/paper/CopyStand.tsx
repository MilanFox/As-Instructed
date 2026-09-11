import { currentLevel, useGame } from '../../../game/store.ts';
import { InlineMarkdown } from '../../components/Markdown.tsx';
import { hardwareNote } from '../../copy.ts';
import type { DeskDoc, PinnedPage } from './papers.ts';
import { docById, usePapers } from './papers.ts';

export function CopyStand(): React.JSX.Element {
  const pinnedId = usePapers((state) => state.pinned);
  const storedPage = usePapers((state) => state.pinnedPage);
  const unpin = usePapers((state) => state.unpin);
  const doc = usePapers((state) => docById(state, pinnedId));
  const level = useGame(currentLevel);

  const page = doc ? pageFor(doc, level) : storedPage;

  return (
    <div className="copystand">
      <div className="cs-foot" />
      <div className="cs-post" />
      <div className="cs-board">
        <div className="cs-clip" />
        <div className="cs-page">
          {page ? (
            <>
              <div className="cs-head">
                <b>{page.head[0]}</b>
                <span>{page.head[1]}</span>
              </div>
              <div className="cs-ask">
                {page.ask.split('\n').map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="cs-facts">
                {page.facts.map((fact) => (
                  <div key={fact.label}>
                    <b>
                      <InlineMarkdown source={fact.label} />
                    </b>
                    <span>
                      <InlineMarkdown source={fact.value} />
                    </span>
                  </div>
                ))}
              </div>
              <button type="button" className="cs-unpin" onClick={unpin}>
                unpin
              </button>
            </>
          ) : (
            <div className="cs-empty">
              <b>COPY STAND</b>
              <span>
                Nothing pinned. Press the red pin at the top-left corner of a work order or a
                requisition and its specification is held here, at a size you can read from the
                keyboard, for as long as you need it.
              </span>
              <small>K&amp;D FORM 40/A · issued 2206</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Level = ReturnType<typeof currentLevel>;

function pageFor(doc: DeskDoc, level: Level): PinnedPage | null {
  if (doc.payload.kind === 'order') {
    if (!level || level.id !== doc.payload.levelId) return null;
    return {
      head: ['WORK ORDER', level.id.toUpperCase()],
      ask: level.objectives.map((objective) => objective.label).join('\n'),
      facts: (level.facts ?? []).map((fact) => ({ label: fact.label, value: fact.value })),
    };
  }
  if (doc.payload.kind === 'requisition') {
    const hardware = doc.payload.hardware;
    return {
      head: ['REQUISITION', doc.payload.levelId.toUpperCase()],
      ask: `${String(hardware.length)} command${hardware.length === 1 ? ' was' : 's were'} fitted to the bot.`,
      facts: [
        ...hardware.map((name) => ({
          label: `\`${name}()\``,
          value: hardwareNote(name).spec,
        })),
        {
          label: 'Note',
          value: 'A subroutine is charged at the point of use, in full, on every call.',
        },
      ],
    };
  }
  return null;
}
