import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import type { LevelDef, ReferenceSolution } from '../../levels/index.ts';
import { LEVELS, getLevel } from '../../levels/index.ts';
import { Runner } from '../host.ts';
import type { WorkerLike } from '../host.ts';
import type { RunRequest, RunResponse, WorkerRequestMessage } from '../protocol.ts';
import { unlockedApiNames } from '../ambient.ts';
import {
  LIB_FILE_PATH,
  PLAYER_FILE_PATH,
  compileLibrary,
  compilePlayerCode,
  configurePlayerLanguage,
  getPlayerDiagnostics,
} from '../compile.ts';
import { decodeLineMap } from '../sourcemap.ts';
import { runSeed } from '../run-level.ts';
import { serveRunRequest } from '../serve.ts';
import { createFakeMonaco } from './fake-monaco.ts';

import { solution as w1_01 } from '../../levels/world-1/__solutions__/w1-01.ts';
import { solution as w1_02 } from '../../levels/world-1/__solutions__/w1-02.ts';
import { solution as w1_03 } from '../../levels/world-1/__solutions__/w1-03.ts';
import { solution as w1_04 } from '../../levels/world-1/__solutions__/w1-04.ts';
import { solution as w1_05 } from '../../levels/world-1/__solutions__/w1-05.ts';
import { solution as w2_01 } from '../../levels/world-2/__solutions__/w2-01.ts';
import { solution as w2_02 } from '../../levels/world-2/__solutions__/w2-02.ts';
import { solution as w2_03 } from '../../levels/world-2/__solutions__/w2-03.ts';
import { solution as w2_04 } from '../../levels/world-2/__solutions__/w2-04.ts';
import { solution as w2_05 } from '../../levels/world-2/__solutions__/w2-05.ts';
import { solution as w3_01 } from '../../levels/world-3/__solutions__/w3-01.ts';
import { solution as w3_02 } from '../../levels/world-3/__solutions__/w3-02.ts';
import { solution as w3_03 } from '../../levels/world-3/__solutions__/w3-03.ts';
import { solution as w3_04 } from '../../levels/world-3/__solutions__/w3-04.ts';
import { solution as w3_05 } from '../../levels/world-3/__solutions__/w3-05.ts';
import { solution as w4_01 } from '../../levels/world-4/__solutions__/w4-01.ts';
import { solution as w4_02 } from '../../levels/world-4/__solutions__/w4-02.ts';
import { solution as w4_03 } from '../../levels/world-4/__solutions__/w4-03.ts';
import { solution as w4_04 } from '../../levels/world-4/__solutions__/w4-04.ts';
import { solution as w4_05 } from '../../levels/world-4/__solutions__/w4-05.ts';
import { solution as w5_01 } from '../../levels/world-5/__solutions__/w5-01.ts';
import { solution as w5_02 } from '../../levels/world-5/__solutions__/w5-02.ts';
import { solution as w5_03 } from '../../levels/world-5/__solutions__/w5-03.ts';
import { solution as w5_04 } from '../../levels/world-5/__solutions__/w5-04.ts';
import { solution as w5_05 } from '../../levels/world-5/__solutions__/w5-05.ts';
import { solution as w6_01 } from '../../levels/world-6/__solutions__/w6-01.ts';
import { solution as w6_02 } from '../../levels/world-6/__solutions__/w6-02.ts';
import { solution as w6_03 } from '../../levels/world-6/__solutions__/w6-03.ts';
import { solution as w6_04 } from '../../levels/world-6/__solutions__/w6-04.ts';
import { solution as w6_05 } from '../../levels/world-6/__solutions__/w6-05.ts';
import { solution as w7_01 } from '../../levels/world-7/__solutions__/w7-01.ts';
import { solution as w7_02 } from '../../levels/world-7/__solutions__/w7-02.ts';
import { solution as w7_03 } from '../../levels/world-7/__solutions__/w7-03.ts';
import { solution as w7_04 } from '../../levels/world-7/__solutions__/w7-04.ts';
import { solution as w7_05 } from '../../levels/world-7/__solutions__/w7-05.ts';
import { solution as w8_01 } from '../../levels/world-8/__solutions__/w8-01.ts';
import { solution as w8_02 } from '../../levels/world-8/__solutions__/w8-02.ts';
import { solution as w8_03 } from '../../levels/world-8/__solutions__/w8-03.ts';
import { solution as w8_04 } from '../../levels/world-8/__solutions__/w8-04.ts';
import { solution as w8_05 } from '../../levels/world-8/__solutions__/w8-05.ts';

