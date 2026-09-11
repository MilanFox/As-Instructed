import { Suspense, lazy } from 'react';

import { useLibrary } from '../../../meta/store.ts';
import { FileRail } from '../terminal/FileRail.tsx';

const RoutinesFile = lazy(async () => {
  const module = await import('./RoutinesFile.tsx');
  return { default: module.RoutinesFile };
});

export function Routines(): React.ReactElement {
  const unlocked = useLibrary((state) => state.save.unlocked);
  const loaded = useLibrary((state) => state.panelOpen);

  if (!unlocked || !loaded) return <></>;

  return (
    <section className="routines" aria-label="lib.ts, your subroutines">
      <div className="term-bar">
        <span className="tb-host">station-4471</span>
        <span className="tb-sep">:</span>
        <FileRail />
      </div>
      <Suspense fallback={<p className="prog-opening">opening lib.ts…</p>}>
        <RoutinesFile />
      </Suspense>
    </section>
  );
}
