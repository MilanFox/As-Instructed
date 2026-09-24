import { useEffect, useMemo } from 'react';
import { InlineMarkdown, Markdown } from '../components/Markdown.tsx';
import { factTerms } from './fact-terms.ts';
import { clearFocusedFact, useFocusedFact } from './factFocus.ts';
import { ObjectiveItem } from './ObjectiveItem.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

export interface DossierProps {
  workspace: WorkspaceData;
}

const SURVEY_CAPTION_ID = 'dossier-survey-caption';

function factAnchor(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `fact-${slug}`;
}

const SIGN_OFF = /\s*—\s*([^—\n]{0,29}[^—\n\s.!?,;:])$/;

function splitLore(lore: string): { note: string; from: string } {
  const match = SIGN_OFF.exec(lore);
  if (!match) return { note: lore, from: '' };
  return { note: lore.slice(0, match.index), from: match[1]?.trim() ?? '' };
}

function splitBrief(prose: string): { lore: string; job: string } {
  const paragraphs = prose
    .trim()
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const at = paragraphs.findIndex((paragraph) => /^\*\*(?!FROM:)/.test(paragraph));
  if (at === -1) return { lore: paragraphs.join('\n\n'), job: '' };
  return { lore: paragraphs.slice(0, at).join('\n\n'), job: paragraphs[at] ?? '' };
}

export function Dossier({ workspace }: DossierProps): React.ReactElement | null {
  const brief = workspace.brief;
  const facts = brief?.facts;
  const terms = useMemo(() => factTerms(facts ?? []), [facts]);
  const wanted = useFocusedFact();

  useEffect(() => {
    if (wanted === null) return;
    const row = document.getElementById(factAnchor(wanted));
    if (row) {
      const rules = row.closest('details');
      if (rules) rules.open = true;
      row.scrollIntoView({ block: 'start' });
      row.focus({ preventScroll: true });
    }
    clearFocusedFact();
  }, [wanted]);

  if (!brief) return null;
  const shown = Math.min(workspace.hintsRevealed, workspace.hints.length);
  const { lore, job } = splitBrief(brief.prose);
  const { note, from } = splitLore(lore);
  const oneSeed = brief.seeds.length === 1;
  const levelKey = brief.head.join(' ');

  return (
    <>
      <div className="dossier-section dossier-section--objectives">
        <h2 className="dossier-section__title">Objectives</h2>
        <ul>
          {[...workspace.objectives, ...workspace.bonus].map((row) => (
            <ObjectiveItem key={row.id} row={row} terms={terms} />
          ))}
        </ul>
      </div>

      {job === '' && lore === '' ? null : (
        <div className="dossier-section dossier-section--brief">
          {lore === '' ? null : (
            <div className="dossier-lore">
              <Markdown source={note} className="dossier-lore__note" />
              {from === '' ? null : <p className="dossier-lore__from">— {from}</p>}
            </div>
          )}
          <h2 className="dossier-section__title">Your job</h2>
          <Markdown source={job} className="dossier-brief" />
        </div>
      )}

      {brief.facts.length === 0 ? null : (
        <details key={`rules ${levelKey}`} className="dossier-section dossier-fold" open>
          <summary className="dossier-fold__summary">
            <h2 className="dossier-section__title">Rules</h2>
          </summary>
          {brief.facts.map((fact) => (
            <div
              className="fact-row"
              key={fact.label}
              id={factAnchor(fact.label)}
              data-fact={fact.label}
              tabIndex={-1}
            >
              <p className="fact-row__label">
                <InlineMarkdown source={fact.label} />
              </p>
              <p className="note fact-row__value">
                <InlineMarkdown source={fact.value} />
              </p>
            </div>
          ))}
        </details>
      )}

      <details key={`board ${levelKey}`} className="dossier-section dossier-fold">
        <summary className="dossier-fold__summary">
          <h2 className="dossier-section__title">Changes between boards</h2>
        </summary>
        {oneSeed ? (
          <p className="note">One board. It never changes.</p>
        ) : (
          <>
            {(brief.board?.redrawn ?? []).map((item) => (
              <p className="board-row" key={item}>
                <span className="board-tag" data-kind="redrawn">
                  Varies
                </span>
                <span className="note">
                  <InlineMarkdown source={item} />
                </span>
              </p>
            ))}
            <p className="board-row">
              <span className="board-tag">Boards</span>
              <span className="seed-picker">
                {workspace.seedsUnlocked ? (
                  <>
                    {brief.seeds.map((seed) => (
                      <button
                        key={seed}
                        type="button"
                        className="control control--tight"
                        aria-label={`Show board ${String(seed)}`}
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
                        {workspace.surveyHolding ? 'Back to the run' : 'Hide board'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="note">{brief.seeds.join(' · ')}</span>
                    <button
                      type="button"
                      className="control control--tight"
                      aria-describedby={SURVEY_CAPTION_ID}
                      onClick={() => workspace.unlockSeeds()}
                    >
                      Pick a board
                    </button>
                    <span id={SURVEY_CAPTION_ID} hidden>
                      Shows one board. A one-board run is not graded.
                    </span>
                  </>
                )}
              </span>
            </p>
          </>
        )}
      </details>

      {workspace.hints.length === 0 ? null : (
        <details key={`hints ${levelKey}`} className="dossier-section dossier-fold">
          <summary className="dossier-fold__summary">
            <h2 className="dossier-section__title">Hints</h2>
          </summary>
          {workspace.hints.slice(0, shown).map((hint, index) => (
            <div className="field-note" key={hint}>
              <span className="field-note__index">{String(index + 1).padStart(2, '0')} </span>
              <span className="note">{hint}</span>
            </div>
          ))}
          {shown >= workspace.hints.length ? null : (
            <div className="field-note-asks">
              <button
                type="button"
                className="control"
                onClick={() => workspace.revealHint(shown + 1)}
              >
                Show hint {String(shown + 1)} of {String(workspace.hints.length)}
              </button>
            </div>
          )}
        </details>
      )}
    </>
  );
}
