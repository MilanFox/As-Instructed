import type * as MonacoEditor from 'monaco-editor';
import type { RuntimeFailure } from './protocol.ts';
import { buildAmbientDts, unlockedApiNames } from './ambient.ts';
import { compileFailure, offsetToPosition } from './errors.ts';
import { decodeLineMap } from './sourcemap.ts';

/**
 * Compiling the player's TypeScript, in the browser, with the compiler Monaco already ships.
 *
 * DESIGN.md §2 settles this: the editor is Monaco and the player writes real TypeScript, so the
 * TypeScript worker Monaco loads for syntax highlighting is also the transpiler. Bundling a second
 * copy of `typescript` would be several megabytes for a compiler that is already on the page.
 *
 * The Monaco namespace is passed in rather than imported so this module cannot create a second
 * Monaco instance behind `@monaco-editor/react`'s back. UI owns the editor; RUNTIME owns what the
 * language service is configured to believe.
 */

export type MonacoApi = typeof MonacoEditor;
type TextModel = MonacoEditor.editor.ITextModel;
type TsDiagnostic = MonacoEditor.languages.typescript.Diagnostic;

/** The one file the player edits. Fixed, because the worker is addressed by URI. */
export const PLAYER_FILE_PATH = 'file:///bootstrap/program.ts';
const AMBIENT_FILE_PATH = 'file:///bootstrap/firmware.d.ts';

export interface CompileDiagnostic {
  message: string;
  /** 1-based, in the player's source. */
  line: number;
  /** 1-based. */
  column: number;
  /** Length of the highlighted span, in characters. */
  length: number;
  severity: 'error' | 'warning' | 'info';
  /** The TypeScript diagnostic code, e.g. 2304. */
  code: number;
}

export interface CompileSuccess {
  ok: true;
  /** Emitted JavaScript, ready for the worker. */
  js: string;
  /** Emitted line -> source line. See `sourcemap.ts`. */
  lineMap: number[];
  /** Warnings and suggestions only; errors would have made this a failure. */
  diagnostics: CompileDiagnostic[];
}

export interface CompileFailure {
  ok: false;
  diagnostics: CompileDiagnostic[];
  /** The first error, already player-facing. */
  error: RuntimeFailure;
}

export type CompileResult = CompileSuccess | CompileFailure;

export interface LanguageOptions {
  /** API names the player has unlocked. Usually `unlockedApiNames(levelId)`. */
  unlockedHardware?: readonly string[];
  /** Convenience: derive the unlocked list from a level id. */
  levelId?: string;
  /**
   * `declare module 'lib' { … }` for the player's shared library. Reinstalled on every level
   * change so the declaration survives a call that only meant to change the hardware.
   */
  libraryDeclaration?: string;
}

function resolveUnlocked(options: LanguageOptions): string[] {
  if (options.unlockedHardware) return [...options.unlockedHardware];
  if (options.levelId) return unlockedApiNames(options.levelId);
  return [];
}

/**
 * Points the TypeScript language service at exactly the world the player is in.
 *
 * `lib: ['es2022']` and no DOM is deliberate twice over: the bot has no DOM, and without it a
 * player who writes `const name = ...` collides with `window.name` and gets an error they cannot
 * possibly understand.
 *
 * Call once per level change; it replaces the ambient declarations wholesale, so a function that
 * was unlocked by the previous level stops existing the moment the player opens an earlier one.
 */
export function configurePlayerLanguage(monaco: MonacoApi, options: LanguageOptions): void {
  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    /* Monaco's `ScriptTarget` enum stops at ES2020; `ESNext` is the honest way to say "do not
       downlevel", which also keeps the emit close to line-for-line. */
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    lib: ['es2022'],
    strict: true,
    noImplicitAny: true,
    strictNullChecks: true,
    allowNonTsExtensions: true,
    noEmitHelpers: false,
    removeComments: false,
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: false,
    skipLibCheck: true,
  });

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    /* 1375/1378: top-level await. 2669: augmentation in a non-module. Neither is the player's problem. */
    diagnosticCodesToIgnore: [1375, 1378, 2669],
  });

  ts.typescriptDefaults.setEagerModelSync(true);
  currentAmbientDts = buildAmbientDts(resolveUnlocked(options));
  if (options.libraryDeclaration !== undefined) currentLibTypes = options.libraryDeclaration;
  installExtraLibs(monaco);
}