/**
 * Every reference solution, executed the way a player executes one.
 *
 * `src/levels/__tests__/levels.test.ts` proves the campaign solvable by driving `Sim` directly.
 * That says nothing about the API the player actually types: `ReferenceSolution.source` is the
 * same solution written as player TypeScript, and until this file existed nothing ever ran it.
 * The gap that hid in there was the whole of World 7 — `bot(id)` did not exist in `src/runtime/`,
 * so every multi-bot level threw `ReferenceError` on Run while its tests stayed green.
 *
 * So this suite goes through the real path — transpile, then `runSeed`, which is what the worker
 * calls — and the last describe block goes further and drives `Runner` over a stubbed transport
 * so the request envelope, the aggregate and the verdict are exercised too.
 */

const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w1-01': w1_01, 'w1-02': w1_02, 'w1-03': w1_03, 'w1-04': w1_04, 'w1-05': w1_05,
  'w2-01': w2_01, 'w2-02': w2_02, 'w2-03': w2_03, 'w2-04': w2_04, 'w2-05': w2_05,
  'w3-01': w3_01, 'w3-02': w3_02, 'w3-03': w3_03, 'w3-04': w3_04, 'w3-05': w3_05,
  'w4-01': w4_01, 'w4-02': w4_02, 'w4-03': w4_03, 'w4-04': w4_04, 'w4-05': w4_05,
  'w5-01': w5_01, 'w5-02': w5_02, 'w5-03': w5_03, 'w5-04': w5_04, 'w5-05': w5_05,
  'w6-01': w6_01, 'w6-02': w6_02, 'w6-03': w6_03, 'w6-04': w6_04, 'w6-05': w6_05,
  'w7-01': w7_01, 'w7-02': w7_02, 'w7-03': w7_03, 'w7-04': w7_04, 'w7-05': w7_05,
  'w8-01': w8_01, 'w8-02': w8_02, 'w8-03': w8_03, 'w8-04': w8_04, 'w8-05': w8_05,
};

/**
 * Sources that are still sketches rather than programs, with the reason and with every name they
 * invent. CONTENT owns these; the list is asserted in both directions, so fixing one turns this
 * suite red until the entry is removed. Empty, and meant to stay that way.
 */
const NOT_YET_A_PROGRAM: Record<string, { why: string; invents: string[] }> = {};

/**
 * Levels the `bot(id)` handle exists for: the whole of World 7, plus any later level that puts
 * more than one bot on the site. World 7 counts entire because `w7-02` starts alone and builds
 * its own fleet with `spawn`, which is exactly the surface under test.
 */
function isMultiBot(level: LevelDef): boolean {
  return level.world === 7 || level.build(level.seeds[0] as number).bots.length > 1;
}

const MULTI_BOT = LEVELS.filter(isMultiBot).map((level) => level.id);

// ---------------------------------------------------------------------------
// Compiling the way the editor compiles
// ---------------------------------------------------------------------------

interface Compiled {
  js: string;
  lineMap: number[];
}

/** The emit half of `compilePlayerCode`, with Monaco's compiler options. */
function transpile(source: string): Compiled {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleDetection: ts.ModuleDetectionKind.Force,
      sourceMap: true,
      removeComments: false,
    },
    fileName: 'program.ts',
  });
  return {
    js: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '\n'),
    lineMap: decodeLineMap(output.sourceMapText ?? ''),
  };
}

/**
 * The editor, as the player has it: one language service, reconfigured per level.
 *
 * `configurePlayerLanguage` is what decides which names exist and how strictly what the player
 * wrote is judged, so every check below goes through it rather than through a second set of
 * compiler options that could drift away from the real ones.
 */
const editor = createFakeMonaco();

function playerModel(levelId: string, source: string) {
  configurePlayerLanguage(editor.monaco, { levelId });
  return editor.model(PLAYER_FILE_PATH, source);
}

/** `error TS2304: Cannot find name 'bot'` — the shape of a missing binding. */
async function unknownNames(levelId: string, program: string): Promise<string[]> {
  const names = new Set<string>();
  for (const diagnostic of await getPlayerDiagnostics(
    editor.monaco,
    playerModel(levelId, program),
  )) {
    if (diagnostic.code !== 2304) continue;
    names.add(/'([^']+)'/.exec(diagnostic.message)?.[1] ?? diagnostic.message);
  }
  return [...names].sort();
}

