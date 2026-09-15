import { Fragment, useEffect, useMemo, useState } from 'react';

import { InlineMarkdown, Markdown } from '../components/Markdown.tsx';
import { GUIDES, MEMORY, typeParts } from '../reference/api.ts';
import type { LegendSection } from '../reference/legend.ts';
import type { ReferenceEntry, TypeEntry } from './useWorkspace.ts';

type ManualPage = 'commands' | 'types' | 'board' | 'guides';

const PAGES: readonly { id: ManualPage; label: string }[] = [
  { id: 'commands', label: 'Commands' },
  { id: 'types', label: 'Types' },
  { id: 'board', label: 'On this board' },
  { id: 'guides', label: 'Guides' },
];

export interface ApiManualProps {
  reference: readonly ReferenceEntry[];
  types: readonly TypeEntry[];
  legend: readonly LegendSection[];
}

interface TypeLinksProps {
  text: string;
  names: readonly string[];
  onOpen: (name: string) => void;
}

function TypeLinks({ text, names, onOpen }: TypeLinksProps): React.ReactElement {
  const parts = useMemo(() => typeParts(text, names), [text, names]);
  return (
    <>
      {parts.map((part, index) => {
        const name = part.type;
        if (name === null) return <Fragment key={index}>{part.text}</Fragment>;
        return (
          <button
            key={index}
            type="button"
            className="type-link"
            onClick={() => {
              onOpen(name);
            }}
          >
            {part.text}
          </button>
        );
      })}
    </>
  );
}

export function ApiManual({ reference, types, legend }: ApiManualProps): React.ReactElement {
  const [page, setPage] = useState<ManualPage>('commands');
  const [wanted, setWanted] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byCategory = new Map<string, ReferenceEntry[]>();
    for (const entry of reference) {
      byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
    }
    return [...byCategory];
  }, [reference]);

  const names = useMemo(() => types.map((type) => type.name), [types]);

  const otherNames = useMemo(
    () => new Map(types.map((type) => [type.name, names.filter((name) => name !== type.name)])),
    [types, names],
  );

  useEffect(() => {
    if (wanted === null) return;
    const entry = document.getElementById(`manual-type-${wanted}`);
    entry?.scrollIntoView({ block: 'start' });
    entry?.focus();
    setWanted(null);
  }, [wanted]);

  const openType = (name: string): void => {
    setPage('types');
    setWanted(name);
  };

  const onPageKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = PAGES.findIndex((entry) => entry.id === page);
    const next = PAGES[(at + step + PAGES.length) % PAGES.length];
    if (!next) return;
    setPage(next.id);
    document.getElementById(`manual-tab-${next.id}`)?.focus();
  };

  return (
    <>
      <div className="manual-nav" role="tablist" aria-label="Manual sections" onKeyDown={onPageKey}>
        {PAGES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`manual-tab-${entry.id}`}
            className="control control--tight"
            aria-selected={page === entry.id}
            aria-controls={`manual-page-${entry.id}`}
            tabIndex={page === entry.id ? 0 : -1}
            onClick={() => setPage(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="manual-page-commands"
        aria-labelledby="manual-tab-commands"
        hidden={page !== 'commands'}
      >
        {groups.length === 0 ? (
          <p className="empty-note">No hardware fitted yet.</p>
        ) : (
          groups.map(([category, entries]) => (
            <div className="dossier-section" key={category}>
              <h2 className="dossier-section__title">{category}</h2>
              {entries.map((entry) => (
                <div className="api-entry" key={entry.name}>
                  <span className="api-entry__signature">
                    <TypeLinks text={entry.signature} names={names} onOpen={openType} />
                  </span>
                  <p className="api-entry__doc">{entry.description}</p>
                  <span className="api-entry__cost">{entry.cost}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div
        role="tabpanel"
        id="manual-page-types"
        aria-labelledby="manual-tab-types"
        hidden={page !== 'types'}
      >
        {types.length === 0 ? (
          <p className="empty-note">No hardware fitted yet.</p>
        ) : (
          types.map((entry) => (
            <div
              className="dossier-section manual-type"
              key={entry.name}
              id={`manual-type-${entry.name}`}
              tabIndex={-1}
            >
              <h2 className="dossier-section__title">{entry.name}</h2>
              <pre className="guide-example">
                <code>
                  <TypeLinks
                    text={entry.declaration}
                    names={otherNames.get(entry.name) ?? names}
                    onOpen={openType}
                  />
                </code>
              </pre>
              <p className="api-entry__doc">
                <InlineMarkdown source={entry.doc} />
              </p>
            </div>
          ))
        )}
      </div>

      <div
        role="tabpanel"
        id="manual-page-board"
        aria-labelledby="manual-tab-board"
        hidden={page !== 'board'}
      >
        {legend.length === 0 ? (
          <p className="empty-note">No board loaded.</p>
        ) : (
          legend.map((section) => (
            <div className="dossier-section" key={section.id}>
              <h2 className="dossier-section__title">{section.title}</h2>
              {section.rows.map((row) => (
                <div className="legend-row" key={row.name}>
                  <span className="legend-row__name">{row.name}</span>
                  {row.count === null ? null : (
                    <span className="legend-row__count numeric">×{String(row.count)}</span>
                  )}
                  <p className="note legend-row__what">
                    {row.what}
                    {row.traits.length === 0 ? null : (
                      <span className="legend-row__traits"> {row.traits.join(' · ')}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div
        role="tabpanel"
        id="manual-page-guides"
        aria-labelledby="manual-tab-guides"
        hidden={page !== 'guides'}
      >
        {[MEMORY, ...GUIDES].map((guide) => (
          <div className="dossier-section" key={guide.id}>
            <h2 className="dossier-section__title">{guide.title}</h2>
            <Markdown source={guide.body} className="guide-body" />
            {guide.example === undefined ? null : (
              <pre className="guide-example">
                <code>{guide.example}</code>
              </pre>
            )}
            {guide.caption === undefined ? null : (
              <p className="note guide-caption">{guide.caption}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
