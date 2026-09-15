import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunResponse } from '../../runtime/protocol.ts';
import type { RunSubmission, RunnerPort } from '../ports.ts';
import { FakeRunner } from '../ports.ts';
import type { Trace } from '../../engine/index.ts';
import { Medal } from '../../engine/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import { campaignOrder, getLevel } from '../../levels/index.ts';
import type { SaveFile } from '../save.ts';
import { emptyProgress, emptySave } from '../save.ts';
import type { GameState } from '../store.ts';
import {
  LEVELS_OPENED_BY_A_CLOSE,
  earnsSeedSurvey,
  isLevelUnlocked,
  surveyTransition,
  useGame,
} from '../store.ts';

class ScriptedRunner implements RunnerPort {
  private readonly pending: {
    settle: (response: RunResponse) => void;
    fail: (error: unknown) => void;
  }[] = [];
  cancelled = 0;
  requests: RunSubmission[] = [];

  prepare(): void {}

  run(request: RunSubmission): Promise<RunResponse> {
    this.requests.push(request);
    return new Promise((resolve, reject) => {
      this.pending.push({ settle: resolve, fail: reject });
    });
  }
  settle(index: number, response: RunResponse): void {
    this.pending[index]?.settle(response);
  }
  fail(index: number, error: unknown): void {
    this.pending[index]?.fail(error);
  }
  cancel(): void {
    this.cancelled++;
  }
  dispose(): void {}
}

class WedgedRunner implements RunnerPort {
  prepare(): void {}
  run(): Promise<RunResponse> {
    return new Promise<RunResponse>(() => {});
  }
  cancel(): void {
    throw new Error('the worker is not responding');
  }
  dispose(): void {}
}

function reset(): void {
  useGame.setState({
    save: emptySave(),
    runState: 'idle',
    runToken: 0,
    runMode: null,
    previewState: 'idle',
    trace: null,
    verdict: null,
    seedResults: [],
    failure: null,
    showResults: false,
    resultId: 0,
    failureCursor: 0,
    freshCommendations: [],
    personalBest: null,
    requisition: null,
    tick: 0,
    endTick: 0,
    playing: false,
    console: [],
    suppressed: 0,
  });
}

// openLevel refuses a work order the save has not opened, so a fixture that starts past the
// first one closes whichever close opens it.
function unlock(levelId: string): void {
  const order = campaignOrder();
  const index = order.findIndex((level) => level.id === levelId);
  const opener = index < 0 ? undefined : order[Math.max(0, index - LEVELS_OPENED_BY_A_CLOSE)];
  const save = useGame.getState().save;
  if (!opener || isLevelUnlocked(save, levelId)) return;
  useGame.setState({
    save: {
      ...save,
      levels: { ...save.levels, [opener.id]: { ...emptyProgress(), completed: true } },
    },
  });
}

function pickUp(levelId: string): void {
  unlock(levelId);
  useGame.getState().openLevel(levelId);
}

const W1_01_ROUTE = [
  'move(Dir.East);',
  'move(Dir.North);',
  'move(Dir.East);',
  'move(Dir.East);',
  'move(Dir.South);',
  'for (let i = 0; i < 19; i++) move(Dir.East);',
  'for (let i = 0; i < 5; i++) move(Dir.South);',
  'for (let i = 0; i < 22; i++) move(Dir.West);',
  'for (let i = 0; i < 5; i++) move(Dir.South);',
  'for (let i = 0; i < 22; i++) move(Dir.East);',
];

const W1_01_SOLUTION = W1_01_ROUTE.join('\n');

// Five rows is odd, so a row-by-row snake ends against the far wall: gold and the star.
const W1_03_SNAKE = [
  'function sweep(dir) { while (canMove(dir)) move(dir); }',
  'function flip(dir) { return dir === Dir.East ? Dir.West : Dir.East; }',
  'function snake(climb) {',
  '  let heading = Dir.East;',
  '  sweep(heading);',
  '  while (canMove(climb)) { move(climb); heading = flip(heading); sweep(heading); }',
  '}',
  'snake(Dir.South);',
  'snake(Dir.North);',
].join('\n');

const W1_01_SLOWER = [...W1_01_ROUTE.slice(0, 5), 'wait(3);', ...W1_01_ROUTE.slice(5)].join('\n');

async function runOnce(code: string): Promise<void> {
  useGame.getState().setCode(code);
  useGame.getState().run();
  await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));
}

