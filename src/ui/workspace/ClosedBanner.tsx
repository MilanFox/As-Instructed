import { useEffect, useRef } from 'react';

import type { WorkspaceData } from './useWorkspace.ts';

export interface ClosedBannerProps {
  workspace: WorkspaceData;
}

export function ClosedBanner({ workspace }: ClosedBannerProps): React.ReactElement {
  const fileRef = useRef<HTMLButtonElement | null>(null);
  const report = workspace.report;
  const id = (report?.levelId ?? workspace.level?.id ?? '').toUpperCase();
  const medal = report?.medal && report.medal !== 'none' ? report.medal : null;

  useEffect(() => {
    fileRef.current?.focus();
  }, []);

  return (
    <section className="closed-banner" aria-label="Work order closed">
      <div className="closed-banner__row">
        <span className="closed-banner__id">{id}</span>
        <span className="closed-banner__word">
          Closed
          <span className="closed-banner__sub">
            {report?.headline ?? 'Every objective met. The order is yours to file.'}
          </span>
        </span>
        {medal ? (
          <span className="closed-banner__medal" data-medal={medal}>
            {medal}
          </span>
        ) : null}
        <button
          type="button"
          className="closed-banner__file"
          ref={fileRef}
          onClick={workspace.closeOut}
        >
          File it
        </button>
      </div>
    </section>
  );
}
