import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunResponse } from '../../runtime/protocol.ts';
import type { RunSubmission, RunnerPort } from '../ports.ts';
import { FakeRunner } from '../ports.ts';
import { emptySave } from '../save.ts';
import { useGame } from '../store.ts';

/** A runner the test drives by hand, so every branch of the state machine is reachable. */
class ScriptedRunner implements RunnerPort {
  settle: ((response: RunResponse) => void) | null = null;
  cancelled = 0;
  requests: RunSubmission[] = [];

  prepare(): void {}

  run(request: RunSubmission): Promise<RunResponse> {
    this.requests.push(request);
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }
  cancel(): void {
    this.cancelled++;
  }
  dispose(): void {}
}

/** The worst case DESIGN.md §10.6 has to survive: a host that answers nothing and cancels nothing. */
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

/** Six moves onto the pad. The reference solution for w1-01, as the player would type it. */
const W1_01_SOLUTION =
  'move(Dir.North);\nfor (let i = 0; i < 4; i++) move(Dir.East);\nmove(Dir.South);';

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

    runner.settle?.({ ok: false, error: { kind: 'runtime', message: 'too late' } });
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
    first.settle?.({ ok: false, error: { kind: 'runtime', message: 'stale' } });
    await Promise.resolve();
    expect(useGame.getState().verdict).toBe(verdict);
    expect(useGame.getState().failure).toBeNull();
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
  it('files the first close and reports it once', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(W1_01_SOLUTION);

    const state = useGame.getState();
    expect(state.verdict?.passed).toBe(true);
    expect(state.save.achievements['filed']).toBeGreaterThan(0);
    expect(state.freshCommendations).toContain('filed');
    expect(state.freshCommendations).toContain('first-run');
  });

  it('never re-awards a commendation already in the save', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(W1_01_SOLUTION);
    const first = useGame.getState().save.achievements['filed'];

    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().save.achievements['filed']).toBe(first);
    expect(useGame.getState().freshCommendations).not.toContain('filed');
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
    await runOnce(W1_01_SOLUTION);
    expect(useGame.getState().save.stats.passes).toBe(1);

    await runOnce('move(Dir.South);');
    expect(useGame.getState().save.stats.fails).toBe(1);
    expect(useGame.getState().save.stats.passes).toBe(1);
  });

  it('costs a failed run nothing but the attempt', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(W1_01_SOLUTION);
    const won = useGame.getState().save.levels['w1-01'];

    await runOnce('move(Dir.South);');
    const after = useGame.getState().save.levels['w1-01'];
    expect(after?.completed).toBe(true);
    expect(after?.medal).toBe(won?.medal);
    expect(after?.bestTicks).toBe(won?.bestTicks);
    expect(Object.keys(useGame.getState().save.achievements).length).toBeGreaterThan(0);
  });

  it('calls out a personal best only when the record actually moved', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(
      'move(Dir.North);\nfor (let i = 0; i < 4; i++) move(Dir.East);\nwait(3);\nmove(Dir.South);',
    );
    expect(useGame.getState().personalBest).toBeNull();

    await runOnce(W1_01_SOLUTION);
    const best = useGame.getState().personalBest;
    expect(best).not.toBeNull();
    expect(best?.now).toBeLessThan(best?.previous ?? 0);
    expect(useGame.getState().save.achievements['revised-downward']).toBeGreaterThan(0);

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

  it('raises a requisition for undelivered hardware, once', () => {
    reset();
    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().requisition?.hardware).toEqual(['move', 'pos']);

    useGame.getState().signRequisition();
    expect(useGame.getState().requisition).toBeNull();
    expect(useGame.getState().save.seenRequisitions).toEqual(['move', 'pos']);

    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().requisition).toBeNull();
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
  });
});
