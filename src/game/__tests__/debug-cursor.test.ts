import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventOrigin, Trace, TraceEvent } from '../../engine/index.ts';
import { getLevel } from '../../levels/index.ts';
import type { RunResponse } from '../../runtime/protocol.ts';
import type { RunSubmission, RunnerPort } from '../ports.ts';
import { FakeRunner } from '../ports.ts';
import { emptySave } from '../save.ts';
import {
  DEBUG_TIMEOUT_MS,
  firstEventFromLine,
  resolveEventCursor,
  stepEventCursor,
  traceIsAttributed,
  useGame,
} from '../store.ts';

const WORLD = (getLevel('w1-01') as NonNullable<ReturnType<typeof getLevel>>).build(1);

interface Sketch {
  t: number;
  kind: string;
  origin?: EventOrigin;
}

// The cursor only ever reads `t`, `kind` and `origin` off an event, so a sketch of the shape
// says what a real run would without burying the tick layout under a program.
function traceOf(sketch: readonly Sketch[]): Trace {
  return {
    initialWorld: WORLD,
    events: sketch as unknown as TraceEvent[],
    keyframes: [],
    endTick: sketch.reduce((high, event) => Math.max(high, event.t), 0),
  };
}

const AT_ONE_TICK = traceOf([
  { t: 0, kind: 'spawn' },
  { t: 4, kind: 'move', origin: { file: 'program', line: 3 } },
  { t: 4, kind: 'sense' },
  { t: 4, kind: 'mark', origin: { file: 'lib', line: 9 } },
  { t: 7, kind: 'move', origin: { file: 'program', line: 3 } },
]);

describe('several events share a tick, so the tick cannot say which one is being read', () => {
  it('walks every event on the shared tick instead of jumping the whole tick', () => {
    const walked: number[] = [];
    let held: number | null = null;
    let tick = 0;
    for (let i = 0; i < 4; i++) {
      const next = stepEventCursor(AT_ONE_TICK, tick, held, 1);
      if (next === null) break;
      walked.push(next);
      held = next;
      tick = (AT_ONE_TICK.events[next] as TraceEvent).t;
    }

    expect(walked).toEqual([1, 2, 3, 4]);
  });

  it('steps back through the same three without leaving the tick early', () => {
    const tick = 4;
    expect(stepEventCursor(AT_ONE_TICK, tick, 3, -1)).toBe(2);
    expect(stepEventCursor(AT_ONE_TICK, tick, 2, -1)).toBe(1);
    expect(stepEventCursor(AT_ONE_TICK, tick, 1, -1)).toBe(0);
  });

  it('reads the last event on the tick when it is holding no index at all', () => {
    expect(resolveEventCursor(AT_ONE_TICK, 4, null)).toBe(3);
    expect(stepEventCursor(AT_ONE_TICK, 4, null, 1)).toBe(4);
  });
});

describe('stepping past either end reports that there is nothing there', () => {
  it('has no earlier event before the first', () => {
    expect(stepEventCursor(AT_ONE_TICK, 0, 0, -1)).toBeNull();
  });

  it('has no later event after the last', () => {
    expect(stepEventCursor(AT_ONE_TICK, 7, 4, 1)).toBeNull();
  });

  it('has nothing to step to in a trace that recorded no events', () => {
    const empty = traceOf([]);
    expect(stepEventCursor(empty, 0, null, 1)).toBeNull();
    expect(stepEventCursor(empty, 0, null, -1)).toBeNull();
    expect(resolveEventCursor(empty, 0, null)).toBeNull();
  });

  it('reads nothing before the first event rather than reading the first one early', () => {
    const later = traceOf([{ t: 5, kind: 'move' }]);
    expect(resolveEventCursor(later, 0, null)).toBeNull();
    expect(stepEventCursor(later, 0, null, 1)).toBe(0);
  });
});

describe('a scrub moves the tick out from under the cursor and the cursor follows', () => {
  it('drops a held index the tick no longer names an event at', () => {
    expect(resolveEventCursor(AT_ONE_TICK, 4, 1)).toBe(1);
    expect(resolveEventCursor(AT_ONE_TICK, 7, 1)).toBe(4);
  });

  it('derives from the tick alone while playback runs it between events', () => {
    expect(resolveEventCursor(AT_ONE_TICK, 5.5, 1)).toBe(3);
    expect(resolveEventCursor(AT_ONE_TICK, 6.25, 3)).toBe(3);
  });

  it('refuses an index that is out of the trace entirely', () => {
    expect(resolveEventCursor(AT_ONE_TICK, 4, 99)).toBe(3);
    expect(resolveEventCursor(AT_ONE_TICK, 4, -3)).toBe(3);
  });
});

describe('the reverse lookup answers with the first event a line raised', () => {
  it('finds the first of the two events that came from the same line', () => {
    expect(firstEventFromLine(AT_ONE_TICK, 'program', 3)).toBe(1);
  });

  it('keeps the two files apart', () => {
    expect(firstEventFromLine(AT_ONE_TICK, 'lib', 9)).toBe(3);
    expect(firstEventFromLine(AT_ONE_TICK, 'program', 9)).toBeNull();
    expect(firstEventFromLine(AT_ONE_TICK, 'lib', 3)).toBeNull();
  });

  it('says nothing came from a line rather than picking a neighbour', () => {
    expect(firstEventFromLine(AT_ONE_TICK, 'program', 4)).toBeNull();
  });
});