afterEach(() => {
  vi.useRealTimers();
  reset();
});

describe('run state machine', () => {
  it('starts idle on the first level', () => {
    reset();
    const state = useGame.getState();
    expect(state.runState).toBe('idle');
    expect(state.currentLevelId).toBe('w1-01');
    expect(state.code.length).toBeGreaterThan(0);
  });

  it('goes running, then idle with a trace and a verdict', async () => {
    reset();
    const runner = new FakeRunner({ latencyMs: 0 });
    useGame.getState().attachRunner(runner);
    useGame.getState().setCode('move(Dir.East);\nmove(Dir.North);');

    useGame.getState().run();
    expect(useGame.getState().runState).toBe('running');

    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));
    const state = useGame.getState();
    expect(state.trace).not.toBeNull();
    expect(state.verdict).not.toBeNull();
    expect(state.endTick).toBeGreaterThan(0);
    expect(state.showResults).toBe(true);
  });

  it('cancel returns to idle immediately and discards the late answer', async () => {
    reset();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);

    useGame.getState().run();
    expect(useGame.getState().runState).toBe('running');

    useGame.getState().cancel();
    expect(useGame.getState().runState).toBe('idle');
    expect(runner.cancelled).toBe(1);

    runner.settle(0, { ok: false, error: { kind: 'runtime', message: 'too late' } });
    await Promise.resolve();
    await Promise.resolve();

    expect(useGame.getState().runState).toBe('idle');
    expect(useGame.getState().failure).toBeNull();
    expect(useGame.getState().showResults).toBe(false);
  });

  it('a run that never returns is cancellable even when cancel itself throws', () => {
    reset();
    useGame.getState().attachRunner(new WedgedRunner());

    useGame.getState().run();
    expect(useGame.getState().runState).toBe('running');

    expect(() => useGame.getState().cancel()).not.toThrow();
    expect(useGame.getState().runState).toBe('idle');
  });

  it('a run that never returns still ends, via the shell watchdog', async () => {
    reset();
    vi.useFakeTimers();
    useGame.getState().attachRunner(new WedgedRunner());

    useGame.getState().run();
    expect(useGame.getState().runState).toBe('running');

    await vi.advanceTimersByTimeAsync(20_000);

    const state = useGame.getState();
    expect(state.runState).toBe('idle');
    expect(state.failure?.kind).toBe('timeout');
    expect(state.failure?.message).toContain('did not halt');
  });

  it('the Run button re-arms after a cancel', async () => {
    reset();
    const wedged = new WedgedRunner();
    useGame.getState().attachRunner(wedged);
    useGame.getState().run();
    useGame.getState().cancel();

    const runner = new FakeRunner({ latencyMs: 0 });
    useGame.getState().attachRunner(runner);
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));
    expect(useGame.getState().verdict).not.toBeNull();
  });

  it('pressing Run while running is a cancel', () => {
    reset();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().run();
    useGame.getState().run();
    expect(useGame.getState().runState).toBe('idle');
    expect(runner.cancelled).toBe(1);
  });

  it('a superseded run does not overwrite the newer one', async () => {
    reset();
    const first = new ScriptedRunner();
    useGame.getState().attachRunner(first);
    useGame.getState().run();

    useGame.getState().cancel();
    const second = new FakeRunner({ latencyMs: 0 });
    useGame.getState().attachRunner(second);
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().verdict).not.toBeNull());

    const verdict = useGame.getState().verdict;
    first.settle(0, { ok: false, error: { kind: 'runtime', message: 'stale' } });
    await Promise.resolve();
    expect(useGame.getState().verdict).toBe(verdict);
    expect(useGame.getState().failure).toBeNull();
  });
});

