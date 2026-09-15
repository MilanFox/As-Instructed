import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export const THEME = 'as-instructed-dark';

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

const WARM_UP_PATH = 'inmemory://as-instructed/typescript.ts';

const REGISTRATION_POLL_MS = 20;
const REGISTRATION_ATTEMPTS = 100;

let registration: Promise<void> | null = null;

export function typescriptRegistered(): Promise<void> {
  registration ??= (async () => {
    const uri = monaco.Uri.parse(WARM_UP_PATH);
    const model =
      monaco.editor.getModel(uri) ?? monaco.editor.createModel('export {};', 'typescript', uri);
    try {
      for (let attempt = 0; attempt < REGISTRATION_ATTEMPTS; attempt++) {
        try {
          await monaco.languages.typescript.getTypeScriptWorker();
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, REGISTRATION_POLL_MS));
        }
      }
      console.error('Monaco never registered its TypeScript language service.');
    } finally {
      model.dispose();
    }
  })();
  return registration;
}

export { monaco };
