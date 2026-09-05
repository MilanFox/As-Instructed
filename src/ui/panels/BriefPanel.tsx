import type * as React from 'react';
import { currentLevel, unlockedHardware, useGame } from '../../game/store.ts';
import { worldMeta } from '../../levels/index.ts';
import { requirementsFor } from '../../meta/index.ts';
import { InlineMarkdown, Markdown } from '../components/Markdown.tsx';
import '../styles/docs.css';

function openDocs(name: string): void {
  useGame.getState().setDocsOpen(true);
  useGame.getState().setPanel('docs');
  window.dispatchEvent(new CustomEvent('bootstrap:docs-focus', { detail: { name } }));
}

function HardwareChip({ name, fresh }: { name: string; fresh: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      className={fresh ? 'hw-chip hw-chip--fresh' : 'hw-chip'}
      onClick={() => openDocs(name)}
      title={`Open the reference for ${name}`}
    >
      {name}
    </button>
  );
}

export function BriefPanel(): React.JSX.Element {
  const level = useGame(currentLevel);
  const levelId = level?.id ?? '';
  const revealed = useGame((state) => state.save.levels[levelId]?.hintsRevealed ?? 0);
  const revealHint = useGame((state) => state.revealHint);

  if (!level) {
    return (
      <section className="doc-pane brief">
        <p className="brief-empty">No work order is open. Pick one from the board.</p>
      </section>
    );
  }

  const world = worldMeta(level.world);
  const fitted = unlockedHardware(level.id).filter((name) => !level.hardware.includes(name));
  const hints = level.hints;
  const facts = level.facts ?? [];
  const routines = requirementsFor(level.id);

  return (
    <section className="doc-pane brief">
      <header className="brief-head">
        <div className="brief-stamp">
          <span className="brief-stamp-label">Work order</span>
          <span className="brief-stamp-id numeric">{level.id}</span>
        </div>
        <h2 className="brief-title">{level.title}</h2>
        <p className="brief-site">
          {world ? world.name : `World ${level.world}`}
          {world ? <span className="brief-site-sub"> — {world.subtitle}</span> : null}
        </p>
      </header>

      <Markdown source={level.brief} className="brief-body" />

      {facts.length > 0 ? (
        <section className="brief-section">
          <h3 className="brief-section-title">Site data</h3>
          <dl className="fact-list">
            {facts.map((fact) => (
              <div className="fact" key={fact.label}>
                <dt className="fact__label">
                  <InlineMarkdown source={fact.label} />
                </dt>
                <dd className="fact__value">
                  <InlineMarkdown source={fact.value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="brief-section">
        <h3 className="brief-section-title">Hardware requisition</h3>
        {level.hardware.length > 0 ? (
          <div className="hw-group">
            <p className="hw-label">Delivered with this order</p>
            <div className="hw-row">
              {level.hardware.map((name) => (
                <HardwareChip key={name} name={name} fresh />
              ))}
            </div>
          </div>
        ) : (
          <p className="hw-label">Nothing new fitted for this order.</p>
        )}
        {fitted.length > 0 ? (
          <div className="hw-group hw-group--quiet">
            <p className="hw-label">Already on the bot</p>
            <div className="hw-row">
              {fitted.map((name) => (
                <HardwareChip key={name} name={name} fresh={false} />
              ))}
            </div>
          </div>
        ) : null}
        {routines.length > 0 ? (
          <div className="hw-group">
            <p className="hw-label">
              Taken from your Repository. Not in there yet? Write it in this work order.
            </p>
            <ul className="routine-list">
              {routines.map((routine) => (
                <li className="routine" key={routine.name}>
                  <code className="routine__sig">{routine.signature}</code>
                  <span className="routine__note">{routine.assumes}</span>
                  <code className="routine__import">{`import { ${routine.name} } from 'lib';`}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {hints.length > 0 ? (
        <section className="brief-section">
          <h3 className="brief-section-title">Field notes</h3>
          <p className="hint-from">
            <span className="hint-who">D. Halloran</span>
            <span className="hint-aside">field engineering. asking costs you nothing.</span>
          </p>
          <ol className="hint-list">
            {hints.slice(0, revealed).map((hint, index) => (
              <li className="hint" key={hint}>
                <span className="hint-mark numeric">dot {index + 1}</span>
                <Markdown source={hint} className="hint-body" />
              </li>
            ))}
          </ol>
          {revealed < hints.length ? (
            <button type="button" className="hint-ask" onClick={() => revealHint(revealed + 1)}>
              Request hint {revealed + 1} of {hints.length}
            </button>
          ) : (
            <p className="hint-done">That is everything she wrote down.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
