/**
 * The work order. The company telling you what it wants.
 *
 * Two carried findings are answered by the order this is printed in.
 *
 * **`docs/AUDIT-UI.md` F4 — the escape hatch is at the top.** Measured on `w1-01`, the brief was
 * 949px of content in a 300px box and `Request hint {n} of {n}` was the last element of the last
 * section, below the head, the body, Site data, Hardware requisition, the fitted chips, the
 * Repository routines and Field notes. Assume nobody reads: the field-notes strip is now the first
 * thing under the addressing block, above the prose, so the answer to "I am stuck" is on screen
 * the moment the sheet is picked up whatever the window is doing.
 *
 * **F4's second half — the hardware block is gone.** The order used to print `Hardware requisition
 * — Delivered with this order` with the same four chips the requisition ceremony had shown a
 * minute earlier. On the desk the requisition is its own sheet that stays, and the reference
 * manual carries what is already fitted, so the duplicate has nowhere left to be.
 */
import { currentLevel, useGame } from '../../../game/store.ts';
import { worldMeta } from '../../../levels/index.ts';
import { requirementsFor } from '../../../meta/index.ts';
import { InlineMarkdown, Markdown } from '../../components/Markdown.tsx';
import { usePapers } from './papers.ts';

export function WorkOrder(): React.JSX.Element | null {
  const level = useGame(currentLevel);
  const revealed = useGame((state) => (level ? (state.save.levels[level.id]?.hintsRevealed ?? 0) : 0));
  const revealHint = useGame((state) => state.revealHint);

  if (!level) return null;

  const world = worldMeta(level.world);
  const facts = level.facts ?? [];
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
                /*
                 * The sheet lies at the desk edge, so the hint the player just asked for arrived
                 * one line above the bottom of the window and every further rung of the SIZE dial
                 * pushed it further off. Requesting a hint is a deliberate act of reading, and
                 * `docs/AUDIT-UI.md` F15's answer to reading is enlarge — so the order comes up to
                 * reading size, where the field notes strip is the first thing under the head.
                 */
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

      <div className="ref">
        KD-{level.id.toUpperCase()} · SHEET 1 OF 1
      </div>
    </>
  );
}
