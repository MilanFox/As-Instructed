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
    tick: 0,
    endTick: 0,
    playing: false,
    console: [],
    suppressed: 0,
  });
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
    useGame.getState().setCode('move(Dir.East);move(Dir.East);move(Dir.North);move(Dir.East);move(Dir.East);move(Dir.South);');
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
