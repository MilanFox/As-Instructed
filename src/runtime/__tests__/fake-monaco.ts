import ts from 'typescript';
import type * as MonacoEditor from 'monaco-editor';
import type { MonacoApi } from '../compile.ts';

type TextModel = MonacoEditor.editor.ITextModel;

export interface FakeMonaco {
  monaco: MonacoApi;
  model(uri: string, text: string): TextModel;
}

function normalizeOptions(options: ts.CompilerOptions): ts.CompilerOptions {
  const lib = options.lib?.map((name) => (name.startsWith('lib.') ? name : `lib.${name}.d.ts`));
  return { ...options, ...(lib ? { lib } : {}) };
}

function toWorkerDiagnostic(diagnostic: ts.Diagnostic): {
  start: number | undefined;
  length: number | undefined;
  messageText: ts.Diagnostic['messageText'];
  category: 0 | 1 | 2 | 3;
  code: number;
} {
  return {
    start: diagnostic.start,
    length: diagnostic.length,
    messageText: diagnostic.messageText,
    category: diagnostic.category as 0 | 1 | 2 | 3,
    code: diagnostic.code,
  };
}

export function createFakeMonaco(): FakeMonaco {
  const documents = new Map<string, string>();
  const versions = new Map<string, number>();
  let compilerOptions: ts.CompilerOptions = {};
  let ignoredCodes: number[] = [];

  const write = (fileName: string, text: string): void => {
    documents.set(fileName, text);
    versions.set(fileName, (versions.get(fileName) ?? 0) + 1);
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...documents.keys()],
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
      const document = documents.get(fileName);
      if (document !== undefined) return ts.ScriptSnapshot.fromString(document);
      if (!ts.sys.fileExists(fileName)) return undefined;
      return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName) ?? '');
    },
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => normalizeOptions(compilerOptions),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => documents.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => documents.get(fileName) ?? ts.sys.readFile(fileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  const keep = (diagnostic: ts.Diagnostic): boolean => !ignoredCodes.includes(diagnostic.code);

  const worker = {
    getSyntacticDiagnostics: (fileName: string) =>
      Promise.resolve(
        service.getSyntacticDiagnostics(fileName).filter(keep).map(toWorkerDiagnostic),
      ),
    getSemanticDiagnostics: (fileName: string) =>
      Promise.resolve(
        service.getSemanticDiagnostics(fileName).filter(keep).map(toWorkerDiagnostic),
      ),
    getEmitOutput: (fileName: string, emitOnlyDtsFiles?: boolean, forceDtsEmit?: boolean) =>
      Promise.resolve(service.getEmitOutput(fileName, emitOnlyDtsFiles, forceDtsEmit)),
  };

  const typescriptDefaults = {
    setCompilerOptions: (options: ts.CompilerOptions) => {
      compilerOptions = options;
    },
    setDiagnosticsOptions: (options: { diagnosticCodesToIgnore?: number[] }) => {
      ignoredCodes = options.diagnosticCodesToIgnore ?? [];
    },
    setEagerModelSync: () => undefined,
    setExtraLibs: (libs: readonly { content: string; filePath?: string }[]) => {
      for (const fileName of [...documents.keys()]) {
        if (fileName.endsWith('.d.ts')) {
          documents.delete(fileName);
          versions.set(fileName, (versions.get(fileName) ?? 0) + 1);
        }
      }
      libs.forEach((lib, index) => {
        write(lib.filePath ?? `file:///extra-${String(index)}.d.ts`, lib.content);
      });
    },
  };

  const monaco = {
    languages: {
      typescript: {
        ScriptTarget: ts.ScriptTarget,
        ModuleKind: ts.ModuleKind,
        ModuleResolutionKind: ts.ModuleResolutionKind,
        typescriptDefaults,
        getTypeScriptWorker: () => Promise.resolve(() => Promise.resolve(worker)),
      },
    },
  } as unknown as MonacoApi;

  return {
    monaco,
    model(uri: string, text: string): TextModel {
      write(uri, text);
      return {
        uri: { toString: () => uri },
        getValue: () => documents.get(uri) ?? '',
      } as unknown as TextModel;
    },
  };
}
