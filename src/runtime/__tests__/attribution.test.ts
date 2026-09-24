import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import type { TraceEvent } from '../../engine/index.ts';
import { Dir, Sim, reviveTrace } from '../../engine/index.ts';
import { runLevel } from '../../levels/harness.ts';
import { getLevel } from '../../levels/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import { solution as w1_01Solution } from '../../levels/world-1/__solutions__/w1-01.ts';
import { unlockedApiNames } from '../ambient.ts';
import { buildPlayerScope } from '../api-bindings.ts';
import { captureModuleLocation } from '../modules.ts';
import { decodeLineMap } from '../sourcemap.ts';
import { runSeed, wrapperOffset } from '../run-level.ts';

const LEVEL = getLevel('w1-01') as LevelDef;
const SEED = LEVEL.seeds[0] ?? 1;
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

function run(source: string, options: { debug?: boolean; library?: string } = {}) {
  const program = transpile(source);
  const library = options.library === undefined ? undefined : transpile(options.library);
  return runSeed({
    level: LEVEL,
    seed: SEED,
    js: program.js,
    lineMap: program.lineMap,
    source,
    unlockedHardware: HARDWARE,
    ...(options.debug === true ? { debug: true } : {}),
    ...(library ? { library: { js: library.js, lineMap: library.lineMap } } : {}),
  });
}

function stripped(events: readonly TraceEvent[]): unknown[] {
  return events.map((event) => {
    const copy: Record<string, unknown> = { ...event };
    delete copy['origin'];
    if (event.kind === 'print') {
      delete copy['line'];
      delete copy['values'];
    }
    return copy;
  });
}

function originsOf(events: readonly TraceEvent[], kind: TraceEvent['kind']): unknown[] {
  return events.filter((event) => event.kind === kind).map((event) => event.origin);
}

describe('a run without the debug flag', () => {
  test('emits exactly the trace the level harness does', () => {
    const viaRuntime = run(w1_01Solution.source);
    const viaHarness = runLevel(LEVEL, SEED, (sim, botId) => w1_01Solution.run(sim, botId));

    expect(viaRuntime.trace.events).toEqual(viaHarness.trace.events);
    expect(viaRuntime.trace.keyframes).toEqual(viaHarness.trace.keyframes);
    expect(viaRuntime.trace.endTick).toBe(viaHarness.trace.endTick);
  });

  test('carries no attribution on any event', () => {
    const { trace } = run(w1_01Solution.source);
    expect(trace.events.every((event) => event.origin === undefined)).toBe(true);
  });
});

describe('a run with the debug flag', () => {
  test('is the same trace once the attribution is stripped', () => {
    const plain = run(w1_01Solution.source);
    const debug = run(w1_01Solution.source, { debug: true });

    expect(stripped(debug.trace.events)).toEqual(stripped(plain.trace.events));
    expect(debug.trace.keyframes).toEqual(plain.trace.keyframes);
    expect(debug.trace.endTick).toBe(plain.trace.endTick);
    expect(debug.result).toEqual(plain.result);
    expect(debug.verdict).toEqual(plain.verdict);
  });

  test('keeps the attribution out of the keyframe worlds', () => {
    const { trace } = run(w1_01Solution.source, { debug: true });
    expect(trace.keyframes.length > 0 || trace.events.length > 0).toBe(true);
    expect(JSON.stringify(trace.keyframes)).not.toContain('origin');
    expect(JSON.stringify(trace.initialWorld)).not.toContain('origin');
  });

  test('names the program line that called the verb', () => {
    const source = ['print("first");', 'move(Dir.East);', 'move(Dir.East);'].join('\n');
    const { trace } = run(source, { debug: true });

    expect(originsOf(trace.events, 'move')).toEqual([
      { file: 'program', line: 2 },
      { file: 'program', line: 3 },
    ]);
    expect(originsOf(trace.events, 'print')).toEqual([{ file: 'program', line: 1 }]);
  });

  test('fills in the print line the console panel already reads', () => {
    const source = ['move(Dir.East);', 'print("second");'].join('\n');
    const { trace } = run(source, { debug: true });
    const print = trace.events.find((event) => event.kind === 'print');
    expect(print?.kind === 'print' ? print.line : undefined).toBe(2);
  });

  test('names the library file and line when the call came from a subroutine', () => {
    const library = ['export function hop(): void {', '  move(Dir.East);', '}'].join('\n');
    const source = ["import { hop } from 'lib';", 'print("go");', 'hop();'].join('\n');
    const { trace } = run(source, { debug: true, library });

    expect(originsOf(trace.events, 'move')).toEqual([{ file: 'lib', line: 2 }]);
    expect(originsOf(trace.events, 'print')).toEqual([{ file: 'program', line: 2 }]);
  });

  test('cannot be blinded by a program that throws its own stacks away', () => {
    const limit = Error.stackTraceLimit;
    try {
      const source = ['Error.stackTraceLimit = 0;', 'move(Dir.East);'].join('\n');
      const { result, trace } = run(source, { debug: true });
      expect(result.failure).toBeUndefined();
      expect(originsOf(trace.events, 'move')).toEqual([{ file: 'program', line: 2 }]);
    } finally {
      Error.stackTraceLimit = limit;
    }
  });

  test('survives the trip through postMessage', () => {
    const source = ['move(Dir.East);'].join('\n');
    const { trace } = run(source, { debug: true });
    const revived = reviveTrace(structuredClone(trace));
    expect(originsOf(revived.events, 'move')).toEqual([{ file: 'program', line: 1 }]);
  });
});

describe('a stack with nothing of the player in it', () => {
  test('resolves to nothing rather than throwing', () => {
    expect(captureModuleLocation(wrapperOffset())).toBeUndefined();
  });

  test('leaves the stack machinery exactly as it found it', () => {
    const prepare = (Error as { prepareStackTrace?: unknown }).prepareStackTrace;
    const limit = Error.stackTraceLimit;
    captureModuleLocation(wrapperOffset());
    expect((Error as { prepareStackTrace?: unknown }).prepareStackTrace).toBe(prepare);
    expect(Error.stackTraceLimit).toBe(limit);
  });
});

describe('a locator that cannot answer', () => {
  test('does not stop the verb it was asked about', () => {
    const world = LEVEL.build(SEED);
    const sim = new Sim(world, { costs: LEVEL.costs });
    const botId = world.bots[0]?.id ?? 0;
    const scope = buildPlayerScope(sim, botId, HARDWARE, () => {
      throw new Error('no stack today');
    });

    expect(scope.api['move']?.(Dir.East)).toBe(true);
    const trace = sim.finish();
    expect(originsOf(trace.events, 'move')).toEqual([undefined]);
  });
});
