import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import type { BotView, TraceEvent } from '../../engine/index.ts';
import { getLevel } from '../../levels/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import { unlockedApiNames } from '../../runtime/ambient.ts';
import { runSeed } from '../../runtime/run-level.ts';
import { decodeLineMap } from '../../runtime/sourcemap.ts';
import { callsAtEvent, callsFromLine, cursorCalls, entityViewsAt } from '../debug-values.ts';

const LEVEL = getLevel('w4-01') as LevelDef;

function debugTrace(source: string) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
    },
    fileName: 'program.ts',
  });
  return runSeed({
    level: LEVEL,
    seed: LEVEL.seeds[0] ?? 1,
    js: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '\n'),
    lineMap: decodeLineMap(output.sourceMapText ?? ''),
    source,
    unlockedHardware: unlockedApiNames('w4-01'),
    debug: true,
  }).trace;
}

const SOURCE = [
  'for (let i = 0; i < 3; i++) {',
  '  look(Dir.East, 2);',
  '  move(Dir.East);',
  '}',
].join('\n');

const trace = debugTrace(SOURCE);
const moveIndex = trace.events.findIndex((event) => event.kind === 'move');
const moveTick = (trace.events[moveIndex] as TraceEvent).t;

describe('calls from a line', () => {
  test('returns every call the line made across the run, in order', () => {
    const looks = callsFromLine(trace, 'program', 2);
    expect(looks.map((call) => call.name)).toEqual(['look', 'look', 'look']);
    expect(looks.map((call) => call.seq)).toEqual(
      [...looks.map((call) => call.seq)].sort((a, b) => a - b),
    );
  });

  test('is the same array on every read', () => {
    expect(callsFromLine(trace, 'program', 3)).toBe(callsFromLine(trace, 'program', 3));
    expect(callsFromLine(trace, 'program', 40)).toBe(callsFromLine(trace, 'lib', 1));
  });
});

describe('calls under the cursor', () => {
  test('are the calls that produced the event the cursor names', () => {
    const calls = cursorCalls({ trace, tick: moveTick, eventCursor: moveIndex });
    expect(calls.map((call) => call.name)).toEqual(['move']);
    expect(calls).toBe(callsAtEvent(trace, moveIndex));
  });

  test('are empty without a trace', () => {
    expect(cursorCalls({ trace: null, tick: 0, eventCursor: null })).toEqual([]);
  });
});

describe('an entity at the cursor', () => {
  const botId = LEVEL.build(LEVEL.seeds[0] ?? 1).bots[0]?.id ?? 0;

  test('shows the bot before and after the move under the cursor', () => {
    const views = entityViewsAt(
      { trace, tick: moveTick, eventCursor: moveIndex },
      { kind: 'bot', id: botId },
    );
    const before = views?.before as BotView;
    const now = views?.now as BotView;
    expect(views?.eventIndex).toBe(moveIndex);
    const move = trace.events[moveIndex];
    if (move?.kind === 'move' && move.ok) expect(now.at).toEqual(move.to);
    expect(before.at).toEqual(move?.kind === 'move' ? move.from : null);
  });

  test('reads a tile as the TileView look() would return', () => {
    const at = trace.initialWorld.bots[0]?.at ?? { x: 0, y: 0 };
    const views = entityViewsAt({ trace, tick: 0, eventCursor: null }, { kind: 'tile', at });
    expect(views?.now).toMatchObject({ at, inBounds: true });
  });

  test('is the same object until the cursor moves', () => {
    const state = { trace, tick: moveTick, eventCursor: moveIndex };
    const first = entityViewsAt(state, { kind: 'bot', id: botId });
    expect(entityViewsAt(state, { kind: 'bot', id: botId })).toBe(first);
    expect(
      entityViewsAt(
        { ...state, eventCursor: null, tick: trace.endTick },
        { kind: 'bot', id: botId },
      ),
    ).not.toBe(first);
  });

  test('is null for a machine the board does not have', () => {
    const views = entityViewsAt(
      { trace, tick: 0, eventCursor: null },
      { kind: 'machine', id: 'nope' },
    );
    expect(views?.now).toBeNull();
  });
});
