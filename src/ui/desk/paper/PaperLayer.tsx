/**
 * The loose paper on the desk.
 *
 * One layer, back to front by `z`. Nothing here is a modal, nothing has a backdrop, and nothing is
 * dismissed by a click on the desk — `docs/AUDIT-UI.md` §6.2 and §6.6 are the whole argument for
 * the desk existing, and re-adding a self-destroying ceremony anywhere in this file would undo it.
 *
 * A sheet leaves only when it is *filed*, and filing is an act with an object behind it: the stamp
 * block for a certificate, the pen for a requisition, the acknowledgement on a notice. Filed paper
 * is not deleted — it is in the Repository, which is where a closed work order goes.
 */
import { useEffect, useRef, useState } from 'react';

import type { DeskDoc } from './papers.ts';
import { looseDocs, usePapers } from './papers.ts';
import { Sheet } from './Sheet.tsx';
import { WorkOrder } from './WorkOrder.tsx';
import { ReportSheet } from './ReportSheet.tsx';
import { RequisitionSheet } from './RequisitionSheet.tsx';
import { PerformanceMemo, RepositoryNote, StandingSheet } from './Notices.tsx';

/** How long a filed sheet stays on screen on its way to the Repository. */
const FILING_MS = 620;

export function PaperLayer(): React.JSX.Element {
  const docs = usePapers(looseDocs);
  const [leaving, setLeaving] = useState<DeskDoc[]>([]);

  /*
   * Which sheets were already on the desk when this session started. A certificate restored from
   * `localStorage` has not just arrived, so it neither slides in nor plays its ceremony — that is
   * the difference between paper being issued and paper lying where you left it.
   */
  const arrivals = useRef<Map<string, boolean> | null>(null);
  if (arrivals.current === null) {
    arrivals.current = new Map(docs.map((doc) => [doc.id, false]));
  }
  for (const doc of docs) {
    if (!arrivals.current.has(doc.id)) arrivals.current.set(doc.id, true);
  }
  const fresh = arrivals.current;

  /* A sheet that has just been stamped or signed is watched off the desk rather than blinking. */
  const onDesk = useRef<DeskDoc[]>(docs);
  useEffect(() => {
    const ids = new Set(docs.map((doc) => doc.id));
    const gone = onDesk.current.filter((doc) => !ids.has(doc.id));
    onDesk.current = docs;
    if (gone.length === 0) return;
    const marked = gone
      .map((doc) => usePapers.getState().docs.find((each) => each.id === doc.id) ?? doc)
      .filter((doc) => doc.filed);
    if (marked.length === 0) return;
    setLeaving((current) => [...current, ...marked]);
    const timer = window.setTimeout(() => {
      const ditched = new Set(marked.map((doc) => doc.id));
      setLeaving((current) => current.filter((doc) => !ditched.has(doc.id)));
    }, FILING_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [docs]);

  return (
    <div className="paper-layer">
      {docs.map((doc) => (
        <Sheet key={doc.id} doc={doc} label={labelFor(doc)}>
          <DocumentBody doc={doc} fresh={fresh.get(doc.id) ?? false} />
        </Sheet>
      ))}
      {leaving.map((doc) => (
        <div
          key={`filing-${doc.id}`}
          className={`doc doc--${doc.kind} doc--filing`}
          aria-hidden="true"
          style={{
            left: `calc(50% + ${String((doc.moved ?? doc.home).x)} * var(--u))`,
            top: `calc(50% + ${String((doc.moved ?? doc.home).y)} * var(--u))`,
            zIndex: doc.z,
          }}
        >
          <DocumentBody doc={doc} fresh={false} />
        </div>
      ))}
    </div>
  );
}

function labelFor(doc: DeskDoc): string {
  switch (doc.payload.kind) {
    case 'order':
      return `Work order ${doc.payload.levelId.toUpperCase()}`;
    case 'certificate':
      return `Certificate of closure, ${doc.payload.report.levelId.toUpperCase()}`;
    case 'halt':
      return `Halt notice, ${doc.payload.report.levelId.toUpperCase()}`;
    case 'requisition':
      return 'Hardware requisition';
    case 'issue':
      return 'Repository provisioning notice';
    case 'memo':
      return 'Performance review memo';
    case 'standing':
      return 'Your standing';
  }
}

function DocumentBody({ doc, fresh }: { doc: DeskDoc; fresh: boolean }): React.JSX.Element | null {
  switch (doc.payload.kind) {
    case 'order':
      return <WorkOrder />;
    case 'certificate':
    case 'halt':
      return <ReportSheet report={doc.payload.report} mark={doc.mark} fresh={fresh} />;
    case 'requisition':
      return (
        <RequisitionSheet
          levelId={doc.payload.levelId}
          hardware={doc.payload.hardware}
          signed={doc.mark === 'signed'}
        />
      );
    case 'issue':
      return <RepositoryNote docId={doc.id} />;
    case 'memo':
      return <PerformanceMemo docId={doc.id} rank={doc.payload.rank} />;
    case 'standing':
      return <StandingSheet />;
  }
}
