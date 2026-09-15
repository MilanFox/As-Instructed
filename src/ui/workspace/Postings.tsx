import { OverlayPanel, PanelBar } from './OverlayPanel.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

export interface PostingsProps {
  workspace: WorkspaceData;
  onManual?: () => void;
}

export function Postings({ workspace, onManual }: PostingsProps): React.ReactElement | null {
  const requisition = workspace.requisition;
  if (!requisition && workspace.notices.length === 0) return null;

  return (
    <div className="postings">
      {requisition ? (
        <OverlayPanel className="posting" label="New commands">
          <PanelBar
            tools={
              <>
                <button type="button" className="control control--tight" onClick={onManual}>
                  Manual
                </button>
                <button
                  type="button"
                  className="control control--tight"
                  onClick={workspace.signRequisition}
                  aria-label="Dismiss new commands"
                >
                  Dismiss
                </button>
              </>
            }
          >
            New commands
          </PanelBar>
          <div className="chip-row">
            {requisition.hardware.map((name) => (
              <span className="chip" key={name}>
                {name}
              </span>
            ))}
          </div>
        </OverlayPanel>
      ) : null}

      {workspace.notices.map((notice) => (
        <OverlayPanel className="posting" key={notice.id} label={notice.title}>
          <PanelBar
            tools={
              <button
                type="button"
                className="control control--tight"
                onClick={() => workspace.dismissNotice(notice.id)}
                aria-label={`Dismiss ${notice.title}`}
              >
                Ack
              </button>
            }
          >
            {notice.kind === 'memo' ? 'Review' : 'Notice'}
          </PanelBar>
          <p className="posting__body">
            <span className="posting__dot">{notice.dot} </span>
            <strong>{notice.title}</strong> — {notice.body}
          </p>
        </OverlayPanel>
      ))}
    </div>
  );
}
