import { useLibrary } from '../../meta/index.ts';
import { LibraryPanel, libraryStatusLine } from '../../meta/ui/LibraryPanel.tsx';
import { PanelBar } from './OverlayPanel.tsx';

export function SubroutinesFile(): React.JSX.Element {
  const save = useLibrary((state) => state.save);
  const busy = useLibrary((state) => state.busy);
  const done = useLibrary((state) => state.suiteProgress?.done ?? -1);
  const total = useLibrary((state) => state.suiteProgress?.total ?? -1);

  const status = libraryStatusLine({
    busy,
    suiteProgress: done < 0 ? null : { done, total },
    save,
  });

  return (
    <>
      <LibraryPanel />
      <PanelBar sub>{status}</PanelBar>
    </>
  );
}