/** The ambient `.d.ts` as the editor would see it. Exported for the docs panel and for tests. */
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

/** Maps Monaco's character offsets into the line/column the player sees. */
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

/**
 * Type and syntax errors for the editor, before the player has run anything.
 *
 * A function the player has not unlocked yet is a `Cannot find name` error here, which is the
 * whole point of generating the ambient `.d.ts` per level: the game teaches through the type
 * checker rather than through a runtime surprise.
 */
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

/**
 * Transpiles the model and returns everything the worker needs.
 *
 * Any error-severity diagnostic fails the compile: the player is told before a single tick is
 * simulated, which is both faster and far less confusing than watching a bot do nothing.
 */
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

// ---------------------------------------------------------------------------
// The shared library
// ---------------------------------------------------------------------------

/** The second file the player edits. Fixed, because the worker is addressed by URI. */
export const LIB_FILE_PATH = 'file:///bootstrap/lib.ts';
const LIB_TYPES_PATH = 'file:///bootstrap/lib.d.ts';

/**
 * The ambient declaration installed when the library has nothing to publish.
 *
 * An empty ambient module makes every `import { x } from 'lib'` an honest "has no exported member"
 * rather than a silent `any`, which is what a missing declaration would produce.
 */
const EMPTY_LIB_TYPES = `declare module 'lib' {\n  export {};\n}\n`;

/**
 * The two extra libs the language service is holding, so either can be replaced without dropping
 * the other. `setExtraLibs` replaces the whole set, and losing the firmware declarations would
 * make every API call in the editor an error.
 */
let currentAmbientDts = '';
let currentLibTypes = EMPTY_LIB_TYPES;

function installExtraLibs(monaco: MonacoApi): void {
  monaco.languages.typescript.typescriptDefaults.setExtraLibs([
    { content: currentAmbientDts, filePath: AMBIENT_FILE_PATH },
    { content: currentLibTypes, filePath: LIB_TYPES_PATH },
  ]);
}

/**
 * Publishes the library's type surface to the editor as `declare module 'lib'`.
 *
 * Path mapping would be the textbook route, but Monaco's virtual file system resolves modules
 * through a host we do not own; an ambient module declaration is resolved by the checker itself
 * and cannot be defeated by a resolution setting. The declaration source is the `.d.ts` the
 * TypeScript compiler emits from `lib.ts`, so the types the player sees in a level are the types
 * their own library actually has — no hand-written mirror to drift.
 */
export function setLibraryTypes(monaco: MonacoApi, declaration: string | undefined): void {
  currentLibTypes = declaration === undefined ? EMPTY_LIB_TYPES : declaration;
  installExtraLibs(monaco);
}

/** `.d.ts` emit -> a body legal inside `declare module`. */
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
  /** `declare module 'lib' { … }`, ready for `setLibraryTypes`. */
  declaration: string;
  /** Names the library publishes, read off the emitted declaration. */
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

/**
 * Transpiles `lib.ts` and derives its public type surface in one pass.
 *
 * The `.d.ts` is emitted with `forceDtsEmit`, so the global compiler options stay exactly as the
 * level editor needs them and the player's Run path pays nothing for a feature it is not using.
 */
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

/**
 * Emit without asking the type checker's opinion.
 *
 * The regression suite re-compiles work orders the player has already closed, under whatever
 * hardware the *current* level unlocked — so a World 7 solution re-checked while the player sits
 * in World 4 would be full of `Cannot find name` errors that mean nothing. Those errors were
 * answered when the work order was closed. Only syntax can still be wrong here, and syntax is
 * still checked, because emitting from a file that does not parse would produce nonsense.
 */
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
