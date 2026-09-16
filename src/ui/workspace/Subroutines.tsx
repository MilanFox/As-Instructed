import { Suspense, lazy, useEffect, useRef, useState } from 'react';

import { REPOSITORY_NAME, useLibrary } from '../../meta/index.ts';
import { closeOverlay, toggleOverlay, useOverlay } from '../hooks/useOverlay.ts';

const TITLE = `${REPOSITORY_NAME} · ~/lib.ts`;

const SubroutinesFile = lazy(async () => {
  const module = await import('./SubroutinesFile.tsx');
  return { default: module.SubroutinesFile };
});

export function Subroutines(): React.ReactElement | null {
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

      <section
        className="flyout library-face"
        id="workspace-library"
        aria-label={TITLE}
        data-on={String(open)}
        {...(open ? {} : { inert: true })}
      >
        {/* The face's own tab row is the strip below, rendered from the library store — the
            close is parked over its right end rather than given a header bar of its own. */}
        <button type="button" className="control library-face__close" onClick={closeOverlay}>
          Close
        </button>

        {opened ? (
          <Suspense fallback={<p className="empty-note">opening lib.ts…</p>}>
            <SubroutinesFile />
          </Suspense>
        ) : null}
      </section>
    </>
  );
}
