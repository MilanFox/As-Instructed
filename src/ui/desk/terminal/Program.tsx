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
