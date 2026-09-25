import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import type { ApiCall, PrintEvent, TileView, TraceEvent } from '../../engine/index.ts';
import { Dir, MAX_API_CALLS, TraceBuilder, reviveTrace } from '../../engine/index.ts';
import { getLevel } from '../../levels/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import { unlockedApiNames } from '../ambient.ts';
import { runSeed } from '../run-level.ts';
import { decodeLineMap } from '../sourcemap.ts';

function run(levelId: string, source: string, debug: boolean) {
  const level = getLevel(levelId) as LevelDef;
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
    },
    fileName: 'program.ts',
  });
  return runSeed({
    level,
    seed: level.seeds[0] ?? 1,
    js: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '\n'),
    lineMap: decodeLineMap(output.sourceMapText ?? ''),
    source,
    unlockedHardware: unlockedApiNames(levelId),
    ...(debug ? { debug: true } : {}),
  });
}

function callsNamed(calls: readonly ApiCall[] | undefined, name: string): ApiCall[] {
  return (calls ?? []).filter((call) => call.name === name);
}

function prints(events: readonly TraceEvent[]): PrintEvent[] {
  return events.filter((event): event is PrintEvent => event.kind === 'print');
}

describe('a debug run records every API call', () => {
  test("keeps look()'s TileView[] as the call's return value", () => {
    const { trace } = run('w4-01', 'const seen = look(Dir.East, 3);', true);
    const [look] = callsNamed(trace.calls?.calls, 'look');

    expect(look).toMatchObject({
      name: 'look',
      origin: { file: 'program', line: 1 },
      args: [Dir.East, 3],
      t: 0,
    });
    const returned = look && 'returned' in look.outcome ? look.outcome.returned : null;
    expect(returned).toMatchObject({ $: 'array' });
    const items = (returned as { items: unknown[] }).items;
    expect(items.length).toBeGreaterThan(0);
    const fields = (items[0] as { entries: [string, unknown][] }).entries.map(([key]) => key);
    const tileViewFields: (keyof TileView)[] = ['at', 'inBounds', 'terrain', 'walkable', 'mark'];
    expect(fields).toEqual(expect.arrayContaining(tileViewFields));
  });

  test('points each call at the events it produced', () => {
    const { trace } = run('w1-01', ['move(Dir.East);', 'move(Dir.East);'].join('\n'), true);
    const moves = callsNamed(trace.calls?.calls, 'move');

    expect(moves).toHaveLength(2);
    for (const call of moves) {
      expect(call.events.length).toBeGreaterThan(0);
      expect(call.eventIndex).toBe(call.events[0]);
      expect(trace.events[call.eventIndex]?.kind).toBe('move');
      expect(call.outcome).toEqual({ returned: expect.any(Boolean) });
      expect(call.until).toBeGreaterThan(call.t);
    }
  });

  test('keeps each call of a coalesced sense event with its own values', () => {
    const { trace } = run('w2-01', ['scan();', 'scan(Dir.East);'].join('\n'), true);
    const scans = callsNamed(trace.calls?.calls, 'scan');

    expect(scans.map((call) => call.origin?.line)).toEqual([1, 2]);
    expect(scans[0]?.outcome).not.toEqual(scans[1]?.outcome);
    for (const call of scans) expect(trace.events[call.eventIndex]?.kind).toBe('sense');
  });

  test('records a thrown error as the outcome', () => {
    const builder = new TraceBuilder(getLevel('w1-01')!.build(1), undefined, true);
    builder.beginCall('move', 0, 0, ['up']);
    builder.endCall(0, { threw: new TypeError('no such direction') });
    expect(builder.build(0).calls?.calls[0]?.outcome).toEqual({
      threw: { $: 'error', name: 'TypeError', message: 'no such direction' },
    });
  });

  test('stops at the call cap and counts what it dropped', () => {
    const builder = new TraceBuilder(getLevel('w1-01')!.build(1), undefined, true);
    for (let i = 0; i < MAX_API_CALLS + 3; i++) {
      builder.beginCall('pos', 0, 0, []);
      builder.endCall(0, { returned: i });
    }
    const log = builder.build(0).calls;
    expect(log?.calls).toHaveLength(MAX_API_CALLS);
    expect(log?.dropped).toBe(3);
  });

  test('survives the trip through postMessage', () => {
    const { trace } = run('w4-01', 'console.log(look(Dir.East, 2));', true);
    const revived = reviveTrace(structuredClone(trace));
    expect(revived.calls).toEqual(trace.calls);
  });
});

describe('print and console keep the structured value', () => {
  test('console.log({a: 1}) keeps the object next to its text', () => {
    const { trace } = run('w1-01', 'console.log({ a: 1 });', true);
    const [line] = prints(trace.events);

    expect(line?.text).toBe('{"a":1}');
    expect(line?.values).toEqual([{ $: 'object', ctor: null, entries: [['a', 1]], omitted: 0 }]);
    expect(callsNamed(trace.calls?.calls, 'console.log')[0]?.origin).toEqual({
      file: 'program',
      line: 1,
    });
  });

  test('several console arguments stay several values', () => {
    const { trace } = run('w1-01', 'console.log("at", 3, [1, 2]);', true);
    const [line] = prints(trace.events);
    expect(line?.text).toBe('at 3 [1,2]');
    expect(line?.values).toEqual(['at', 3, { $: 'array', items: [1, 2], length: 2, omitted: 0 }]);
  });

  test('print keeps non-finite numbers nested in a value', () => {
    const { trace } = run('w1-01', 'print([Infinity, -Infinity, NaN], { d: Infinity });', false);
    expect(prints(trace.events)[0]?.text).toBe('[Infinity,-Infinity,NaN] {"d":Infinity}');
  });

  test('print(value) keeps the value as its one argument', () => {
    const { trace } = run('w1-01', 'print(pos());', true);
    expect(prints(trace.events)[0]?.values).toEqual([
      {
        $: 'object',
        ctor: null,
        entries: [
          ['x', expect.any(Number)],
          ['y', expect.any(Number)],
        ],
        omitted: 0,
      },
    ]);
  });
});

describe('a run without the debug flag', () => {
  test('records no calls and no print values', () => {
    const source = ['console.log({ a: 1 });', 'print(look(Dir.East, 2));', 'move(Dir.East);'].join(
      '\n',
    );
    const { trace } = run('w4-01', source, false);
    expect(trace.calls).toBeUndefined();
    expect(prints(trace.events).every((event) => event.values === undefined)).toBe(true);
    expect(JSON.stringify(trace)).not.toContain('"$"');
  });
});
