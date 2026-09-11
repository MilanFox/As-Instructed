import type * as MonacoEditor from 'monaco-editor';
import type { RuntimeFailure } from './protocol.ts';
import { buildAmbientDts, unlockedApiNames } from './ambient.ts';
import { compileFailure, offsetToPosition } from './errors.ts';
import { decodeLineMap } from './sourcemap.ts';

export type MonacoApi = typeof MonacoEditor;
type TextModel = MonacoEditor.editor.ITextModel;
type TsDiagnostic = MonacoEditor.languages.typescript.Diagnostic;

export const PLAYER_FILE_PATH = 'file:///bootstrap/program.ts';
const AMBIENT_FILE_PATH = 'file:///bootstrap/firmware.d.ts';

const MODULE_DETECTION_FORCE = 3;

const installedCompilerOptions = new WeakMap<object, string>();

export interface CompileDiagnostic {
  message: string;
  line: number;
  column: number;
  length: number;
  severity: 'error' | 'warning' | 'info';
  code: number;
}

export interface CompileSuccess {
  ok: true;
  js: string;
  lineMap: number[];
  diagnostics: CompileDiagnostic[];
}

export interface CompileFailure {
  ok: false;
  diagnostics: CompileDiagnostic[];
  error: RuntimeFailure;
}

export type CompileResult = CompileSuccess | CompileFailure;

export interface LanguageOptions {
  unlockedHardware?: readonly string[];
  levelId?: string;
  libraryDeclaration?: string;
}

function resolveUnlocked(options: LanguageOptions): string[] {
  if (options.unlockedHardware) return [...options.unlockedHardware];
  if (options.levelId) return unlockedApiNames(options.levelId);
  return [];
}

export function configurePlayerLanguage(monaco: MonacoApi, options: LanguageOptions): void {
  const ts = monaco.languages.typescript;

  installLanguageOptions(monaco, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    moduleDetection: MODULE_DETECTION_FORCE,
    lib: ['es2022'],
    strict: true,
    noImplicitAny: false,
    strictNullChecks: false,
    allowNonTsExtensions: true,
    noEmitHelpers: false,
    removeComments: false,
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: false,
    skipLibCheck: true,
  });

  currentAmbientDts = buildAmbientDts(resolveUnlocked(options));
  if (options.libraryDeclaration !== undefined) currentLibTypes = options.libraryDeclaration;
  installExtraLibs(monaco);
}

function installLanguageOptions(
  monaco: MonacoApi,
  compilerOptions: MonacoEditor.languages.typescript.CompilerOptions,
): void {
  const ts = monaco.languages.typescript;
  const fingerprint = JSON.stringify(compilerOptions);
  if (installedCompilerOptions.get(monaco) === fingerprint) return;
  installedCompilerOptions.set(monaco, fingerprint);

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    diagnosticCodesToIgnore: [1375, 1378, 2669],
  });
  ts.typescriptDefaults.setEagerModelSync(true);
}

export { buildAmbientDts, unlockedApiNames } from './ambient.ts';

function flattenMessage(message: TsDiagnostic['messageText']): string {
  if (typeof message === 'string') return message;

  const parts: string[] = [];
  const walk = (chain: { messageText: string; next?: { messageText: string }[] }): void => {
    parts.push(chain.messageText);
    for (const next of chain.next ?? []) walk(next as typeof chain);
  };
  walk(message);
  return parts.join(' ');
}

function severityOf(category: 0 | 1 | 2 | 3): CompileDiagnostic['severity'] {
  if (category === 1) return 'error';
  if (category === 0) return 'warning';
  return 'info';
}

export function toCompileDiagnostics(
  source: string,
  diagnostics: readonly TsDiagnostic[],
): CompileDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const { line, column } = offsetToPosition(source, diagnostic.start ?? 0);
    return {
      message: flattenMessage(diagnostic.messageText),
      line,
      column,
      length: diagnostic.length ?? 1,
      severity: severityOf(diagnostic.category),
      code: diagnostic.code,
    };
  });
}

async function workerFor(monaco: MonacoApi, model: TextModel) {
  const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
  return getWorker(model.uri);
}

export async function getPlayerDiagnostics(
  monaco: MonacoApi,
  model: TextModel,
): Promise<CompileDiagnostic[]> {
  const worker = await workerFor(monaco, model);
  const fileName = model.uri.toString();
  const [syntactic, semantic] = await Promise.all([
    worker.getSyntacticDiagnostics(fileName),
    worker.getSemanticDiagnostics(fileName),
  ]);
  return toCompileDiagnostics(model.getValue(), [...syntactic, ...semantic]);
}

const SOURCE_MAP_COMMENT = /\n\/\/# sourceMappingURL=.*$/;

export async function compilePlayerCode(
  monaco: MonacoApi,
  model: TextModel,
): Promise<CompileResult> {
  const source = model.getValue();
  const worker = await workerFor(monaco, model);
  const fileName = model.uri.toString();

  const [syntactic, semantic] = await Promise.all([
    worker.getSyntacticDiagnostics(fileName),
    worker.getSemanticDiagnostics(fileName),
  ]);
  const diagnostics = toCompileDiagnostics(source, [...syntactic, ...semantic]);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

  if (errors.length > 0) {
    const first = errors[0] as CompileDiagnostic;
    const suffix = errors.length > 1 ? ` (${errors.length - 1} more.)` : '';
    return {
      ok: false,
      diagnostics,
      error: compileFailure(`${first.message}${suffix}`, first),
    };
  }

  const emit = await worker.getEmitOutput(fileName);
  const js = emit.outputFiles.find((file) => file.name.endsWith('.js'));
  const map = emit.outputFiles.find((file) => file.name.endsWith('.js.map'));

  if (emit.emitSkipped || !js) {
    return {
      ok: false,
      diagnostics,
      error: compileFailure(
        'The compiler could not produce a program from this source. Check for an unclosed brace ' +
          'or bracket.',
      ),
    };
  }

  return {
    ok: true,
    js: js.text.replace(SOURCE_MAP_COMMENT, '\n'),
    lineMap: map ? decodeLineMap(map.text) : [],
    diagnostics: diagnostics.filter((diagnostic) => diagnostic.severity !== 'error'),
  };
}

