/**
 * The program, and the only lazy boundary on the desk.
 *
 * `docs/AUDIT-UI.md` F23: one `Suspense` used to wrap the whole workspace, so the site view, the
 * work order and the objectives all sat behind Monaco's download. The boundary is here now and it
 * is as small as it can be — `MonacoProgram.tsx` is the only module in the tree that statically
 * reaches `monaco-editor`, and the fallback is drawn *in the program's own pane*, inside a screen
 * that is already lit, already showing the order's objectives and already printing the log.
 *
 * The loading state belongs to the thing that is loading.
 */
import { Suspense, lazy } from 'react';

const MonacoProgram = lazy(async () => {
  const module = await import('./MonacoProgram.tsx');
  return { default: module.MonacoProgram };
});

export function Program({
  onProblems,
}: {
  onProblems: (count: number) => void;
}): React.JSX.Element {
  return (
    <div className="editor" aria-label="Program">
      <Suspense fallback={<p className="prog-opening">opening the terminal…</p>}>
        <MonacoProgram onProblems={onProblems} />
      </Suspense>
    </div>
  );
}
