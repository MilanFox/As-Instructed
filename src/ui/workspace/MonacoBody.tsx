import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef } from 'react';

import type { ApiCall, EventOrigin, Trace } from '../../engine/index.ts';
import { callsAtEvent, callsFromLine } from '../../game/debug-values.ts';
import { currentLevel, resolveEventCursor, useGame } from '../../game/store.ts';
import { LIB_FILE_PATH, PLAYER_FILE_PATH } from '../../runtime/index.ts';
import { THEME, monaco, setupMonaco } from '../monaco-setup.ts';
import { ghostText, lineHover, pastCallLog, seekTarget } from './value-hover.ts';

const RUNTIME_MARKER_OWNER = 'as-instructed-runtime';

const STEP_DECORATION = {
  isWholeLine: true,
  className: 'debug-step-line',
  linesDecorationsClassName: 'debug-step-gutter',
} as const;

const FILE_PATHS: Readonly<Record<EventOrigin['file'], string>> = {
  program: PLAYER_FILE_PATH,
  lib: LIB_FILE_PATH,
};

const SEEK_TO_CALL = 'as-instructed.seekToCall';

type StandaloneEditor = monaco.editor.IStandaloneCodeEditor;

interface Stepped {
  origin: EventOrigin;
  calls: readonly ApiCall[];
  unrecorded: boolean;
}

const GHOST_MARGIN = 3;
const GHOST_MIN = 16;

// Monaco wraps a line that injected text pushes past the wrapping column, so the ghost is cut to
// the room the narrowest editor showing the document has left on that line.
function ghostRoom(model: monaco.editor.ITextModel, line: number): number | undefined {
  const columns = monaco.editor
    .getEditors()
    .filter((editor) => editor.getModel() === model)
    .map((editor) => editor.getOption(monaco.editor.EditorOption.wrappingInfo).wrappingColumn)
    .filter((column) => column > 0);
  if (columns.length === 0) return undefined;
  const used = model.getLineContent(line).replace(/\t/g, '  ').length;
  return Math.max(GHOST_MIN, Math.min(...columns) - used - GHOST_MARGIN);
}

function fileAt(uri: monaco.Uri): EventOrigin['file'] | null {
  for (const [file, path] of Object.entries(FILE_PATHS)) {
    if (monaco.Uri.parse(path).toString() === uri.toString()) return file as EventOrigin['file'];
  }
  return null;
}

function lastEventFromLine(trace: Trace, file: EventOrigin['file'], line: number): number | null {
  for (let index = trace.events.length - 1; index >= 0; index -= 1) {
    const origin = trace.events[index]?.origin;
    if (origin?.file === file && origin.line === line) return index;
  }
  return null;
}

function seekLink(call: ApiCall): string {
  return `command:${SEEK_TO_CALL}?${encodeURIComponent(JSON.stringify([call.seq]))}`;
}

function seekToCall(seq: number): void {
  const state = useGame.getState();
  const trace = state.trace;
  const call = trace?.calls?.calls[seq];
  if (!trace || !call) return;
  const target = seekTarget(call, trace.events.length);
  if (target !== null) {
    state.seekToEvent(target);
    return;
  }
  state.pause();
  state.seek(call.t);
}

function lineHoverAt(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  stepped: Stepped | null,
): monaco.languages.Hover | null {
  const trace = useGame.getState().trace;
  const file = fileAt(model.uri);
  if (!trace?.calls || file === null) return null;
  const line = position.lineNumber;
  const onGhost =
    stepped !== null &&
    ghostText(stepped.calls, stepped.unrecorded) !== null &&
    stepped.origin.file === file &&
    stepped.origin.line === line &&
    position.column >= model.getLineMaxColumn(line);
  if (onGhost) return null;
  const last = lastEventFromLine(trace, file, line);
  const unrecorded = last !== null && pastCallLog(trace.calls, last);
  const value = lineHover(callsFromLine(trace, file, line), unrecorded, seekLink);
  if (value === null) return null;
  return {
    range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
    contents: [{ value, isTrusted: { enabledCommands: [SEEK_TO_CALL] } }],
  };
}