export const LIB_FILE_PATH = 'file:///bootstrap/lib.ts';
const LIB_TYPES_PATH = 'file:///bootstrap/lib.d.ts';

const EMPTY_LIB_TYPES = `declare module 'lib' {\n  export {};\n}\n`;

let currentAmbientDts = '';
let currentLibTypes = EMPTY_LIB_TYPES;

function installExtraLibs(monaco: MonacoApi): void {
  monaco.languages.typescript.typescriptDefaults.setExtraLibs([
    { content: currentAmbientDts, filePath: AMBIENT_FILE_PATH },
    { content: currentLibTypes, filePath: LIB_TYPES_PATH },
  ]);
}

export function setLibraryTypes(monaco: MonacoApi, declaration: string | undefined): void {
  currentLibTypes = declaration === undefined ? EMPTY_LIB_TYPES : declaration;
  installExtraLibs(monaco);
}

export function toAmbientModule(dts: string): string {
  const body = dts
    .replace(/^\s*\/\/#\s*sourceMappingURL=.*$/gm, '')
    .replace(/^(\s*export\s+)declare\s+/gm, '$1')
    .replace(/^(\s*)declare\s+/gm, '$1')
    .trim();

  if (body === '' || !/\bexport\b/.test(body)) return EMPTY_LIB_TYPES;
  const indented = body
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line}`))
    .join('\n');
  return `declare module 'lib' {\n${indented}\n}\n`;
}

export interface LibraryCompileSuccess {
  ok: true;
  js: string;
  lineMap: number[];
  declaration: string;
  exports: string[];
  diagnostics: CompileDiagnostic[];
}

export type LibraryCompileResult = LibraryCompileSuccess | CompileFailure;

const EXPORTED_NAME =
  /^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+|abstract\s+class\s+)([A-Za-z_$][\w$]*)/gm;

function exportedNames(dts: string): string[] {
  const names = new Set<string>();
  for (const match of dts.matchAll(EXPORTED_NAME)) names.add(match[1] as string);
  for (const match of dts.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = (part.includes(' as ') ? part.split(/\s+as\s+/).pop() : part)?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

export async function compileLibrary(
  monaco: MonacoApi,
  model: TextModel,
): Promise<LibraryCompileResult> {
  const source = model.getValue();
  const worker = await workerFor(monaco, model);
  const fileName = model.uri.toString();

  const [syntactic, semantic] = await Promise.all([
    worker.getSyntacticDiagnostics(fileName),
    worker.getSemanticDiagnostics(fileName),
  ]);
  const diagnostics = toCompileDiagnostics(source, [...syntactic, ...semantic]);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

  if (errors.length > 0) {
    const first = errors[0] as CompileDiagnostic;
    const suffix = errors.length > 1 ? ` (${errors.length - 1} more.)` : '';
    return { ok: false, diagnostics, error: compileFailure(`${first.message}${suffix}`, first) };
  }

  const [emit, dtsEmit] = await Promise.all([
    worker.getEmitOutput(fileName),
    worker.getEmitOutput(fileName, true, true),
  ]);
  const js = emit.outputFiles.find((file) => file.name.endsWith('.js'));
  const map = emit.outputFiles.find((file) => file.name.endsWith('.js.map'));
  const dts = dtsEmit.outputFiles.find((file) => file.name.endsWith('.d.ts'));

  if (emit.emitSkipped || !js) {
    return {
      ok: false,
      diagnostics,
      error: compileFailure(
        'The repository could not be built from this source. Check for an unclosed brace or bracket.',
      ),
    };
  }

  const dtsText = dts?.text ?? '';
  return {
    ok: true,
    js: js.text.replace(SOURCE_MAP_COMMENT, '\n'),
    lineMap: map ? decodeLineMap(map.text) : [],
    declaration: toAmbientModule(dtsText),
    exports: exportedNames(dtsText),
    diagnostics: diagnostics.filter((diagnostic) => diagnostic.severity !== 'error'),
  };
}

export async function emitOnly(monaco: MonacoApi, model: TextModel): Promise<CompileResult> {
  const source = model.getValue();
  const worker = await workerFor(monaco, model);
  const fileName = model.uri.toString();

  const syntactic = await worker.getSyntacticDiagnostics(fileName);
  const diagnostics = toCompileDiagnostics(source, syntactic);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    const first = errors[0] as CompileDiagnostic;
    return { ok: false, diagnostics, error: compileFailure(first.message, first) };
  }

  const emit = await worker.getEmitOutput(fileName);
  const js = emit.outputFiles.find((file) => file.name.endsWith('.js'));
  const map = emit.outputFiles.find((file) => file.name.endsWith('.js.map'));
  if (!js) {
    return {
      ok: false,
      diagnostics,
      error: compileFailure('The compiler could not produce a program from this source.'),
    };
  }

  return {
    ok: true,
    js: js.text.replace(SOURCE_MAP_COMMENT, '\n'),
    lineMap: map ? decodeLineMap(map.text) : [],
    diagnostics: [],
  };
}
