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

export interface RunnerLike {
  run(request: RunRequest): Promise<RunResponse>;
}

const SCRATCH_PROGRAM_PATH = 'file:///as-instructed/regression/program.ts';
const SCRATCH_LIBRARY_PATH = 'file:///as-instructed/regression/lib.ts';

interface Emitted {
  js: string;
  lineMap: number[];
}

export function createMetaRunner(options: {
  monaco: MonacoApi;
  runner: RunnerLike;
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
            failure: { message: 'lib.ts has an error.', file: 'lib' },
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

export function libraryHashOf(source: string): string {
  return hashText(source);
}

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