// The lib file is shown by an editor this component does not own, and the program file by one
// that comes and goes, so the decoration is put on the documents rather than on either editor.
function markOrigin(stepped: Stepped | null, previous: Map<string, string[]>): void {
  for (const path of Object.values(FILE_PATHS)) {
    const model = monaco.editor.getModel(monaco.Uri.parse(path));
    if (!model) continue;
    const wanted =
      stepped && FILE_PATHS[stepped.origin.file] === path
        ? [Math.max(1, Math.min(model.getLineCount(), stepped.origin.line))]
        : [];
    previous.set(
      path,
      model.deltaDecorations(
        previous.get(path) ?? [],
        wanted.flatMap((line) => {
          const end = model.getLineMaxColumn(line);
          const step = { range: new monaco.Range(line, 1, line, end), options: STEP_DECORATION };
          const text = stepped
            ? ghostText(stepped.calls, stepped.unrecorded, ghostRoom(model, line))
            : null;
          if (text === null) return [step];
          const ghost = {
            range: new monaco.Range(line, end, line, end),
            options: {
              showIfCollapsed: true,
              hoverMessage: { value: 'Hover to see all values' },
              after: {
                content: text,
                inlineClassName: 'debug-step-ghost',
                cursorStops: monaco.editor.InjectedTextCursorStops.None,
              },
            },
          };
          return [step, ghost];
        }),
      ),
    );
  }
}

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
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);
  const eventCursor = useGame((state) => state.eventCursor);
  const seekToLine = useGame((state) => state.seekToLine);

  const editorRef = useRef<StandaloneEditor | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const seekToLineRef = useRef(seekToLine);
  seekToLineRef.current = seekToLine;
  const markedRef = useRef(new Map<string, string[]>());
  const steppedRef = useRef<Stepped | null>(null);

  useEffect(() => {
    setupMonaco();
  }, []);

  useEffect(() => {
    const command = monaco.editor.registerCommand(SEEK_TO_CALL, (_accessor, seq: unknown) => {
      if (typeof seq === 'number') seekToCall(seq);
    });
    const hover = monaco.languages.registerHoverProvider('typescript', {
      provideHover: (model, position) => lineHoverAt(model, position, steppedRef.current),
    });
    return () => {
      command.dispose();
      hover.dispose();
    };
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

  useEffect(() => {
    const index = trace ? resolveEventCursor(trace, tick, eventCursor) : null;
    const origin = (index === null ? undefined : trace?.events[index]?.origin) ?? null;
    const stepped =
      origin && trace && index !== null
        ? {
            origin,
            calls: trace.calls ? callsAtEvent(trace, index) : [],
            unrecorded: pastCallLog(trace.calls, index),
          }
        : null;
    steppedRef.current = stepped;
    markOrigin(stepped, markedRef.current);
    if (origin?.file === 'program') {
      editorRef.current?.revealLineInCenterIfOutsideViewport(origin.line);
    }
  }, [trace, tick, eventCursor]);

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
    editor.addAction({
      id: 'as-instructed.goToFirstEventFromLine',
      label: 'Go to first event from this line',
      contextMenuGroupId: 'navigation',
      keybindings: [api.KeyMod.Alt | api.KeyCode.KeyE],
      run: (target) => {
        const line = target.getPosition()?.lineNumber;
        if (line !== undefined) seekToLineRef.current('program', line);
      },
    });
    editor.focus();
  };

  return (
    <Editor
      key={level?.id ?? 'none'}
      path={PLAYER_FILE_PATH}
      // Disposing the model restarts its version at 1, and the typescript worker reuses the
      // program it already emitted for that version — the previous order's source.
      keepCurrentModel
      defaultLanguage="typescript"
      language="typescript"
      theme={THEME}
      value={code}
      onChange={(next) => setCode(next ?? '')}
      onMount={onMount}
      onValidate={(markers) => onProblems?.(markers.filter((m) => m.severity === 8).length)}
      loading={<span>Loading editor…</span>}
      options={options}
    />
  );
}