describe('preview', () => {
  const level = getLevel('w1-02');

  async function previewOnce(code: string): Promise<void> {
    useGame.getState().setCode(code);
    useGame.getState().preview();
    await vi.waitFor(() => expect(useGame.getState().previewState).toBe('idle'));
  }

  afterEach(() => {
    useGame.getState().openLevel('w1-01');
  });

  it("runs against the level's first seed only, not its full schedule", () => {
    reset();
    expect(level?.seeds.length ?? 0).toBeGreaterThan(1);
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    pickUp('w1-02');

    useGame.getState().preview();

    expect(runner.requests[0]?.seeds).toEqual([level?.seeds[0]]);
    useGame.getState().resetPreview();
  });

  it('populates trace and verdict but never opens the report or touches the save', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    const runsBefore = useGame.getState().save.stats.runs;

    await previewOnce('move(Dir.South);');

    const state = useGame.getState();
    expect(state.trace).not.toBeNull();
    expect(state.verdict).not.toBeNull();
    expect(state.runMode).toBe('preview');
    expect(state.runState).toBe('idle');
    expect(state.showResults).toBe(false);
    expect(state.save.stats.runs).toBe(runsBefore);
    expect(state.save.levels['w1-02']?.attempts ?? 0).toBe(0);
  });

  it('resetPreview clears the loaded run without touching the code or the save', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    await previewOnce('move(Dir.South);');
    const code = useGame.getState().code;
    const save = useGame.getState().save;

    useGame.getState().resetPreview();

    const state = useGame.getState();
    expect(state.trace).toBeNull();
    expect(state.verdict).toBeNull();
    expect(state.tick).toBe(0);
    expect(state.endTick).toBe(0);
    expect(state.runMode).toBeNull();
    expect(state.code).toBe(code);
    expect(state.save).toBe(save);
  });

  it('editing the code after a preview clears the stale trace, quietly', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    await previewOnce('move(Dir.South);');
    expect(useGame.getState().trace).not.toBeNull();

    useGame.getState().setCode('move(Dir.South);\nmove(Dir.East);');

    const state = useGame.getState();
    expect(state.trace).toBeNull();
    expect(state.verdict).toBeNull();
    expect(state.runMode).toBeNull();
    expect(state.code).toBe('move(Dir.South);\nmove(Dir.East);');
  });

  it('setCode leaves a loaded trace alone when the code has not actually changed', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    await previewOnce('move(Dir.South);');
    const trace = useGame.getState().trace;

    useGame.getState().setCode('move(Dir.South);');

    expect(useGame.getState().trace).toBe(trace);
  });

  it('togglePlay with no trace loaded starts a preview rather than doing nothing', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    useGame.getState().setCode('move(Dir.South);');
    expect(useGame.getState().trace).toBeNull();

    useGame.getState().togglePlay();
    expect(useGame.getState().previewState).toBe('running');

    await vi.waitFor(() => expect(useGame.getState().previewState).toBe('idle'));
    expect(useGame.getState().trace).not.toBeNull();
  });

  it('does not disturb a dispatch already recorded on the same work order', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-01');
    await runOnce(W1_01_SOLUTION);
    const recorded = useGame.getState().save;
    expect(recorded.levels['w1-01']?.completed).toBe(true);

    useGame.getState().preview();
    await vi.waitFor(() => expect(useGame.getState().previewState).toBe('idle'));

    expect(useGame.getState().save).toBe(recorded);
  });
});

describe('an edit primes the transport again', () => {
  // Longer than the store's idle delay, so a single advance covers the debounce and the run.
  const AFTER_THE_TYPING = 1000;

  afterEach(() => {
    useGame.getState().resetPreview();
  });

  it('leaves the scrubber usable once the typing stops, with no dispatch', async () => {
    reset();
    vi.useFakeTimers();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');
    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    useGame.getState().setCode('move(Dir.East);move(Dir.East);move(Dir.North);');
    expect(useGame.getState().trace).toBeNull();
    expect(useGame.getState().endTick).toBe(0);

    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    expect(useGame.getState().trace).not.toBeNull();
    expect(useGame.getState().endTick).toBeGreaterThan(0);

    useGame.getState().step(1);
    expect(useGame.getState().tick).toBe(1);
  });

  it('primes once for a burst of keystrokes, not once per character', async () => {
    reset();
    vi.useFakeTimers();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');
    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    for (const typed of ['m', 'mo', 'mov', 'move']) {
      useGame.getState().setCode(typed);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(runner.requests).toEqual([]);

    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    expect(runner.requests.length).toBe(1);
    expect(runner.requests[0]?.code).toBe('move');
  });

  it('grades nothing and says nothing while it does it', async () => {
    reset();
    vi.useFakeTimers();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');
    useGame.getState().setCode(W1_01_SOLUTION);
    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    const state = useGame.getState();
    expect(state.trace).not.toBeNull();
    expect(state.runMode).toBeNull();
    expect(state.showResults).toBe(false);
    expect(state.console).toEqual([]);
    expect(state.save.levels['w1-01']?.attempts ?? 0).toBe(0);
  });

  it('stands down for a dispatch rather than overwriting it', async () => {
    reset();
    vi.useFakeTimers();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');
    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    useGame.getState().setCode(W1_01_SOLUTION);
    useGame.getState().run();
    await vi.advanceTimersByTimeAsync(AFTER_THE_TYPING);

    const state = useGame.getState();
    expect(state.runMode).toBe('dispatch');
    expect(state.showResults).toBe(true);
    expect(state.verdict).not.toBeNull();
    expect(state.save.levels['w1-01']?.attempts).toBe(1);
  });

  it('empties the log, so no line outlives the program that wrote it', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-01');
    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().console.length).toBeGreaterThan(0);

    useGame.getState().setCode(`${W1_01_SOLUTION}\nwait(1);`);

    expect(useGame.getState().console).toEqual([]);
    expect(useGame.getState().suppressed).toBe(0);
  });
});

