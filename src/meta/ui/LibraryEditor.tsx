import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type * as React from 'react';
import { LIB_FILE_PATH, compileLibrary, setLibraryTypes } from '../../runtime/index.ts';
import { THEME, monaco, setupMonaco, typescriptRegistered } from '../../ui/monaco-setup.ts';
import { LIBRARY_PANEL_HINT, NO_EXPORTS_WARNING } from '../copy.ts';
import { publishableDeclarations } from '../publish.ts';
import { useLibrary } from '../store.ts';
import './library.css';

const COMPILE_DEBOUNCE_MS = 400;
const MARKER_OWNER = 'as-instructed-library';

export function LibraryEditor(): React.JSX.Element {
  const source = useLibrary((state) => state.source);
  const setSource = useLibrary((state) => state.setSource);
  const commit = useLibrary((state) => state.commitSource);
  const dirty = useLibrary((state) => state.dirty);
  const busy = useLibrary((state) => state.busy);
  const warnRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setupMonaco();
  }, []);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const model = monaco.editor.getModel(monaco.Uri.parse(LIB_FILE_PATH));
      if (!model) return;
      void typescriptRegistered()
        .then(() => compileLibrary(monaco, model))
        .then((result) => {
          if (!live) return;
          if (result.ok) {
            setLibraryTypes(monaco, result.declaration);
            monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
            if (warnRef.current) {
              const owed =
                result.exports.length === 0 && publishableDeclarations(source).length > 0;
              warnRef.current.textContent = owed ? NO_EXPORTS_WARNING : '';
            }
            return;
          }
          monaco.editor.setModelMarkers(
            model,
            MARKER_OWNER,
            result.diagnostics
              .filter((diagnostic) => diagnostic.severity === 'error')
              .map((diagnostic) => ({
                severity: monaco.MarkerSeverity.Error,
                message: diagnostic.message,
                startLineNumber: diagnostic.line,
                endLineNumber: diagnostic.line,
                startColumn: diagnostic.column,
                endColumn: diagnostic.column + Math.max(1, diagnostic.length),
              })),
          );
        });
    }, COMPILE_DEBOUNCE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source]);

  const onMount: OnMount = (editor, api) => {
    editor.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => {
      void useLibrary.getState().commitSource();
    });
  };

  return (
    <>
      <p className="lib__hint">{LIBRARY_PANEL_HINT}</p>
      <div className="lib__editor">
        <Editor
          theme={THEME}
          path={LIB_FILE_PATH}
          defaultLanguage="typescript"
          value={source}
          onChange={(next) => setSource(next ?? '')}
          onMount={onMount}
          options={{
            ariaLabel: 'lib.ts',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 2,
            renderLineHighlight: 'line',
            automaticLayout: true,
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            autoClosingOvertype: 'never',
            autoSurround: 'never',
            wordWrap: 'on',
            wrappingIndent: 'indent',
          }}
        />
      </div>
      <div className="lib__bar">
        <span className="lib__note" ref={warnRef} />
        <span className="lib__spacer" />
        <span className="lib__note">{dirty ? 'uncommitted' : 'committed'}</span>
        <button
          type="button"
          className="lib__btn lib__btn--primary"
          disabled={!dirty || busy}
          onClick={() => void commit()}
          aria-label="Commit"
          title="Save lib.ts and re-run every closed work order that reads it"
        >
          Commit
        </button>
      </div>
    </>
  );
}
