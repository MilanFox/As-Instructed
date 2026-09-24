import { Suspense, lazy } from 'react';

const MonacoBody = lazy(async () => {
  const module = await import('./MonacoBody.tsx');
  return { default: module.MonacoBody };
});

export interface CodeEditorProps {
  fontSize?: number;
  lineHeight?: number;
  onProblems?: (count: number) => void;
}

export function CodeEditor({
  fontSize = 14,
  lineHeight = 22,
  onProblems,
}: CodeEditorProps): React.ReactElement {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
      <Suspense fallback={<span>Loading editor…</span>}>
        <MonacoBody
          fontSize={fontSize}
          lineHeight={lineHeight}
          {...(onProblems ? { onProblems } : {})}
        />
      </Suspense>
    </div>
  );
}