// ---------------------------------------------------------------------------
// Running the way the worker runs
// ---------------------------------------------------------------------------

interface Outcome {
  seed: number;
  passed: boolean;
  unmet: string[];
  failure: string | undefined;
  ticks: number;
}

const compiledCache = new Map<string, Compiled>();

function compiledSource(levelId: string): Compiled {
  const cached = compiledCache.get(levelId);
  if (cached) return cached;
  const built = transpile((SOLUTIONS[levelId] as ReferenceSolution).source);
  compiledCache.set(levelId, built);
  return built;
}

function runSource(level: LevelDef, seed: number): Outcome {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  const { js, lineMap } = compiledSource(level.id);
  const run = runSeed({
    level,
    seed,
    js,
    lineMap,
    source: solution.source,
    unlockedHardware: unlockedApiNames(level.id),
  });
  return {
    seed,
    passed: run.verdict.passed,
    unmet: run.verdict.objectives.filter((objective) => !objective.met).map((o) => o.id),
    failure: run.result.failure?.message,
    ticks: run.result.ticks,
  };
}

describe('the reference sources are real programs', () => {
  test('every registered level has one, and the campaign has multi-bot levels to prove', () => {
    for (const level of LEVELS) expect(SOLUTIONS[level.id], level.id).toBeDefined();
    expect(MULTI_BOT.length).toBeGreaterThanOrEqual(6);
    expect(MULTI_BOT).toContain('w7-01');
  });

  test('the broken list names real levels and nothing that has been fixed', () => {
    for (const id of Object.keys(NOT_YET_A_PROGRAM)) expect(getLevel(id), id).toBeDefined();
  });

  for (const level of LEVELS) {
    const known = NOT_YET_A_PROGRAM[level.id];

    test(`${level.id} names only API that exists at that level`, async () => {
      const missing = await unknownNames(
        level.id,
        (SOLUTIONS[level.id] as ReferenceSolution).source,
      );
      expect(missing, known?.why ?? level.id).toEqual(known?.invents ?? []);
    });

    test(
      `${level.id} passes every seed through the runtime`,
      { timeout: 120_000 },
      () => {
        /* One seed is enough to keep a known-broken source honest, and running the rest of them
           is minutes of work that proves nothing. */
        if (known !== undefined) {
          const first = runSource(level, level.seeds[0] as number);
          expect(
            first.passed,
            `${level.id} now passes. Remove it from NOT_YET_A_PROGRAM. (${known.why})`,
          ).toBe(false);
          return;
        }

        const outcomes = level.seeds.map((seed) => runSource(level, seed));

        for (const outcome of outcomes) {
          expect(outcome.failure, `${level.id} seed ${String(outcome.seed)}`).toBeUndefined();
          expect(outcome.unmet, `${level.id} seed ${String(outcome.seed)}`).toEqual([]);
          expect(outcome.passed, `${level.id} seed ${String(outcome.seed)}`).toBe(true);
        }
      },
    );
  }

  test('every multi-bot level is playable through the player API', { timeout: 120_000 }, () => {
    const broken = MULTI_BOT.filter((id) => NOT_YET_A_PROGRAM[id] !== undefined);
    expect(broken, 'every multi-bot source is a program the player could have written').toEqual([]);

    for (const id of MULTI_BOT) {
      if (NOT_YET_A_PROGRAM[id] !== undefined) continue;
      const level = getLevel(id) as LevelDef;
      for (const seed of level.seeds) {
        expect(runSource(level, seed).passed, `${id} seed ${String(seed)}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Compiling the way the player compiles
// ---------------------------------------------------------------------------

/**
 * `compilePlayerCode` on every reference source, which is the gate a player hits on Run.
 *
 * The sources are written the way a person writes JavaScript — arrow parameters without
 * annotations, a `Map.get` used without a null guard — and under `noImplicitAny` most of them
 * were rejected before a tick was simulated. The player-facing options relax exactly those two
 * flags, so the checks that mean something still mean something: hardware you have not installed
 * is still `Cannot find name`, and a `Dir` that is really a string is still an error.
 */
describe('the player-facing compiler accepts ordinary JavaScript', () => {
  test('all 40 reference sources compile cleanly', { timeout: 120_000 }, async () => {
    const rejected: string[] = [];
    for (const level of LEVELS) {
      const source = (SOLUTIONS[level.id] as ReferenceSolution).source;
      const result = await compilePlayerCode(editor.monaco, playerModel(level.id, source));
      if (!result.ok) rejected.push(`${level.id}: ${result.error.message}`);
      else if (result.js !== compiledSource(level.id).js) {
        /* The suite runs the `transpileModule` emit above, so it is only the real path as long as
           the editor's own emit is the same text. */
        rejected.push(`${level.id}: the editor emits different JavaScript`);
      }
    }
    expect(rejected).toEqual([]);
    expect(LEVELS.length).toBe(40);
  });

  test('all 40 starters compile cleanly', { timeout: 120_000 }, async () => {
    const rejected: string[] = [];
    for (const level of LEVELS) {
      const result = await compilePlayerCode(editor.monaco, playerModel(level.id, level.starter));
      if (!result.ok) rejected.push(`${level.id}: ${result.error.message}`);
    }
    expect(rejected).toEqual([]);
  });

  test('an untyped arrow parameter is not an error', async () => {
    const source = 'const doubled = [1, 2, 3].map((n) => n * 2);\nprint(String(doubled.length));\n';
    const result = await compilePlayerCode(editor.monaco, playerModel('w1-02', source));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diagnostics).toEqual([]);
  });

  test('the library is judged by the same standard, being player-authored too', async () => {
    configurePlayerLanguage(editor.monaco, { levelId: 'w4-01' });
    const lib = editor.model(
      LIB_FILE_PATH,
      'export function firstOpen(views, pick) {\n  return views.find((v) => pick(v)) || null;\n}\n',
    );
    const result = await compileLibrary(editor.monaco, lib);
    expect(result.ok ? [] : [result.error.message]).toEqual([]);
    if (result.ok) expect(result.exports).toContain('firstOpen');
  });

  test('hardware the level has not installed is still TS2304', async () => {
    const result = await compilePlayerCode(editor.monaco, playerModel('w1-01', 'scan();'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(2304);
    expect(result.error.message).toContain("Cannot find name 'scan'");
  });

  test('a wrong argument type is still an error', async () => {
    const result = await compilePlayerCode(editor.monaco, playerModel('w1-01', 'move("north");'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('not assignable');
  });

  test('a misspelled API name is still an error', async () => {
    const result = await compilePlayerCode(editor.monaco, playerModel('w2-01', 'scann();'));
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The whole path, transport and all
// ---------------------------------------------------------------------------

/**
 * A `Worker` that runs the real handler in-process.
 *
 * Vitest has no `Worker` that can load `sim.worker.ts`, and the `postMessage` hop is the one part
 * of the path with nothing in it. Everything below it — the request envelope, `serveRunRequest`,
 * the per-seed runs, the aggregate verdict — is the real code.
 */
class InProcessWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: unknown): void {
    const { requestId, request } = message as WorkerRequestMessage;
    const response = serveRunRequest(request);
    queueMicrotask(() => {
      this.onmessage?.({ data: { type: 'result', requestId, response } } as MessageEvent);
    });
  }

  terminate(): void {
    this.onmessage = null;
  }
}

async function runThroughRunner(level: LevelDef): Promise<RunResponse> {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  const { js, lineMap } = compiledSource(level.id);
  const runner = new Runner({ createWorker: () => new InProcessWorker(), timeoutMs: 120_000 });
  const request: RunRequest = {
    code: solution.source,
    js,
    lineMap,
    levelId: level.id,
    seeds: level.seeds,
  };
  try {
    return await runner.run(request);
  } finally {
    runner.dispose();
  }
}

describe('through Runner, the worker protocol and the bindings', () => {
  for (const id of MULTI_BOT) {
    if (NOT_YET_A_PROGRAM[id] !== undefined) continue;

    test(`${id} comes back passed`, { timeout: 120_000 }, async () => {
      const level = getLevel(id) as LevelDef;
      const response = await runThroughRunner(level);

      expect(response.ok, id).toBe(true);
      if (!response.ok) return;
      expect(response.failedSeed, id).toBeUndefined();
      expect(response.verdict.passed, id).toBe(true);
      expect(response.results.map((result) => result.seed)).toEqual(level.seeds);
      expect(response.trace.endTick).toBeGreaterThan(0);
      expect(response.verdict.stats.ticks).toBeLessThanOrEqual(level.par.ticks);
    });
  }

  test('a single-bot level still comes back the same way', async () => {
    const level = getLevel('w1-01') as LevelDef;
    const response = await runThroughRunner(level);
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.verdict.passed).toBe(true);
  });
});
