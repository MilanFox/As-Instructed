import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { currentLevel, useGame } from '../../game/store.ts';
import { PLAYER_FILE_PATH } from '../../runtime/index.ts';
import { THEME, monaco, setupMonaco } from '../monaco-setup.ts';

const RUNTIME_MARKER_OWNER = 'bootstrap-runtime';

type CodeEditor = monaco.editor.IStandaloneCodeEditor;

export function EditorPanel(): React.JSX.Element {
  const level = useGame(currentLevel);
  const code = useGame((state) => state.code);
  const setCode = useGame((state) => state.setCode);
  const resetCode = useGame((state) => state.resetCode);
  const failure = useGame((state) => state.failure);
  const runState = useGame((state) => state.runState);
  const runner = useGame((state) => state.runner);
  const run = useGame((state) => state.run);

  const editorRef = useRef<CodeEditor | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const [problems, setProblems] = useState(0);

  useEffect(() => {
    setupMonaco();
  }, []);

  useEffect(() => {
    if (!level) return;
    runner().prepare(level.id);
  }, [level, runner]);

  // A runtime failure is not a compile error, so it gets its own marker owner and is cleared
  // the moment the next run starts.
  //
  // The model is looked up by URI rather than taken from the editor: `@monaco-editor/react` mounts
  // asynchronously, so on a level change this effect runs while `editorRef` still points at the
  // editor that is being torn down — and an early return there leaves the previous work order's
  // error underlined in the new one.
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

  const onMount: OnMount = (editor, api) => {
    editorRef.current = editor;
    editor.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.Enter, () => runRef.current());
    editor.focus();
  };

  return (
    <section className="panel" aria-label="Program">
      <header className="panel__head">
        <span>program</span>
        <span className="panel__head-spacer" />
        <button
          type="button"
          className="btn btn--ghost"
          style={{ height: 20 }}
          onClick={resetCode}
          title="Restore the starter program for this work order"
        >
          revert
        </button>
      </header>

      <div className="editor-host">
        <Editor
          key={level?.id ?? 'none'}
          path={PLAYER_FILE_PATH}
          defaultLanguage="typescript"
          language="typescript"
          theme={THEME}
          value={code}
          onChange={(next) => setCode(next ?? '')}
          onMount={onMount}
          onValidate={(markers) => setProblems(markers.filter((m) => m.severity === 8).length)}
          loading={<div className="viewport__empty-title">loading editor…</div>}
          options={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 21,
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'gutter',
            smoothScrolling: true,
            tabSize: 2,
            automaticLayout: true,
            lineNumbersMinChars: 3,
            glyphMargin: false,
            folding: false,
            overviewRulerLanes: 0,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            fixedOverflowWidgets: true,
            wordWrap: 'off',
            bracketPairColorization: { enabled: false },
          }}
        />
      </div>

      <footer className="editor-status">
        <span className={problems > 0 ? 'editor-status__error' : undefined}>
          {problems === 0 ? 'no problems' : `${problems} problem${problems === 1 ? '' : 's'}`}
        </span>
        <span className="panel__head-spacer" />
        <span>{runState === 'running' ? 'running…' : 'ctrl+enter to run'}</span>
      </footer>
    </section>
  );
}
