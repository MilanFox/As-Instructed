/**
 * The contents of `~/lib.ts`, and the station's status line while it is the loaded file.
 *
 * Split from `Routines.tsx` only to keep a lazy boundary around Monaco: this is the one module on
 * the desk side that reaches `src/meta/ui`, and `LibraryPanel` pulls the library editor, which
 * pulls `monaco-editor`. `src/ui/App.tsx` carries the same warning about the same barrel.
 *
 * `libraryStatusLine` prints on the terminal's own status strip, in the place the program's
 * problem count prints when the work order is loaded. It is the line it was written for — what the
 * Repository is doing right now, if anything — and it is how the player sees a regression suite
 * running without opening the tab it is running on.
 */
import { useLibrary } from '../../../meta/store.ts';
import { LibraryPanel, libraryStatusLine } from '../../../meta/ui/index.ts';

export function RoutinesFile(): React.JSX.Element {
  const save = useLibrary((state) => state.save);
  const busy = useLibrary((state) => state.busy);
  /*
   * The progress object is rebuilt on every tick of the suite, so it is read as two numbers. A
   * zustand selector that returns a fresh object never compares equal and re-renders forever —
   * `src/ui/__tests__/desk-selectors.test.ts` is the record of that failure taking the paperwork
   * down.
   */
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
