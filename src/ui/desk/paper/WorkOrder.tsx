import { currentLevel, useGame } from '../../../game/store.ts';
import { worldMeta } from '../../../levels/index.ts';
import { requirementsFor } from '../../../meta/index.ts';
import { InlineMarkdown, Markdown } from '../../components/Markdown.tsx';
import { usePapers } from './papers.ts';

export function WorkOrder(): React.JSX.Element | null {
  const level = useGame(currentLevel);
  const revealed = useGame((state) =>
    level ? (state.save.levels[level.id]?.hintsRevealed ?? 0) : 0,
  );
  const revealHint = useGame((state) => state.revealHint);

  if (!level) return null;

  const world = worldMeta(level.world);
  const facts = level.facts ?? [];
  const board = level.board;
  const routines = requirementsFor(level.id);
  const hints = level.hints;

  return (
    <>
      <h1>
        <b>WORK ORDER</b>
        <span>{level.id.toUpperCase()}</span>
      </h1>
      <h2>{level.title}</h2>
      <div className="kicker">
        {world ? `${world.name} · ${world.subtitle}` : `WORLD ${String(level.world)}`}
      </div>

      <dl className="meta">
        <dt>FROM</dt>
        <dd>Field Eng. D. Halloran</dd>
        <dt>TO</dt>
        <dd>Contractor #4471</dd>
        <dt>SEEDS</dt>
        <dd className="numeric">{level.seeds.join('  ')}</dd>
      </dl>

      {hints.length > 0 ? (
        <section className="notes">
          <div className="notes__head">
            <b>FIELD NOTES</b>
            <span>D. Halloran — asking costs you nothing</span>
          </div>
          {revealed > 0 ? (
            <ol className="notes__list">
              {hints.slice(0, revealed).map((hint, index) => (
                <li key={hint}>
                  <span className="notes__mark numeric">dot {index + 1}</span>
                  <Markdown source={hint} />
                </li>
              ))}
            </ol>
          ) : null}
          {revealed < hints.length ? (
            <button
              type="button"
              className="act"
              onClick={(event) => {
                event.stopPropagation();
                revealHint(revealed + 1);
                const id = `order:${level.id}`;
                if (usePapers.getState().lifted !== id) usePapers.getState().lift(id);
              }}
            >
              Request hint {revealed + 1} of {hints.length}
            </button>
          ) : (
            <p className="quiet">That is everything she wrote down.</p>
          )}
        </section>
      ) : null}

      <Markdown source={level.brief} />

      {facts.length > 0 ? (
        <div className="facts">
          {facts.map((fact) => (
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
      ) : null}

      {board ? (
        <div className="facts">
          <div>
            <b>THE BOARD</b>
            <span>Every seed of this order shares the first row. The second row is redrawn.</span>
          </div>
          <div>
            <b>SAME EVERY SEED</b>
            <span>
              <InlineMarkdown source={board.fixed.join(' · ')} />
            </span>
          </div>
          <div>
            <b>REDRAWN PER SEED</b>
            <span>
              <InlineMarkdown source={board.redrawn.join(' · ')} />
            </span>
          </div>
        </div>
      ) : null}

      {routines.length > 0 ? (
        <div className="facts">
          <div>
            <b>REPOSITORY</b>
            <span>Taken from your Repository. Not in there yet? Write it in this work order.</span>
          </div>
          {routines.map((routine) => (
            <div key={routine.name}>
              <b>
                <code>{routine.name}</code>
              </b>
              <span>
                <code>{routine.signature}</code> — {routine.assumes}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ref">KD-{level.id.toUpperCase()} · SHEET 1 OF 1</div>
    </>
  );
}
