import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { PUBLISH } from '../copy.ts';
import { isValidName, libraryExportNames, planPublication } from '../publish.ts';
import { useLibrary } from '../store.ts';
import './library.css';

/**
 * Offered once, after a work order closes. Skippable, and skippable forever.
 *
 * Nothing here is a gate. "Not this time" costs one click and is remembered for that work order;
 * "Stop offering" turns the whole prompt off for the rest of the game and is reversible from the
 * Repository panel. A player who never publishes anything finishes the campaign with the same
 * medals as one who does.
 */
export function PublishDialog(): React.JSX.Element | null {
  const offer = useLibrary((state) => state.offer);
  const source = useLibrary((state) => state.source);
  const setSelection = useLibrary((state) => state.setSelection);
  const confirm = useLibrary((state) => state.confirmPublish);
  const skip = useLibrary((state) => state.skipPublish);

  const [names, setNames] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPicked(new Set());
    setNames({});
    firstRef.current?.focus();
  }, [offer?.levelId]);

  const taken = useMemo(() => new Set(libraryExportNames(source)), [source]);

  const selection = useMemo(
    () =>
      [...picked].map((name) => ({
        name,
        ...(names[name] && names[name] !== name ? { publishAs: names[name] as string } : {}),
      })),
    [picked, names],
  );

  useEffect(() => {
    setSelection(selection);
  }, [selection, setSelection]);

  const plan = useMemo(() => {
    if (!offer || selection.length === 0) return null;
    return planPublication({
      levelSource: '',
      librarySource: source,
      declarations: offer.declarations,
      selection,
      levelId: offer.levelId,
    });
  }, [offer, selection, source]);

  if (!offer) return null;

  const invalid = selection.some((each) => !isValidName(each.publishAs ?? each.name));
  const conflicts = selection
    .map((each) => each.publishAs ?? each.name)
    .filter((name) => taken.has(name));

  return (
    <div className="lib-modal" role="dialog" aria-modal="true" aria-label={PUBLISH.title}>
      <div className="lib-modal__card">
        <h2 className="lib-modal__title">{PUBLISH.title}</h2>
        <p className="lib-modal__lede">{PUBLISH.lede}</p>

        {offer.declarations.length === 0 ? (
          <p className="lib__empty">{PUBLISH.nothingToPublish}</p>
        ) : (
          offer.declarations.map((declaration, index) => {
            const chosen = picked.has(declaration.name);
            const as = names[declaration.name] ?? declaration.name;
            return (
              <label className="lib-pick" key={declaration.name}>
                <input
                  ref={index === 0 ? firstRef : undefined}
                  type="checkbox"
                  checked={chosen}
                  onChange={(event) => {
                    const next = new Set(picked);
                    if (event.target.checked) next.add(declaration.name);
                    else next.delete(declaration.name);
                    setPicked(next);
                  }}
                />
                <span>
                  <span className="lib-pick__name">{declaration.name}</span>{' '}
                  <span className="lib-pick__kind">
                    {declaration.kind} · lines {declaration.startLine}–{declaration.endLine}
                  </span>
                  {declaration.hardware.length > 0 ? (
                    <div className="lib__warn">
                      {PUBLISH.hardwareWarning(declaration.hardware, offer.levelId)}
                    </div>
                  ) : null}
                </span>
                <span className="lib__spacer" />
                {chosen ? (
                  <span>
                    <span className="lib-pick__kind">{PUBLISH.renameLabel} </span>
                    <input
                      type="text"
                      value={as}
                      onChange={(event) =>
                        setNames({ ...names, [declaration.name]: event.target.value })
                      }
                    />
                  </span>
                ) : null}
              </label>
            );
          })
        )}

        {plan && plan.missing.length > 0 ? (
          <p className="lib__warn">{PUBLISH.dependencyWarning(plan.missing)}</p>
        ) : null}
        {conflicts.map((name) => (
          <p className="lib__warn" key={name}>
            {PUBLISH.nameTaken(name)}
          </p>
        ))}
        {invalid ? <p className="lib__warn">{PUBLISH.nameInvalid}</p> : null}

        <div className="lib-modal__actions">
          <button
            type="button"
            className="lib__btn lib__btn--primary"
            disabled={selection.length === 0 || invalid || conflicts.length > 0}
            onClick={() => void confirm()}
          >
            {PUBLISH.confirm}
          </button>
          <button type="button" className="lib__btn" onClick={() => skip(false)}>
            {PUBLISH.skip}
          </button>
          <span className="lib__spacer" />
          <button type="button" className="lib__btn" onClick={() => skip(true)}>
            {PUBLISH.never}
          </button>
        </div>

        <p className="lib-modal__footnote">{PUBLISH.footnote}</p>
      </div>
    </div>
  );
}