describe('progress', () => {
  it('records a pass, its medal and its records', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame
      .getState()
      .setCode(
        'move(Dir.East);move(Dir.East);move(Dir.North);move(Dir.East);move(Dir.East);move(Dir.South);',
      );
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));

    const progress = useGame.getState().save.levels['w1-01'];
    expect(progress?.attempts).toBe(1);
    expect(progress?.code).toContain('move(Dir.East)');
    if (useGame.getState().verdict?.passed) {
      expect(progress?.completed).toBe(true);
      expect(progress?.bestTicks).toBeGreaterThan(0);
    }
  });

  it('keeps the player code even when the run fails', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().setCode('this is not valid javascript at all !!!');
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));

    expect(useGame.getState().failure?.kind).toBe('compile');
    expect(useGame.getState().save.levels['w1-01']?.code).toBe(
      'this is not valid javascript at all !!!',
    );
  });
});

describe('playback', () => {
  it('clamps seeks to the trace', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().setCode('move(Dir.East);move(Dir.East);');
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().endTick).toBeGreaterThan(0));

    const end = useGame.getState().endTick;
    useGame.getState().seek(-50);
    expect(useGame.getState().tick).toBe(0);
    useGame.getState().seek(end + 500);
    expect(useGame.getState().tick).toBe(end);
    useGame.getState().step(-1);
    expect(useGame.getState().tick).toBe(end - 1);
  });
});

