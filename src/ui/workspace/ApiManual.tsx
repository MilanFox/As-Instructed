import { useMemo } from 'react';

import type { ReferenceEntry } from './useWorkspace.ts';

export interface ApiManualProps {
  reference: readonly ReferenceEntry[];
}

export function ApiManual({ reference }: ApiManualProps): React.ReactElement {
  const groups = useMemo(() => {
    const byCategory = new Map<string, ReferenceEntry[]>();
    for (const entry of reference) {
      byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
    }
    return [...byCategory];
  }, [reference]);

  if (groups.length === 0) return <p className="empty-note">No hardware fitted yet.</p>;

  return (
    <>
      {groups.map(([category, entries]) => (
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
      ))}
    </>
  );
}
