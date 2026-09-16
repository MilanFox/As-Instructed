import { Suspense, lazy, useEffect, useRef, useState } from 'react';

import { REPOSITORY_NAME, useLibrary } from '../../meta/index.ts';
import { closeOverlay, toggleOverlay, useOverlay } from '../hooks/useOverlay.ts';
import { OverlayPanel, PanelBar } from './OverlayPanel.tsx';
import { WidthGrip } from './WidthGrip.tsx';

const TITLE = `${REPOSITORY_NAME} · ~/lib.ts`;

const SubroutinesFile = lazy(async () => {
  const module = await import('./SubroutinesFile.tsx');
  return { default: module.SubroutinesFile };
});

export interface SubroutinesProps {
  width: number;
  onWidth: (width: number) => void;
  resizable: boolean;
}

export function Subroutines({
  width,
  onWidth,
  resizable,
}: SubroutinesProps): React.ReactElement | null {
  const unlocked = useLibrary((state) => state.save.unlocked);
  const published = useLibrary((state) => state.save.published.length);
  const open = useOverlay().open === 'library';
  const [opened, setOpened] = useState(open);

  const handleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) setOpened(true);
  }, [open]);

  useEffect(() => {
    if (open) return;
    const active = document.activeElement;
    const flyout = document.getElementById('workspace-library');
    if (active && flyout?.contains(active)) handleRef.current?.focus();
  }, [open]);

  if (!unlocked) return null;

  const count = published === 0 ? 'empty' : `${String(published)} published`;

  return (
    <>
      <button
        type="button"
        className="library-handle"
        ref={handleRef}
        aria-expanded={open}
        aria-controls="workspace-library"
        aria-label={`${REPOSITORY_NAME}, ~/lib.ts, ${count}`}
        onClick={() => toggleOverlay('library')}
      >
        <span className="library-handle__text">
          lib.ts{published > 0 ? ` · ${String(published)}` : ''}
        </span>
      </button>

      <OverlayPanel
        className="library-flyout"
        id="workspace-library"
        label={TITLE}
        open={open}
        inert={!open}
      >
        {resizable ? (
          <WidthGrip
            label="lib.ts width"
            controls="workspace-library"
            width={width}
            onWidth={onWidth}
          />
        ) : null}
        <PanelBar
          tools={
            <button type="button" className="control control--tight" onClick={closeOverlay}>
              Close
            </button>
          }
        >
          {TITLE}
        </PanelBar>

        {opened ? (
          <Suspense fallback={<p className="empty-note">opening lib.ts…</p>}>
            <SubroutinesFile />
          </Suspense>
        ) : null}
      </OverlayPanel>
    </>
  );
}