describe('rewards', () => {
  it('pays no commendation for an ordinary close', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-01');
    await runOnce(W1_01_SOLUTION);

    const state = useGame.getState();
    expect(state.verdict?.passed).toBe(true);
    expect(state.freshCommendations).toEqual([]);
    expect(state.save.achievements).toEqual({});
  });

  it('notices a comment the player wrote, and not the one the starter shipped', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().save.achievements['left-a-comment']).toBeUndefined();

    await runOnce(`// the long way round\n${W1_01_SOLUTION}`);
    expect(useGame.getState().freshCommendations).toContain('left-a-comment');
  });

  it('notices the diagnostics left in a closing program', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(`print('here');\n${W1_01_SOLUTION}`);

    expect(useGame.getState().verdict?.passed).toBe(true);
    expect(useGame.getState().freshCommendations).toContain('diagnostics-retained');
  });

  it('notices a program with nothing in it, on a run that closed nothing', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce('// TODO\n\n');

    expect(useGame.getState().verdict?.passed).toBe(false);
    expect(useGame.getState().freshCommendations).toContain('empty-dispatch');
  });

  it('notices the same program dispatched twice, and only on the second', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().freshCommendations).not.toContain('resubmitted');

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().freshCommendations).toContain('resubmitted');

    await runOnce(W1_01_SLOWER);
    expect(useGame.getState().save.achievements['resubmitted']).toBeGreaterThan(0);
  });

  it('stamps the first run and never moves it', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));

    await runOnce(W1_01_SOLUTION);
    const started = useGame.getState().save.firstRunAt;
    expect(started).toBeGreaterThan(0);

    await runOnce(W1_01_SLOWER);
    expect(useGame.getState().save.firstRunAt).toBe(started);
    expect(useGame.getState().save.achievements['came-back']).toBeUndefined();
  });

  it('nods at somebody who came back on a later day', async () => {
    reset();
    const yesterday = Date.now() - 36 * 60 * 60 * 1000;
    useGame.setState({ save: { ...emptySave(), firstRunAt: yesterday } });
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().freshCommendations).toContain('came-back');
    expect(useGame.getState().save.firstRunAt).toBe(yesterday);
  });

  it('files the sector award only once the last order in it is closed', async () => {
    reset();
    const world = campaignOrder().filter((level) => level.world === 1);
    const closed = Object.fromEntries(
      world.slice(1).map((level) => [level.id, { ...emptyProgress(), completed: true }]),
    );
    useGame.setState({ save: { ...emptySave(), levels: closed } });
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().freshCommendations).toContain('sector-closed');
    expect(useGame.getState().freshCommendations).not.toContain('site-closed');
  });

  it('files a commendation once and never again', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    for (let attempt = 0; attempt < 3; attempt++) await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().save.achievements['second-look']).toBeUndefined();

    await runOnce(W1_01_SOLUTION);
    const first = useGame.getState().save.achievements['second-look'];
    expect(first).toBeGreaterThan(0);
    expect(useGame.getState().freshCommendations).toContain('second-look');

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().save.achievements['second-look']).toBe(first);
    expect(useGame.getState().freshCommendations).not.toContain('second-look');
  });

  it('remembers revealed hints across a reload', async () => {
    reset();
    useGame.getState().revealHint(2);
    expect(useGame.getState().save.levels['w1-01']?.hintsRevealed).toBe(2);

    useGame.getState().revealHint(1);
    expect(useGame.getState().save.levels['w1-01']?.hintsRevealed).toBe(2);
  });

  it('tallies a failed run without taking anything away', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-01');
    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().save.stats.passes).toBe(1);

    await runOnce('move(Dir.South);');
    expect(useGame.getState().save.stats.fails).toBe(1);
    expect(useGame.getState().save.stats.passes).toBe(1);
  });

  it('costs a failed run nothing but the attempt', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    for (let attempt = 0; attempt < 4; attempt++) await runOnce(W1_01_SOLUTION);
    const won = useGame.getState().save.levels['w1-01'];
    const earned = { ...useGame.getState().save.achievements };
    expect(Object.keys(earned).length).toBeGreaterThan(0);

    await runOnce('move(Dir.South);');
    const after = useGame.getState().save.levels['w1-01'];
    expect(after?.completed).toBe(true);
    expect(after?.medal).toBe(won?.medal);
    expect(after?.bestTicks).toBe(won?.bestTicks);
    expect(useGame.getState().save.achievements).toEqual(earned);
  });

  it('calls out a personal best only when the record actually moved', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(W1_01_SLOWER);
    expect(useGame.getState().personalBest).toBeNull();

    await runOnce(W1_01_SOLUTION);
    const best = useGame.getState().personalBest;
    expect(best).not.toBeNull();
    expect(best?.now).toBeLessThan(best?.previous ?? 0);

    expect(useGame.getState().save.levels['w1-01']?.medal).toBe('none');

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().personalBest).toBeNull();
  });

  it('rotates the failure line rather than repeating it', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce('move(Dir.South);');
    const first = useGame.getState().failureCursor;
    await runOnce('move(Dir.South);');
    expect(useGame.getState().failureCursor).toBe(first + 1);
  });

  it('raises a requisition for the hardware its own level delivers', () => {
    reset();
    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().requisition?.hardware).toEqual(['move', 'pos', 'print', 'wait']);

    pickUp('w1-02');
    expect(useGame.getState().requisition?.hardware).toEqual(['canMove']);

    pickUp('w1-03');
    expect(useGame.getState().requisition).toBeNull();

    pickUp('w1-02');
    useGame.getState().signRequisition();
    expect(useGame.getState().requisition).toBeNull();

    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().requisition?.hardware).toEqual(['move', 'pos', 'print', 'wait']);
  });

  it('files a review tier once and keeps the ranks in order', () => {
    reset();
    expect(useGame.getState().save.reviewedRanks).toEqual([]);
    useGame.getState().fileReview(5);
    useGame.getState().fileReview(3);
    useGame.getState().fileReview(5);
    expect(useGame.getState().save.reviewedRanks).toEqual([3, 5]);
  });

  it('lets the player turn the ceremony off and have it stay off', () => {
    reset();
    expect(useGame.getState().save.settings.celebrations).toBe(true);
    useGame.getState().setCelebrations(false);
    expect(useGame.getState().save.settings.celebrations).toBe(false);
    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().save.settings.celebrations).toBe(false);
  });

  it('awards a commendation raised outside a run, idempotently', () => {
    reset();
    useGame.getState().award('repository');
    const at = useGame.getState().save.achievements['repository'];
    expect(at).toBeGreaterThan(0);
    useGame.getState().award('repository');
    expect(useGame.getState().save.achievements['repository']).toBe(at);

    useGame.getState().award('no-regressions');
    expect(useGame.getState().save.achievements['no-regressions']).toBeUndefined();
    expect(useGame.getState().freshCommendations).not.toContain('no-regressions');
  });
});

