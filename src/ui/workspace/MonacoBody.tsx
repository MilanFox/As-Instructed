import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef } from 'react';

import { currentLevel, useGame } from '../../game/store.ts';
import { PLAYER_FILE_PATH } from '../../runtime/index.ts';
import { THEME, monaco, setupMonaco } from '../monaco-setup.ts';

const RUNTIME_MARKER_OWNER = 'bootstrap-runtime';

type StandaloneEditor = monaco.editor.IStandaloneCodeEditor;

export interface MonacoBodyProps {
  fontSize: number;
  lineHeight: number;
  onProblems?: (count: number) => void;
}

export function MonacoBody({
  fontSize,
  lineHeight,
  onProblems,
}: MonacoBodyProps): React.ReactElement {
  const level = useGame(currentLevel);
  const code = useGame((state) => state.code);
  const setCode = useGame((state) => state.setCode);
  const failure = useGame((state) => state.failure);
  const runner = useGame((state) => state.runner);
  const run = useGame((state) => state.run);

  const editorRef = useRef<StandaloneEditor | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

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
    // A monaco model outlives the editor that showed it, and the editor adopts whatever
    // sits at PLAYER_FILE_PATH rather than the value prop. The store owns the document.
    const model = editor.getModel();
    if (model && model.getValue() !== code) model.setValue(code);
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
      onValidate={(markers) => onProblems?.(markers.filter((m) => m.severity === 8).length)}
      loading={<span>opening the terminal…</span>}
      options={options}
    />
  );
}
