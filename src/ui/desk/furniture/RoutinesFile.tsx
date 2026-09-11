import { useLibrary } from '../../../meta/store.ts';
import { LibraryPanel, libraryStatusLine } from '../../../meta/ui/index.ts';

export function RoutinesFile(): React.JSX.Element {
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
      <div className="rt-body">
        <LibraryPanel />
      </div>
      <div className="term-status">
        <span>{status}</span>
        <span className="ts-right">esc returns to the work order</span>
      </div>
    </>
  );
}
