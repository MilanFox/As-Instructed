import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import type { PrintEvent, TraceEvent } from '../../engine/index.ts';
import { runLevel } from '../../levels/harness.ts';
import { getLevel } from '../../levels/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import { solution as w1_01Solution } from '../../levels/world-1/__solutions__/w1-01.ts';
import { unlockedApiNames } from '../ambient.ts';
import { assertApiComplete } from '../api-bindings.ts';
import { decodeLineMap } from '../sourcemap.ts';
import { runSeed } from '../run-level.ts';

/**
 * The runtime against a real level, with real transpilation.
 *
 * `runSeed` must produce what `src/levels/harness.ts` produces (docs/ENGINE.md §2) — a level that
 * is provably solvable in a test but not through the worker would be the worst possible bug to
 * find late.
 */

const LEVEL = getLevel('w1-01') as LevelDef;
const HARDWARE = unlockedApiNames('w1-01');

function transpile(source: string): { js: string; lineMap: number[] } {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
    },
    fileName: 'program.ts',
  });
  return {
    js: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '\n'),
    lineMap: decodeLineMap(output.sourceMapText ?? ''),
  };
}

function run(
  source: string,
  options: { hardware?: readonly string[]; maxTicks?: number; maxOps?: number } = {},
) {
  const { js, lineMap } = transpile(source);
  return runSeed({
    level: LEVEL,
    seed: LEVEL.seeds[0] ?? 1,
    js,
    lineMap,
    source,
    unlockedHardware: options.hardware ?? HARDWARE,
    ...(options.maxTicks !== undefined ? { maxTicks: options.maxTicks } : {}),
    ...(options.maxOps !== undefined ? { maxOps: options.maxOps } : {}),
  });
}

describe('startup checks', () => {
  test('every function in the spec has an implementation', () => {
    expect(() => assertApiComplete()).not.toThrow();
  });
});

describe('running the reference solution', () => {
  test('passes, and agrees with the level harness tick for tick', () => {
    const viaRuntime = run(w1_01Solution.source);
    const viaHarness = runLevel(LEVEL, LEVEL.seeds[0] ?? 1, (sim, botId) =>
      w1_01Solution.run(sim, botId),
    );

    expect(viaRuntime.result.passed).toBe(true);
    expect(viaRuntime.result.failure).toBeUndefined();
    expect(viaRuntime.result.ticks).toBe(viaHarness.ticks);
    expect(viaRuntime.result.ticks).toBeLessThanOrEqual(LEVEL.par.ticks);
    expect(viaRuntime.trace.events.length).toBe(viaHarness.trace.events.length);
  });

  test('the objectives come back labelled for the UI', () => {
    const { result } = run(w1_01Solution.source);
    expect(result.objectives).toEqual([
      { id: 'reach-pad', label: 'Park the bot on the landing pad', met: true },
    ]);
  });
});

describe('an unfinished program', () => {
  test('fails on objectives without any runtime failure', () => {
    const { result } = run('move(Dir.East);');
    expect(result.passed).toBe(false);
    expect(result.failure).toBeUndefined();
    expect(result.ticks).toBe(1);
  });
});

describe('locked hardware', () => {
  test('is genuinely absent, and the message names the level that installs it', () => {
    const { result } = run('scan();');
    expect(result.passed).toBe(false);
    expect(result.failure?.kind).toBe('runtime');
    expect(result.failure?.message).toContain('`scan()` is not installed');
    expect(result.failure?.message).toContain('w2-01');
    expect(result.failure?.line).toBe(1);
  });

  test('unlocking it makes the same call work', () => {
    const { result } = run('scan();\nmove(Dir.East);', {
      hardware: unlockedApiNames('w2-01'),
    });
    expect(result.failure).toBeUndefined();
  });
});

describe('budgets', () => {
  test('a loop that acts forever becomes a halt', () => {
    const { result } = run('while (true) {\n  move(Dir.East);\n}', { maxTicks: 50 });
    expect(result.failure?.kind).toBe('halt');
    expect(result.failure?.message).toContain('50-tick');
    expect(result.failure?.line).toBe(2);
  });

  test('a loop that only senses becomes an op limit', () => {
    const { result } = run('while (true) {\n  pos();\n}', { maxOps: 500 });
    expect(result.failure?.kind).toBe('oplimit');
    expect(result.failure?.message).toContain('500');
    expect(result.failure?.line).toBe(2);
  });

  test('the trace is still finished and replayable after a budget failure', () => {
    const { trace } = run('while (true) {\n  move(Dir.East);\n}', { maxTicks: 50 });
    expect(trace.endTick).toBeGreaterThan(0);
    expect(trace.initialWorld).toBeDefined();
    expect(trace.events.length).toBeGreaterThan(0);
  });
});

describe('errors the player made', () => {
  test('are located on the line they wrote, past erased type declarations', () => {
    const source = [
      'interface Route {',
      '  steps: number;',
      '}',
      'const route: Route = { steps: 4 };',
      'const missing: number[] = [];',
      'print(String(missing[0]!.toFixed(route.steps)));',
    ].join('\n');
    const { result } = run(source, { hardware: unlockedApiNames('w1-02') });
    expect(result.failure?.kind).toBe('runtime');
    expect(result.failure?.line).toBe(6);
    expect(result.failure?.message).toContain('undefined');
  });

  test('never leak a raw browser stack', () => {
    const { result } = run('throw new Error("mine");');
    expect(result.failure?.stack).not.toContain('node_modules');
    expect(result.failure?.stack).not.toContain('src/engine');
    /* The column is dropped whenever a line map is in play: an emitted column means nothing. */
    expect(result.failure?.stack).toBe('line 1');
  });
});

describe('the sandbox', () => {
  test('nothing reaches the worker scope', () => {
    for (const name of ['fetch', 'postMessage', 'self', 'importScripts', 'XMLHttpRequest']) {
      const { result } = run(`if (typeof ${name} !== 'undefined') throw new Error('reachable');`);
      expect(result.failure, name).toBeUndefined();
    }
  });

  test('console.log is an alias for print, not an escape hatch', () => {
    const { trace } = run('console.log("hello", 1);', { hardware: unlockedApiNames('w1-02') });
    const prints = trace.events.filter(
      (event: TraceEvent): event is PrintEvent => event.kind === 'print',
    );
    expect(prints.map((event) => event.text)).toEqual(['hello 1']);
  });

  test('ordinary JavaScript state persists for the whole run (DESIGN.md §11 A3)', () => {
    const source = [
      'const log = new Map<number, string>();',
      'for (let i = 0; i < 3; i++) {',
      '  const here = pos();',
      '  log.set(i, `${here.x},${here.y}`);',
      '  move(Dir.East);',
      '}',
      'print(String(log.size));',
    ].join('\n');
    const { trace } = run(source, { hardware: unlockedApiNames('w1-02') });
    const prints = trace.events.filter(
      (event: TraceEvent): event is PrintEvent => event.kind === 'print',
    );
    expect(prints[0]?.text).toBe('3');
  });
});
