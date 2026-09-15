import { InlineMarkdown, Markdown } from '../components/Markdown.tsx';
import { ObjectiveItem } from './ObjectiveItem.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

export interface DossierProps {
  workspace: WorkspaceData;
}

export function Dossier({ workspace }: DossierProps): React.ReactElement | null {
  const brief = workspace.brief;
  if (!brief) return null;
  const shown = Math.min(workspace.hintsRevealed, workspace.hints.length);

  return (
    <>
      <div className="dossier-section dossier-section--brief">
        <h2 className="dossier-section__title">Brief</h2>
        <Markdown source={brief.prose} className="dossier-brief" />
      </div>

      <div className="dossier-section">
        <h2 className="dossier-section__title">What this order grades</h2>
        <ul>
          {[...workspace.objectives, ...workspace.bonus].map((row) => (
            <ObjectiveItem key={row.id} row={row} />
          ))}
        </ul>
      </div>

      {brief.facts.length === 0 ? null : (
        <div className="dossier-section">
          <h2 className="dossier-section__title">Facts</h2>
          {brief.facts.map((fact) => (
            <p className="fact-row" key={fact.label}>
              <span className="fact-row__label">{fact.label}</span>
              <span className="note">
                <InlineMarkdown source={fact.value} />
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="dossier-section">
        <h2 className="dossier-section__title">What is true of this board</h2>
        {brief.board === null ? (
          <p className="note">One fixed board. Nothing is rolled between seeds.</p>
        ) : (
          <>
            <p className="note dossier-lead">
              What the board is, stated before you run anything. Fixed lines hold on every seed.
              Redrawn lines are rolled again for each seed.
            </p>
            {brief.board.fixed.map((item) => (
              <p className="board-row" key={item}>
                <span className="board-tag" data-kind="fixed">
                  Fixed
                </span>
                <span className="note">
                  <InlineMarkdown source={item} />
                </span>
              </p>
            ))}
            {brief.board.redrawn.map((item) => (
              <p className="board-row" key={item}>
                <span className="board-tag" data-kind="redrawn">
                  Redrawn
                </span>
                <span className="note">
                  <InlineMarkdown source={item} />
                </span>
              </p>
            ))}
          </>
        )}
        <p className="board-row">
          <span className="board-tag">Seeds</span>
          {workspace.seedsUnlocked ? (
            <span className="seed-picker">
              {brief.seeds.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  className="control control--tight"
                  aria-label={`Draw seed ${String(seed)}`}
                  aria-pressed={workspace.surveySeed === seed}
                  onClick={() => workspace.showSeed(seed)}
                >
                  {String(seed)}
                </button>
              ))}
              {workspace.surveySeed === null ? null : (
                <button
                  type="button"
                  className="control control--tight"
                  onClick={() => workspace.showSeed(null)}
                >
                  {workspace.surveyHolding ? 'Return to the run' : 'Close the survey'}
                </button>
              )}
            </span>
          ) : (
            <span className="note">{brief.seeds.join(' · ')}</span>
          )}
        </p>
      </div>

      {workspace.hints.length === 0 && workspace.seedsUnlocked ? null : (
        <div className="dossier-section">
          <h2 className="dossier-section__title">Field notes</h2>
          {workspace.hints.slice(0, shown).map((hint, index) => (
            <div className="field-note" key={hint}>
              <span className="field-note__index">{String(index + 1).padStart(2, '0')} </span>
              <span className="note">{hint}</span>
            </div>
          ))}
          {shown >= workspace.hints.length && workspace.seedsUnlocked ? null : (
            <div className="field-note-asks">
              {shown >= workspace.hints.length ? null : (
                <button
                  type="button"
                  className="control"
                  onClick={() => workspace.revealHint(shown + 1)}
                >
                  Request note {String(shown + 1)} of {String(workspace.hints.length)}
                </button>
              )}
              {workspace.seedsUnlocked ? null : (
                <button type="button" className="control" onClick={() => workspace.unlockSeeds()}>
                  Request the seed survey
                </button>
              )}
            </div>
          )}
          {workspace.seedsUnlocked ? null : (
            <p className="note field-note-asks__caption">
              The survey draws any seed on this order&rsquo;s schedule. You can dispatch against a
              drawn seed, but a single-seed run is never graded.
            </p>
          )}
        </div>
      )}
    </>
  );
}
