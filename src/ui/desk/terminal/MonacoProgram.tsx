import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentLevel, useGame } from '../../../game/store.ts';
import { PLAYER_FILE_PATH } from '../../../runtime/index.ts';
import { THEME, monaco, setupMonaco } from '../../monaco-setup.ts';
import { deskUnit, useDeskSize } from '../scale.ts';

const RUNTIME_MARKER_OWNER = 'bootstrap-runtime';

type CodeEditor = monaco.editor.IStandaloneCodeEditor;

function useCodeMetrics(): { fontSize: number; lineHeight: number } {
  const size = useDeskSize();
  const [unit, setUnit] = useState(() =>
    typeof window === 'undefined' ? 1 : deskUnit(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const measure = (): void => {
      setUnit(deskUnit(window.innerWidth, window.innerHeight));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { fontSize: 13.5 * unit * size, lineHeight: 21 * unit * size };
}

export function MonacoProgram({
  onProblems,
}: {
  onProblems: (count: number) => void;
}): React.JSX.Element {
  const level = useGame(currentLevel);
  const code = useGame((state) => state.code);
  const setCode = useGame((state) => state.setCode);
  const failure = useGame((state) => state.failure);
  const runner = useGame((state) => state.runner);
  const run = useGame((state) => state.run);

  const editorRef = useRef<CodeEditor | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const { fontSize, lineHeight } = useCodeMetrics();

  const previousLevelId = useRef<string | undefined>(undefined);
  if (level?.id !== previousLevelId.current) {
    monaco.editor.getModel(monaco.Uri.parse(PLAYER_FILE_PATH))?.dispose();
    previousLevelId.current = level?.id;
  }

  useEffect(() => {
    setupMonaco();
  }, []);

  useEffect(() => {
    if (!level) return;
    runner().prepare(level.id);
  }, [level, runner]);

  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(PLAYER_FILE_PATH));
    if (!model) return;
    const editor = editorRef.current;
    if (!failure || failure.line === undefined) {
      monaco.editor.setModelMarkers(model, RUNTIME_MARKER_OWNER, []);
      return;
    }
    const line = Math.max(1, Math.min(model.getLineCount(), failure.line));
    monaco.editor.setModelMarkers(model, RUNTIME_MARKER_OWNER, [
      {
        severity: monaco.MarkerSeverity.Error,
        message: failure.message,
        startLineNumber: line,
        endLineNumber: line,
        startColumn: failure.column ?? 1,
        endColumn: model.getLineMaxColumn(line),
      },
    ]);
    editor?.revealLineInCenterIfOutsideViewport(line);
  }, [failure]);

  const options = useMemo(
    () => ({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize,
      lineHeight,
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      renderLineHighlight: 'gutter' as const,
      smoothScrolling: true,
      tabSize: 2,
      automaticLayout: true,
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      overviewRulerLanes: 0,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      fixedOverflowWidgets: true,
      autoClosingBrackets: 'never' as const,
      autoClosingQuotes: 'never' as const,
      autoClosingOvertype: 'never' as const,
      autoSurround: 'never' as const,
      wordWrap: 'on' as const,
      wrappingIndent: 'indent' as const,
      bracketPairColorization: { enabled: false },
    }),
    [fontSize, lineHeight],
  );

  const onMount: OnMount = (editor, api) => {
    editorRef.current = editor;
    editor.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.Enter, () => runRef.current());
    editor.focus();
  };

  return (
    <Editor
      key={level?.id ?? 'none'}
      path={PLAYER_FILE_PATH}
      defaultLanguage="typescript"
      language="typescript"
      theme={THEME}
      value={code}
      onChange={(next) => setCode(next ?? '')}
      onMount={onMount}
      onValidate={(markers) => onProblems(markers.filter((m) => m.severity === 8).length)}
      loading={<p className="prog-opening">opening the terminal…</p>}
      options={options}
    />
  );
}
