import type { MonacoApi, RunRequest, RunResponse } from '../runtime/index.ts';
import {
  LIB_FILE_PATH,
  compileLibrary,
  emitOnly,
  importsLibrary,
  setLibraryTypes,
} from '../runtime/index.ts';
import { hashText } from './hash.ts';
import type { MetaRunOutcome, MetaRunRequest, MetaRunner } from './regression.ts';

/**
 * The seam between the metagame and the things that actually run code.
 *
 * `runSuite` and `probe` need one capability — "run this work order against this library and tell
 * me what happened" — and neither should know that a capability involves Monaco, a Web Worker, or
 * a source map. Everything browser-shaped is here, in about a hundred lines, and the whole of
 * `src/meta` is testable in Node because of it.
 */

/** The slice of `Runner` this module uses. */
export interface RunnerLike {
  run(request: RunRequest): Promise<RunResponse>;
}

const SCRATCH_PROGRAM_PATH = 'file:///bootstrap/regression/program.ts';
const SCRATCH_LIBRARY_PATH = 'file:///bootstrap/regression/lib.ts';

interface Emitted {
  js: string;
  lineMap: number[];
}

/**
 * Builds a `MetaRunner` over Monaco and the simulation worker.
 *
 * Two scratch models are reused for every compile rather than one per work order: Monaco keeps
 * every model it is given alive in the language service, and forty of them would make the editor's
 * own type checking slower for the entire session.
 *
 * The library emit is cached on its content hash, so a suite of thirty work orders compiles
 * `lib.ts` exactly once.
 */
export function createMetaRunner(options: {
  monaco: MonacoApi;
  runner: RunnerLike;
  /** Watchdog budget per work order. Suites are background work; be generous. */
  timeoutMs?: number;
}): MetaRunner & { dispose(): void } {
  const { monaco } = options;
  const uri = (path: string) => monaco.Uri.parse(path);
  const program = monaco.editor.createModel('', 'typescript', uri(SCRATCH_PROGRAM_PATH));
  const library = monaco.editor.createModel('', 'typescript', uri(SCRATCH_LIBRARY_PATH));
  const libraryCache = new Map<string, Emitted | null>();

  async function emitLibrary(source: string, hash: string): Promise<Emitted | null> {
    const cached = libraryCache.get(hash);
    if (cached !== undefined) return cached;
    library.setValue(source);
    const result = await emitOnly(monaco, library);
    const emitted = result.ok ? { js: result.js, lineMap: result.lineMap } : null;
    libraryCache.set(hash, emitted);
    return emitted;
  }

  return {
    async run(request: MetaRunRequest): Promise<MetaRunOutcome> {
      program.setValue(request.code);
      const compiled = await emitOnly(monaco, program);
      if (!compiled.ok) {
        return { passed: false, ticks: 0, failure: { message: compiled.error.message } };
      }

      let linked: Emitted | null = null;
      if (request.library && importsLibrary(request.code)) {
        linked = await emitLibrary(request.library.source, request.library.hash);
        if (!linked) {
          return {
            passed: false,
            ticks: 0,
            failure: { message: 'lib.ts does not build.', file: 'lib' },
          };
        }
      }

      const run: RunRequest = {
        code: request.code,
        js: compiled.js,
        lineMap: compiled.lineMap,
        levelId: request.levelId,
        seeds: [...request.seeds],
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(linked && request.library
          ? {
              library: {
                js: linked.js,
                lineMap: linked.lineMap,
                hash: request.library.hash,
              },
            }
          : {}),
      };

      return toOutcome(await options.runner.run(run));
    },

    dispose(): void {
      program.dispose();
      library.dispose();
      libraryCache.clear();
    },
  };
}

/**
 * Collapses a `RunResponse` to the four facts the metagame cares about.
 *
 * The worst seed decides, exactly as the campaign scores it: a work order that passes on two
 * layouts and fails on a third has not closed, and reporting the best of the three would make the
 * regression suite the one place in the game that lies to make itself look calm.
 */
export function toOutcome(response: RunResponse): MetaRunOutcome {
  if (!response.ok) {
    const failure: MetaRunOutcome['failure'] = { message: response.error.message };
    if (response.error.file) failure.file = response.error.file;
    if (response.error.line !== undefined) failure.line = response.error.line;
    return { passed: false, ticks: 0, failure };
  }

  const worst = response.results.reduce<(typeof response.results)[number] | undefined>(
    (found, each) => {
      if (!found) return each;
      if (found.passed && !each.passed) return each;
      if (found.passed === each.passed && each.ticks > found.ticks) return each;
      return found;
    },
    undefined,
  );

  const outcome: MetaRunOutcome = {
    passed: response.verdict.passed,
    ticks: response.verdict.stats.ticks,
  };
  if (response.libraryUsage) outcome.usage = response.libraryUsage;
  else if (worst?.libraryUsage) outcome.usage = worst.libraryUsage;
  if (worst?.failure) {
    outcome.failure = { message: worst.failure.message };
    if (worst.failure.file) outcome.failure.file = worst.failure.file;
    if (worst.failure.line !== undefined) outcome.failure.line = worst.failure.line;
  }
  return outcome;
}

/** Identity of a library source, used as the cache key everywhere. */
export function libraryHashOf(source: string): string {
  return hashText(source);
}

/**
 * Compiles the current `lib.ts` once and hands back everything the rest of the app needs from it.
 *
 * The integrator calls this on start-up and after every commit. It does two jobs that are easy to
 * forget separately and disastrous to forget individually: it installs `declare module 'lib'` so
 * the *level* editor type-checks the player's imports, and it produces the `RunRequest.library`
 * payload so a normal Run links the library in with a correct line map.
 *
 * Returns `undefined` for `request` when the library does not build. The caller should run the
 * work order anyway when it imports nothing, and refuse with `LIBRARY_FAILURE.notCompiled` when
 * it does.
 */
export async function prepareLibrary(
  monaco: MonacoApi,
  source: string,
): Promise<{
  request?: NonNullable<RunRequest['library']>;
  exports: string[];
  problems: { line: number; message: string }[];
}> {
  const path = LIB_FILE_PATH;
  const uri = monaco.Uri.parse(path);
  const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(source, 'typescript', uri);
  if (model.getValue() !== source) model.setValue(source);

  const result = await compileLibrary(monaco, model);
  if (!result.ok) {
    setLibraryTypes(monaco, undefined);
    return {
      exports: [],
      problems: result.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => ({ line: diagnostic.line, message: diagnostic.message })),
    };
  }

  setLibraryTypes(monaco, result.declaration);
  return {
    request: { js: result.js, lineMap: result.lineMap, hash: hashText(source) },
    exports: result.exports,
    problems: [],
  };
}