describe('the unlock gate', () => {
  const order = campaignOrder();
  const closing = (...ids: string[]): SaveFile => {
    const save = emptySave();
    for (const id of ids) save.levels[id] = { ...emptyProgress(), completed: true };
    return save;
  };

  it('opens only the first work order on a fresh save', () => {
    const save = emptySave();
    expect(isLevelUnlocked(save, order[0]?.id ?? '')).toBe(true);
    expect(isLevelUnlocked(save, order[1]?.id ?? '')).toBe(false);
  });

  it('opens two more with every close, so being stuck is never the end', () => {
    const save = closing(order[0]?.id ?? '');
    expect(isLevelUnlocked(save, order[1]?.id ?? '')).toBe(true);
    expect(isLevelUnlocked(save, order[2]?.id ?? '')).toBe(true);
    expect(isLevelUnlocked(save, order[3]?.id ?? '')).toBe(false);
  });

  it('lets a player skip the one they are stuck on and bank the next', () => {
    const save = closing(order[0]?.id ?? '', order[2]?.id ?? '');
    expect(isLevelUnlocked(save, order[1]?.id ?? '')).toBe(true);
    expect(isLevelUnlocked(save, order[4]?.id ?? '')).toBe(true);
  });

  it('opens the whole of the next world once a world is closed', () => {
    const worldOne = order.filter((level) => level.world === 1);
    const worldTwo = order.filter((level) => level.world === 2);
    const save = closing(...worldOne.map((level) => level.id));
    for (const level of worldTwo) expect(isLevelUnlocked(save, level.id), level.id).toBe(true);
  });

  it('still refuses a world whose predecessor is not closed', () => {
    const save = closing(order[0]?.id ?? '');
    const worldThree = order.filter((level) => level.world === 3);
    for (const level of worldThree) expect(isLevelUnlocked(save, level.id), level.id).toBe(false);
  });

  it('knows nothing about a work order the campaign never issued', () => {
    expect(isLevelUnlocked(emptySave(), 'w2-03')).toBe(false);
  });
});

const RUN_SHAPED = [
  'runState',
  'runMode',
  'previewState',
  'trace',
  'verdict',
  'surveySeed',
  'heldRun',
  'seedResults',
  'traceSeed',
  'failedSeed',
  'failure',
  'showResults',
  'freshCommendations',
  'personalBest',
  'tick',
  'endTick',
  'console',
  'suppressed',
] as const;

function runShape(state: GameState): Record<string, unknown> {
  return Object.fromEntries(RUN_SHAPED.map((field) => [field, state[field]]));
}

const AT_REST = runShape(useGame.getState());

