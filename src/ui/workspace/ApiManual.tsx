import { useMemo, useState } from 'react';

import { Markdown } from '../components/Markdown.tsx';
import { GUIDES, MEMORY } from '../reference/api.ts';
import type { LegendSection } from '../reference/legend.ts';
import type { ReferenceEntry } from './useWorkspace.ts';

type ManualPage = 'commands' | 'board' | 'guides';

const PAGES: readonly { id: ManualPage; label: string }[] = [
  { id: 'commands', label: 'Commands' },
  { id: 'board', label: 'On this board' },
  { id: 'guides', label: 'Guides' },
];

export interface ApiManualProps {
  reference: readonly ReferenceEntry[];
  legend: readonly LegendSection[];
}

export function ApiManual({ reference, legend }: ApiManualProps): React.ReactElement {
  const [page, setPage] = useState<ManualPage>('commands');

  const groups = useMemo(() => {
    const byCategory = new Map<string, ReferenceEntry[]>();
    for (const entry of reference) {
      byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
    }
    return [...byCategory];
  }, [reference]);

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
                  <span className="api-entry__signature">{entry.signature}</span>
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