describe('an event with no origin is never given one', () => {
  it('leaves an unattributed event unattributed', () => {
    expect(AT_ONE_TICK.events[2]?.origin).toBeUndefined();
  });

  it('knows an attributed trace from one that recorded no lines', () => {
    expect(traceIsAttributed(AT_ONE_TICK)).toBe(true);
    expect(traceIsAttributed(traceOf([{ t: 0, kind: 'move' }]))).toBe(false);
  });
});

class ScriptedRunner implements RunnerPort {
  readonly requests: RunSubmission[] = [];
  private readonly pending: ((response: RunResponse) => void)[] = [];

  prepare(): void {}
  run(request: RunSubmission): Promise<RunResponse> {
    this.requests.push(request);
    return new Promise((resolve) => this.pending.push(resolve));
  }
  cancel(): void {}
  dispose(): void {}
}

function rest(): void {
  useGame.setState({
    save: emptySave(),
    runState: 'idle',
    runToken: 0,
    runMode: null,
    previewState: 'idle',
    trace: null,
    verdict: null,
    showResults: false,
    eventCursor: null,
    debugNote: null,
    tick: 0,
    endTick: 0,
    console: [],
  });
}

afterEach(() => {
  rest();
  useGame.getState().openLevel('w1-01');
});

describe('a debug run is one seed, attributed, and graded by nobody', () => {
  it('asks for one seed with attribution on and the longer budget', () => {
    rest();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel('w1-01');
    const level = getLevel('w1-01');
    runner.requests.length = 0;

    useGame.getState().debugRun();

    const request = runner.requests[0];
    expect(request?.seeds).toEqual([level?.seeds[0]]);
    expect(request?.debug).toBe(true);
    expect(request?.timeoutMs).toBe(DEBUG_TIMEOUT_MS);
  });

  it('records no verdict, no attempt and no result in the save', async () => {
    rest();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');
    // Typing persists the source on its own, so the baseline is taken after the edit: the
    // only thing under test is what the run adds to it.
    useGame.getState().setCode('move(Dir.South);');
    const before = useGame.getState().save;

    useGame.getState().debugRun();
    await vi.waitFor(() => {
      expect(useGame.getState().previewState).toBe('idle');
    });

    const state = useGame.getState();
    expect(state.trace).not.toBeNull();
    expect(state.runMode).toBe('debug');
    expect(state.showResults).toBe(false);
    expect(state.save.stats.runs).toBe(before.stats.runs);
    expect(state.save.stats.fails).toBe(before.stats.fails);
    expect(state.save.levels['w1-01']?.attempts ?? 0).toBe(before.levels['w1-01']?.attempts ?? 0);
    expect(state.save.levels['w1-01']?.medal).toBe(before.levels['w1-01']?.medal);
  });

  it('leaves the board on the first frame instead of playing the run away', async () => {
    rest();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');

    useGame.getState().setCode('move(Dir.South);');
    useGame.getState().debugRun();
    await vi.waitFor(() => {
      expect(useGame.getState().previewState).toBe('idle');
    });

    expect(useGame.getState().tick).toBe(0);
    expect(useGame.getState().playing).toBe(false);
  });
});

describe('the store keeps the cursor and the tick telling the same story', () => {
  function loaded(): void {
    rest();
    useGame.setState({ trace: AT_ONE_TICK, endTick: AT_ONE_TICK.endTick, tick: 0 });
  }

  it('seeks to the event it steps to and holds the index it landed on', () => {
    loaded();
    useGame.getState().stepEvent(1);

    expect(useGame.getState().eventCursor).toBe(1);
    expect(useGame.getState().tick).toBe(4);
  });

  it('walks the rest of a shared tick without the tick moving', () => {
    loaded();
    useGame.getState().stepEvent(1);
    useGame.getState().stepEvent(1);

    expect(useGame.getState().eventCursor).toBe(2);
    expect(useGame.getState().tick).toBe(4);
  });

  it('drops the held index when the player scrubs, so nothing stale is highlighted', () => {
    loaded();
    useGame.getState().stepEvent(1);
    useGame.getState().seek(7);

    expect(useGame.getState().eventCursor).toBeNull();
    expect(resolveEventCursor(AT_ONE_TICK, useGame.getState().tick, null)).toBe(4);
  });

  it('says so at the end rather than moving the board', () => {
    loaded();
    useGame.getState().seek(0);
    useGame.getState().stepEvent(-1);

    expect(useGame.getState().eventCursor).toBeNull();
    expect(useGame.getState().tick).toBe(0);
    expect(useGame.getState().debugNote).toBe('No earlier event.');
  });

  it('jumps to the first event a line raised', () => {
    loaded();
    useGame.getState().seekToLine('lib', 9);

    expect(useGame.getState().eventCursor).toBe(3);
    expect(useGame.getState().tick).toBe(4);
    expect(useGame.getState().debugNote).toBeNull();
  });

  it('refuses to jump anywhere for a line no event came from', () => {
    loaded();
    useGame.getState().seek(4);
    useGame.getState().seekToLine('program', 42);

    expect(useGame.getState().tick).toBe(4);
    expect(useGame.getState().eventCursor).toBeNull();
    expect(useGame.getState().debugNote).toBe('No event came from program line 42.');
  });

  it('blames the run, not the line, when the run recorded no attribution', () => {
    rest();
    const bare = traceOf([{ t: 0, kind: 'move' }]);
    useGame.setState({ trace: bare, endTick: bare.endTick, tick: 0 });
    useGame.getState().seekToLine('program', 1);

    expect(useGame.getState().debugNote).toBe(
      'This run recorded no lines. Dispatch a debug run.',
    );
  });
});