function afterTheHostAnswers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a freshly opened work order carries no run', () => {
  async function aRunOn(levelId: string): Promise<void> {
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel(levelId);
    await runOnce('move(Dir.South);');
    expect(useGame.getState().trace).not.toBeNull();
    expect(useGame.getState().verdict?.passed).toBe(false);
  }

  it('when the order is picked off the site map', async () => {
    reset();
    await aRunOn('w1-01');
    pickUp('w1-02');
    expect(useGame.getState().currentLevelId).toBe('w1-02');
    expect(runShape(useGame.getState())).toEqual(AT_REST);
  });

  it('when the campaign hands over the next one', async () => {
    reset();
    await aRunOn('w1-01');
    unlock('w1-02');
    useGame.getState().advanceToNextLevel();
    expect(useGame.getState().currentLevelId).toBe('w1-02');
    expect(runShape(useGame.getState())).toEqual(AT_REST);
  });

  it('but the site plan and back is the same order, and keeps it', async () => {
    reset();
    await aRunOn('w1-01');
    const watching = useGame.getState().trace;
    useGame.getState().goto('levels');
    useGame.getState().goto('workspace');
    expect(useGame.getState().trace).toBe(watching);
    pickUp('w1-02');
    expect(runShape(useGame.getState())).toEqual(AT_REST);
  });

  it('when the page is reloaded onto a save that remembers the program', async () => {
    reset();
    const stored = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
      },
    });
    try {
      await aRunOn('w1-01');
      expect(stored.size).toBeGreaterThan(0);

      vi.resetModules();
      const reloaded = (await import('../store.ts')).useGame;
      expect(reloaded.getState().code).toBe('move(Dir.South);');
      expect(runShape(reloaded.getState())).toEqual(AT_REST);
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('and a run walked out on cannot file its halt against the next one', async () => {
    reset();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel('w1-01');
    useGame.getState().run();

    pickUp('w1-02');
    runner.fail(1, new Error('the simulator could not be started'));
    await afterTheHostAnswers();

    expect(runShape(useGame.getState())).toEqual(AT_REST);
    expect(useGame.getState().save.stats).toEqual({ runs: 0, passes: 0, fails: 0 });
  });

  it('and neither can one that answers after the order has gone', async () => {
    reset();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel('w1-01');
    useGame.getState().run();

    pickUp('w1-02');
    const answer = await new FakeRunner({ latencyMs: 0 }).run({
      code: 'move(Dir.South);',
      levelId: 'w1-01',
      seeds: [1],
    });
    runner.settle(1, answer);
    await afterTheHostAnswers();

    expect(runShape(useGame.getState())).toEqual(AT_REST);
    expect(useGame.getState().save.stats).toEqual({ runs: 0, passes: 0, fails: 0 });
  });
});

describe('earnsSeedSurvey', () => {
  const level = getLevel('w1-03') as LevelDef;
  const everyBonus = (level.bonus ?? []).map((objective) => objective.id);

  it('is asked of an order that actually has a bonus to sweep', () => {
    expect(everyBonus.length).toBeGreaterThan(0);
  });

  it('opens on gold with every bonus taken', () => {
    expect(earnsSeedSurvey(level, Medal.Gold, everyBonus)).toBe(true);
  });

  it('stays shut on gold with a bonus still open', () => {
    expect(earnsSeedSurvey(level, Medal.Gold, [])).toBe(false);
  });

  it('stays shut below gold, however clean the sweep', () => {
    expect(earnsSeedSurvey(level, Medal.Silver, everyBonus)).toBe(false);
    expect(earnsSeedSurvey(level, Medal.Bronze, everyBonus)).toBe(false);
    expect(earnsSeedSurvey(level, null, everyBonus)).toBe(false);
  });
});

describe('surveyTransition', () => {
  const trace = { endTick: 40 } as unknown as Trace;
  const watching = { surveySeed: null, heldRun: null, trace, tick: 12, endTick: 40 };
  const empty = { surveySeed: null, heldRun: null, trace: null, tick: 0, endTick: 0 };

  it('takes the run off the board and holds on to it', () => {
    expect(surveyTransition(watching, 4)).toEqual({
      surveySeed: 4,
      heldRun: { trace, tick: 12, endTick: 40 },
      trace: null,
      tick: 0,
      endTick: 0,
    });
  });

  it('leaves the scrubber pointing at nothing while the survey is open', () => {
    const entered = surveyTransition(watching, 4);
    expect(entered.trace).toBeNull();
    expect(entered.endTick).toBe(0);
  });

  it('keeps the first hold while the player walks the schedule', () => {
    const entered = surveyTransition(watching, 4);
    const moved = surveyTransition(entered, 7);
    expect(moved.surveySeed).toBe(7);
    expect(moved.heldRun).toBe(entered.heldRun);
  });

  it('hands the run back on the way out, at the tick it was left on', () => {
    expect(surveyTransition(surveyTransition(watching, 4), null)).toEqual(watching);
  });

  it('holds nothing when there was no run to hold', () => {
    const entered = surveyTransition(empty, 4);
    expect(entered.heldRun).toBeNull();
    expect(surveyTransition(entered, null)).toEqual(empty);
  });
});

