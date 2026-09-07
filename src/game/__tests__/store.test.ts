import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunResponse } from '../../runtime/protocol.ts';
import type { RunSubmission, RunnerPort } from '../ports.ts';
import { FakeRunner } from '../ports.ts';
import { campaignOrder, getLevel } from '../../levels/index.ts';
import type { SaveFile } from '../save.ts';
import { emptyProgress, emptySave } from '../save.ts';
import type { GameState } from '../store.ts';
import { isLevelUnlocked, useGame } from '../store.ts';

/** A runner the test drives by hand, so every branch of the state machine is reachable. */
class ScriptedRunner implements RunnerPort {
  settle: ((response: RunResponse) => void) | null = null;
  /** The host itself breaking, which is the only thing `RunnerPort.run` is allowed to reject with. */
  fail: ((error: unknown) => void) | null = null;
  cancelled = 0;
  requests: RunSubmission[] = [];

  prepare(): void {}

  run(request: RunSubmission): Promise<RunResponse> {
    this.requests.push(request);
    return new Promise((resolve, reject) => {
      this.settle = resolve;
      this.fail = reject;
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

/** Round the pillar, then a loop per leg. The reference solution for w1-01, as a player types it. */
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

/** The same route with three ticks burned in the middle: still inside the booking, still worse. */
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

/**
 * "Try it" against "commit it" — the whole point of `preview()` is that it can never be mistaken
 * for a dispatch: one seed, no save write, and the report never opens.
 */
describe('preview', () => {
  // A level with more than one seed proves preview picks the first rather than the level's own
  // full schedule; `w1-01`'s single seed could not tell the two apart.
  const level = getLevel('w1-03');

  async function previewOnce(code: string): Promise<void> {
    useGame.getState().setCode(code);
    useGame.getState().preview();
    await vi.waitFor(() => expect(useGame.getState().previewState).toBe('idle'));
  }

  afterEach(() => {
    // Restores the default level so the describes after this one keep seeing 'w1-01' unasked.
    useGame.getState().openLevel('w1-01');
  });

  it("runs against the level's first seed only, not its full schedule", () => {
    reset();
    expect(level?.seeds.length ?? 0).toBeGreaterThan(1);
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel('w1-03');

    useGame.getState().preview();

    expect(runner.requests[0]?.seeds).toEqual([level?.seeds[0]]);
    // Clears the watchdog `ScriptedRunner` will otherwise leave ticking as a real timer.
    useGame.getState().resetPreview();
  });

  it('populates trace and verdict but never opens the report or touches the save', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-03');
    const runsBefore = useGame.getState().save.stats.runs;

    await previewOnce('move(Dir.South);');

    const state = useGame.getState();
    expect(state.trace).not.toBeNull();
    expect(state.verdict).not.toBeNull();
    expect(state.runMode).toBe('preview');
    expect(state.runState).toBe('idle');
    expect(state.showResults).toBe(false);
    expect(state.save.stats.runs).toBe(runsBefore);
    expect(state.save.levels['w1-03']?.attempts ?? 0).toBe(0);
  });

  it('resetPreview clears the loaded run without touching the code or the save', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-03');
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
    useGame.getState().openLevel('w1-03');
    await previewOnce('move(Dir.South);');
    expect(useGame.getState().trace).not.toBeNull();

    useGame.getState().setCode('move(Dir.South);\nmove(Dir.East);');

    const state = useGame.getState();
    expect(state.trace).toBeNull();
    expect(state.verdict).toBeNull();
    expect(state.runMode).toBeNull();
    // Not the player's own Reset — the edit itself did the clearing.
    expect(state.code).toBe('move(Dir.South);\nmove(Dir.East);');
  });

  it('setCode leaves a loaded trace alone when the code has not actually changed', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-03');
    await previewOnce('move(Dir.South);');
    const trace = useGame.getState().trace;

    useGame.getState().setCode('move(Dir.South);');

    expect(useGame.getState().trace).toBe(trace);
  });

  it('togglePlay with no trace loaded starts a preview rather than doing nothing', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w1-03');
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
    await runOnce(W1_01_SOLUTION);
    const recorded = useGame.getState().save;
    expect(recorded.levels['w1-01']?.completed).toBe(true);

    // Previewing the same program that was just dispatched — no `setCode` in between, so the only
    // way `save` could change here is `preview()` itself writing to it, which it must not.
    useGame.getState().preview();
    await vi.waitFor(() => expect(useGame.getState().previewState).toBe('idle'));

    expect(useGame.getState().save).toBe(recorded);
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
  /* Closing a work order is the game working, not an achievement. Most closes pay nothing. */
  it('pays no commendation for an ordinary close', async () => {
    reset();
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    await runOnce(W1_01_SOLUTION);

    const state = useGame.getState();
    expect(state.verdict?.passed).toBe(true);
    expect(state.freshCommendations).toEqual([]);
    expect(state.save.achievements).toEqual({});
  });

  /*
   * The facts below are the ones the store has to assemble itself — from the source, from the
   * trace, and from the save — rather than read off a `Verdict`. `earnedBy` is tested on the
   * snapshot; these prove the snapshot says what happened.
   */
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

  /* One field, written once, and the only thing in the save that survives a session boundary. */
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

  /* A sector is closed when every order in it is, and world 1 is the only one small enough to
     seed by hand without asserting the campaign's shape. */
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

    /*
     * `w1-01` is ungraded (DESIGN.md §7), and this is the test that proves ungrading removed
     * the ladder without removing the mirror: no medal is recorded, while the personal best — the
     * diff both playtesters named the best reward in the game — still fires. It is not a
     * commendation and never was, which is why the cut to five did not touch it.
     */
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

  it('raises a requisition for undelivered hardware, once', () => {
    reset();
    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().requisition?.hardware).toEqual(['move', 'pos', 'print', 'wait']);

    useGame.getState().signRequisition();
    expect(useGame.getState().requisition).toBeNull();
    expect(useGame.getState().save.seenRequisitions).toEqual(['move', 'pos', 'print', 'wait']);

    useGame.getState().openLevel('w1-01');
    expect(useGame.getState().requisition).toBeNull();
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

    /* `src/ui/library.ts` still raises the retired regression-pass award; it must not be stored. */
    useGame.getState().award('no-regressions');
    expect(useGame.getState().save.achievements['no-regressions']).toBeUndefined();
    expect(useGame.getState().freshCommendations).not.toContain('no-regressions');
  });
});

/**
 * DESIGN.md §6. The property that matters is not the number two — it is that no single work
 * order can be the end of a campaign. Being stuck must always leave somewhere else to go.
 */
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
    /* Stuck on order 2, closed order 3. The frontier moved even though 2 is still open. */
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

/**
 * A work order that has not been dispatched in this session wears no verdict.
 *
 * The desk reads this store and nothing else — the terminal's `EDIT / SENT / RETURNED / CLOSED`
 * word, the site feed's `NO TRACE ON FILE`, the objectives rail, the transport and the `OUTPUT`
 * log are one subscription each. So a run left behind after the order that produced it has gone is
 * not a rendering fault on one surface; it is every surface at once, agreeing about something that
 * is not true.
 *
 * "Clean" is not a list restated here. It is the store's own resting shape, read before anything
 * has run, so a field added to the run later is covered without this file being edited.
 */
const RUN_SHAPED = [
  'runState',
  'runMode',
  'previewState',
  'trace',
  'verdict',
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

/**
 * Everything a settled promise still owes.
 *
 * `runState` is already `idle` the moment the order changes, so waiting on it would answer before
 * the abandoned run's own handler has run at all and pass against a store that is about to be
 * written. A turn of the macrotask queue drains every microtask behind it.
 */
function afterTheHostAnswers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a freshly opened work order carries no run', () => {
  /* Every route into an order lands on `openLevel`: the site map's nodes, the Repository's "open
     the order" button through its host, and the campaign advance. Each one is driven here. */
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
    useGame.getState().openLevel('w1-03');
    expect(useGame.getState().currentLevelId).toBe('w1-03');
    expect(runShape(useGame.getState())).toEqual(AT_REST);
  });

  it('when the campaign hands over the next one', async () => {
    reset();
    await aRunOn('w1-01');
    useGame.getState().advanceToNextLevel();
    expect(useGame.getState().currentLevelId).toBe('w1-03');
    expect(runShape(useGame.getState())).toEqual(AT_REST);
  });

  /*
   * The other half of the same rule, and the one a fix must not break: leaving to the site map is
   * not leaving the order. `back to the station` returns a player to the run they were watching,
   * so the trace has to survive the round trip. It stops being theirs when a different order is
   * opened, not when the map is.
   */
  it('but the site plan and back is the same order, and keeps it', async () => {
    reset();
    await aRunOn('w1-01');
    const watching = useGame.getState().trace;
    useGame.getState().goto('levels');
    useGame.getState().goto('workspace');
    expect(useGame.getState().trace).toBe(watching);
    useGame.getState().openLevel('w1-03');
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

  /*
   * The one that was broken. A run the player walked out on is dropped by token everywhere it is
   * read back — except in the rejection arm, where the halt line and the run counters were written
   * before anything asked whose run it was. `RunnerPort.run` rejects only when the host broke, and
   * the host is Monaco's chunk, the library compile and the transpile, so a flaky network is
   * enough: the next order opens with someone else's halt in its `OUTPUT` log and a failure
   * charged to the record for a run nobody watched.
   */
  it('and a run walked out on cannot file its halt against the next one', async () => {
    reset();
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel('w1-01');
    useGame.getState().run();

    useGame.getState().openLevel('w1-03');
    runner.fail?.(new Error('the simulator could not be started'));
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

    useGame.getState().openLevel('w1-03');
    const answer = await new FakeRunner({ latencyMs: 0 }).run({
      code: 'move(Dir.South);',
      levelId: 'w1-01',
      seeds: [1],
    });
    runner.settle?.(answer);
    await afterTheHostAnswers();

    expect(runShape(useGame.getState())).toEqual(AT_REST);
    expect(useGame.getState().save.stats).toEqual({ runs: 0, passes: 0, fails: 0 });
  });
});
