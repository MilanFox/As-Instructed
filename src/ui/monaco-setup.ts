/**
 * Monaco, self-hosted. No CDN: the workers are bundled by Vite so the game runs offline.
 *
 * Language configuration — compiler options and the ambient hardware `.d.ts` — belongs to
 * `configurePlayerLanguage` in `src/runtime/compile.ts`, because the same declarations have to
 * describe what the sim worker will actually bind. This file only handles wiring and theme.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export const THEME = 'bootstrap-dark';

interface MonacoEnvironmentHost {
  MonacoEnvironment?: { getWorker(moduleId: string, label: string): Worker };
}

let ready = false;

export function setupMonaco(): typeof monaco {
  if (ready) return monaco;
  ready = true;

  (self as unknown as MonacoEnvironmentHost).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
    },
  };

  monaco.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'c9d5e3', background: '121820' },
      { token: 'comment', foreground: '5a6b7d', fontStyle: 'italic' },
      { token: 'keyword', foreground: '35e0c8' },
      { token: 'number', foreground: 'ffb020' },
      { token: 'string', foreground: '7ee06a' },
      { token: 'type', foreground: '9ad0ff' },
      { token: 'identifier', foreground: 'c9d5e3' },
      { token: 'delimiter', foreground: '6a7a8c' },
    ],
    colors: {
      'editor.background': '#121820',
      'editor.foreground': '#c9d5e3',
      'editorLineNumber.foreground': '#39485a',
      'editorLineNumber.activeForeground': '#6a7a8c',
      'editorCursor.foreground': '#35e0c8',
      'editor.selectionBackground': '#22405180',
      'editor.lineHighlightBackground': '#161e28',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#1b2430',
      'editorIndentGuide.activeBackground1': '#2f4157',
      'editorWidget.background': '#1b2430',
      'editorWidget.border': '#2f4157',
      'editorSuggestWidget.background': '#1b2430',
      'editorSuggestWidget.selectedBackground': '#22303e',
      'editorHoverWidget.background': '#1b2430',
      'editorError.foreground': '#ff5d5d',
      'editorWarning.foreground': '#ffb020',
      'scrollbarSlider.background': '#22303e80',
      'scrollbarSlider.hoverBackground': '#2f4157',
      'editorGutter.background': '#121820',
    },
  });

  loader.config({ monaco });
  return monaco;
}

export { monaco };