describe('the seed survey', () => {
  it('refuses a seed until the order has released the survey', () => {
    reset();
    pickUp('w1-02');
    useGame.getState().showSeed(4);
    expect(useGame.getState().surveySeed).toBeNull();

    useGame.getState().unlockSeeds();
    expect(useGame.getState().save.levels['w1-02']?.seedsUnlocked).toBe(true);
    expect(useGame.getState().surveySeed).toBeNull();

    useGame.getState().showSeed(4);
    expect(useGame.getState().surveySeed).toBe(4);
  });

  it('refuses a seed the work order does not run', () => {
    reset();
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    useGame.getState().showSeed(999);
    expect(useGame.getState().surveySeed).toBeNull();
  });

  it('hands a dispatched run back without dispatching it again', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    await runOnce('move(Dir.East);');
    const dispatched = useGame.getState().trace;
    expect(dispatched).not.toBeNull();

    useGame.getState().showSeed(7);
    expect(useGame.getState().trace).toBeNull();
    expect(useGame.getState().endTick).toBe(0);
    expect(useGame.getState().heldRun?.trace).toBe(dispatched);

    useGame.getState().showSeed(null);
    expect(useGame.getState().trace).toBe(dispatched);
    expect(useGame.getState().endTick).toBeGreaterThan(0);
    expect(useGame.getState().heldRun).toBeNull();
  });

  it('retires the held run when the program it graded is edited', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    await runOnce('move(Dir.East);');
    useGame.getState().showSeed(7);
    expect(useGame.getState().heldRun).not.toBeNull();

    useGame.getState().setCode('move(Dir.West);');
    expect(useGame.getState().heldRun).toBeNull();
    expect(useGame.getState().surveySeed).toBe(7);
  });

  it('runs the seed it is showing when dispatched, and stays on it', async () => {
    reset();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    useGame.getState().showSeed(7);
    runner.requests.length = 0;

    useGame.getState().run();

    expect(runner.requests[0]?.seeds).toEqual([7]);
    expect(useGame.getState().surveySeed).toBe(7);
    expect(useGame.getState().runState).toBe('idle');
    expect(useGame.getState().previewState).toBe('running');
    await Promise.resolve();
  });

  it('grades nothing it ran on one seed', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    useGame.getState().showSeed(7);
    useGame.getState().setCode('move(Dir.East);');
    const before = useGame.getState().save;

    useGame.getState().run();
    await vi.waitFor(() => {
      expect(useGame.getState().previewState).toBe('idle');
    });

    const state = useGame.getState();
    expect(state.trace).not.toBeNull();
    expect(state.traceSeed).toBe(7);
    expect(state.runMode).toBe('preview');
    expect(state.showResults).toBe(false);
    expect(state.save.stats.runs).toBe(before.stats.runs);
    expect(state.save.levels['w1-02']?.attempts ?? 0).toBe(before.levels['w1-02']?.attempts ?? 0);
  });

  it('hands the graded run back untouched when the survey closes', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    await runOnce('move(Dir.East);');
    const dispatched = useGame.getState().trace;

    useGame.getState().showSeed(7);
    useGame.getState().run();
    await vi.waitFor(() => {
      expect(useGame.getState().previewState).toBe('idle');
    });
    expect(useGame.getState().trace).not.toBe(dispatched);

    useGame.getState().showSeed(null);
    expect(useGame.getState().trace).toBe(dispatched);
  });

  it('drops a one-seed run rather than handing it back as the run for another seed', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-02');
    useGame.getState().unlockSeeds();
    useGame.getState().showSeed(7);
    useGame.getState().run();
    await vi.waitFor(() => {
      expect(useGame.getState().previewState).toBe('idle');
    });
    expect(useGame.getState().trace).not.toBeNull();

    const other = getLevel('w1-02')?.seeds.find((seed) => seed !== 7) as number;
    useGame.getState().showSeed(other);

    expect(useGame.getState().heldRun).toBeNull();
    useGame.getState().showSeed(null);
    expect(useGame.getState().trace).toBeNull();
  });

  it('is released by a gold run that leaves no bonus open', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-03');
    await runOnce(W1_03_SNAKE);

    const progress = useGame.getState().save.levels['w1-03'];
    expect(progress?.medal).toBe(Medal.Gold);
    expect(progress?.stars).toEqual((getLevel('w1-03')?.bonus ?? []).map((row) => row.id));
    expect(progress?.seedsUnlocked).toBe(true);
  });

  it('is not released by a run that closed nothing', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    pickUp('w1-03');
    await runOnce('move(Dir.West);');
    expect(useGame.getState().verdict?.passed).toBe(false);
    expect(useGame.getState().save.levels['w1-03']?.seedsUnlocked).toBeUndefined();
  });
});
