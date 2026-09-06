/**
 * Monaco, and nothing else.
 *
 * This module exists to be the whole of the lazy chunk (`docs/AUDIT-UI.md` F23). Everything that
 * statically reaches `monaco-editor` — `@monaco-editor/react`, `../../monaco-setup.ts` and the
 * marker plumbing — lives here and is reached only through the dynamic import in `Program.tsx`,
 * so the desk, the site, the rail and the log all paint before the editor's chunk lands.
 *
 * The wiring is `src/ui/panels/EditorPanel.tsx`'s, carried over unchanged: the value binding, the
 * Ctrl/Cmd+Enter command, the runtime-failure markers under their own owner, and the problem
 * count. Only the chrome around it was a panel; the editor never was.
 */
import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentLevel, useGame } from '../../../game/store.ts';
import { PLAYER_FILE_PATH } from '../../../runtime/index.ts';
import { THEME, monaco, setupMonaco } from '../../monaco-setup.ts';
import { deskUnit, useDeskSize } from '../scale.ts';

const RUNTIME_MARKER_OWNER = 'bootstrap-runtime';

type CodeEditor = monaco.editor.IStandaloneCodeEditor;

/**
 * The type the SIZE dial is actually for.
 *
 * Every other line of the desk is `calc(N * var(--u) * var(--ts))`; Monaco takes numbers, so the
 * same arithmetic is done here against the same two inputs. A SIZE dial that grew the rail and the
 * log and left the program at 13px would be turning up everything except the thing being read.
 * The multipliers are the prototype's mirror: 13.5 and 21.
 */
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
      wordWrap: 'off' as const,
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
