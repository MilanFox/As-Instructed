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
      <div className="dossier-section">
        <h2 className="dossier-section__title">What this order grades</h2>
        <ul>
          {[...workspace.objectives, ...workspace.bonus].map((row) => (
            <ObjectiveItem key={row.id} row={row} />
          ))}
        </ul>
      </div>

      <div className="dossier-section">
        <h2 className="dossier-section__title">Brief</h2>
        <p className="note">{brief.prose}</p>
      </div>

      {brief.facts.length === 0 ? null : (
        <div className="dossier-section">
          <h2 className="dossier-section__title">Facts</h2>
          <div className="fact-grid">
            {brief.facts.map((fact) => (
              <div className="dossier-fact" key={fact.label}>
                <span className="stat-cell__label">{fact.label}</span>
                <span className="stat-cell__value">{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dossier-section">
        <h2 className="dossier-section__title">Board</h2>
        {brief.board === null ? (
          <p className="note">One fixed board. Nothing is rolled between seeds.</p>
        ) : (
          <>
            {brief.board.fixed.map((item) => (
              <p className="board-row" key={item}>
                <span className="board-tag" data-kind="fixed">
                  Fixed
                </span>
                <span className="note">{item}</span>
              </p>
            ))}
            {brief.board.redrawn.map((item) => (
              <p className="board-row" key={item}>
                <span className="board-tag" data-kind="redrawn">
                  Redrawn
                </span>
                <span className="note">{item}</span>
              </p>
            ))}
          </>
        )}
        <p className="board-row">
          <span className="board-tag">Seeds</span>
          <span className="note">{brief.seeds.join(' · ')}</span>
        </p>
      </div>

      {workspace.hints.length === 0 ? null : (
        <div className="dossier-section">
          <h2 className="dossier-section__title">Field notes</h2>
          {workspace.hints.slice(0, shown).map((hint, index) => (
            <div className="field-note" key={hint}>
              <span className="field-note__index">{String(index + 1).padStart(2, '0')} </span>
              <span className="note">{hint}</span>
            </div>
          ))}
          {shown >= workspace.hints.length ? null : (
            <button
              type="button"
              className="control"
              style={{ marginTop: 10 }}
              onClick={() => workspace.revealHint(shown + 1)}
            >
              Request note {String(shown + 1)} of {String(workspace.hints.length)}
            </button>
          )}
        </div>
      )}
    </>
  );
}
