import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ObjectiveReport, Trace, Verdict } from '../../engine/index.ts';
import { Medal } from '../../engine/index.ts';
import type { PerSeedResult, RunResponse } from '../../runtime/protocol.ts';
import type { RunSubmission, RunnerPort } from '../../game/ports.ts';
import type { LevelProgress } from '../../game/save.ts';
import { emptyProgress, emptySave } from '../../game/save.ts';
import { medalForLevel } from '../../game/score.ts';
import { runSeeds, useGame } from '../../game/store.ts';
import { campaignOrder, getLevel } from '../../levels/index.ts';
import { auditSeedsOf } from '../campaign.ts';
import { patchDiscrepancy, withDiscrepancy } from '../discrepancy.ts';
import { emptyLibrary } from '../save.ts';
import { useLibrary } from '../store.ts';
import type { MetaHost } from '../store.ts';
import type { Discrepancy, LibrarySave } from '../types.ts';

class ScriptedRunner implements RunnerPort {
  requests: RunSubmission[] = [];
  prepare(): void {}
  run(request: RunSubmission): Promise<RunResponse> {
    this.requests.push(request);
    return new Promise<RunResponse>(() => {});
  }
  cancel(): void {}
  dispose(): void {}
}

const HOST: MetaHost = {
  runner: { run: () => Promise.resolve({ passed: false, ticks: 0 }) },
  targets: () => [],
  facts: () => [],
  completed: () => [],
  applyMedals: () => {},
  setLevelCode: () => {},
  openLevel: () => {},
};

function discrepancy(levelId: string, seed: number): Discrepancy {
  return { id: `DISCREPANCY 4471-${levelId}`, levelId, seed, raisedAt: 1 };
}

function saveWith(...entries: Discrepancy[]): LibrarySave {
  return entries.reduce<LibrarySave>(withDiscrepancy, { ...emptyLibrary(), unlocked: true });
}

describe('auditSeedsOf', () => {
  test('an open discrepancy puts its layout on its work order', () => {
    const seeds = auditSeedsOf(saveWith(discrepancy('w4-04', 617)));
    expect(seeds['w4-04']?.seeds).toEqual([617]);
    expect(seeds['w4-04']?.note).toContain('617');
  });

  test('the note names the discrepancy, so the console line says what put it there', () => {
    const entry = discrepancy('w4-04', 617);
    expect(auditSeedsOf(saveWith(entry))['w4-04']?.note).toContain(entry.id);
  });

  test('a resolved discrepancy takes its layout back off', () => {
    const save = saveWith(discrepancy('w4-04', 617));
    const resolved = patchDiscrepancy(save, 'DISCREPANCY 4471-w4-04', { resolved: true });
    expect(auditSeedsOf(resolved)).toEqual({});
  });

  test('a closed discrepancy takes its layout back off', () => {
    const save = saveWith(discrepancy('w4-04', 617));
    const closed = patchDiscrepancy(save, 'DISCREPANCY 4471-w4-04', { closed: true });
    expect(auditSeedsOf(closed)).toEqual({});
  });

  test('two on one work order run both layouts', () => {
    const seeds = auditSeedsOf(
      saveWith(discrepancy('w4-04', 617), { ...discrepancy('w4-04', 618), id: 'D2' }),
    );
    expect(seeds['w4-04']?.seeds).toEqual([617, 618]);
  });
});

describe('runSeeds', () => {
  test('the work order own schedule comes first, so its own failures are reported first', () => {
    expect(runSeeds([1, 2, 3], { seeds: [617], note: '' })).toEqual([1, 2, 3, 617]);
  });

  test('a layout already on the schedule is not run twice', () => {
    expect(runSeeds([1, 2, 3], { seeds: [2], note: '' })).toEqual([1, 2, 3]);
  });

  test('no audit is the schedule unchanged', () => {
    expect(runSeeds([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('the wire from the incident list to the run', () => {
  let unattach: (() => void) | null = null;

  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.getState().attach(HOST);
    unattach = () => useLibrary.getState().attach(null);
  });

  afterEach(() => {
    unattach?.();
    useGame.getState().cancel();
    useGame.setState({ auditSeeds: {} });
  });

  test('raising one adds the layout to the campaign schedule; closing it removes it', () => {
    const entry = discrepancy('w4-04', 617);
    useLibrary.setState({ save: withDiscrepancy(useLibrary.getState().save, entry) });
    expect(useGame.getState().auditSeeds['w4-04']?.seeds).toEqual([617]);

    useLibrary.getState().closeDiscrepancy(entry.id);
    expect(useGame.getState().auditSeeds['w4-04']).toBeUndefined();
  });

  test('the layout reaches the runner, behind the work order own seeds', () => {
    const level = campaignOrder()[0];
    if (!level) throw new Error('the campaign is empty');
    const entry = discrepancy(level.id, 4471);
    useLibrary.setState({ save: withDiscrepancy(useLibrary.getState().save, entry) });

    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel(level.id);
    useGame.getState().run();

    expect(runner.requests[1]?.seeds).toEqual([...level.seeds, 4471]);
  });

  test('the console says why the extra layout is there', () => {
    const level = campaignOrder()[0];
    if (!level) throw new Error('the campaign is empty');
    useLibrary.setState({
      save: withDiscrepancy(useLibrary.getState().save, discrepancy(level.id, 4471)),
    });

    useGame.getState().attachRunner(new ScriptedRunner());
    useGame.getState().openLevel(level.id);
    useGame.getState().clearConsole();
    useGame.getState().run();

    const lines = useGame.getState().console.map((line) => line.text);
    expect(lines.some((text) => text.includes('4471'))).toBe(true);
  });

  test('a work order with nothing raised against it runs its own schedule and no more', () => {
    const level = campaignOrder()[0];
    if (!level) throw new Error('the campaign is empty');
    const runner = new ScriptedRunner();
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel(level.id);
    useGame.getState().run();

    expect(runner.requests[1]?.seeds).toEqual([...level.seeds]);
  });
});

const AUDITED = 'w1-03';
const OPENS_AUDITED = 'w1-01';
const AUDIT_LAYOUT = 4471;
const OBJECTIVE = 'inspect-all';
const BONUS = 'one-move-per-tile';
const FAST = 40;
const SLOWEST_ON_SCHEDULE = 48;
const SLOW_OFF_SCHEDULE = 73;

class AnsweringRunner implements RunnerPort {
  requests: RunSubmission[] = [];
  readonly answer: (request: RunSubmission) => RunResponse;

  constructor(answer: (request: RunSubmission) => RunResponse) {
    this.answer = answer;
  }

  prepare(): void {}
  run(request: RunSubmission): Promise<RunResponse> {
    this.requests.push(request);
    return Promise.resolve(this.answer(request));
  }
  cancel(): void {}
  dispose(): void {}
}

function reportOf(id: string, met: boolean): ObjectiveReport {
  return { id, label: id, met };
}

function layoutResult(
  seed: number,
  ticks: number,
  options: { passed?: boolean; bonus?: boolean } = {},
): PerSeedResult {
  const passed = options.passed ?? true;
  return {
    seed,
    passed,
    ticks,
    ops: ticks * 2,
    objectives: [reportOf(OBJECTIVE, passed)],
    bonus: [reportOf(BONUS, options.bonus ?? true)],
  };
}

function folded(results: PerSeedResult[]): RunResponse {
  const worst = (of: (result: PerSeedResult) => number): number =>
    results.reduce((most, result) => Math.max(most, of(result)), 0);
  const everySeed = (
    id: string,
    of: (result: PerSeedResult) => ObjectiveReport[],
  ): ObjectiveReport =>
    results.flatMap(of).find((entry) => entry.id === id && !entry.met) ?? reportOf(id, true);

  const verdict: Verdict = {
    passed: results.every((result) => result.passed),
    objectives: [
      everySeed(OBJECTIVE, (result) => result.objectives),
      everySeed(BONUS, (result) => result.bonus ?? []),
    ],
    stats: {
      ticks: worst((result) => result.ticks),
      ops: worst((result) => result.ops),
      seeds: results.length,
      spend: {},
      senses: {},
    },
  };
  const trace = {
    endTick: verdict.stats.ticks,
    events: [],
    keyframes: [],
  } as unknown as Trace;

  return { ok: true, results, verdict, trace, traceSeed: results[0]?.seed ?? 0 };
}

describe('an audit layout gates the close but never grades it', () => {
  const level = getLevel(AUDITED);

  function onSchedule(): PerSeedResult[] {
    const seeds = level?.seeds ?? [];
    return seeds.map((seed, index) =>
      layoutResult(seed, index === seeds.length - 1 ? SLOWEST_ON_SCHEDULE : FAST),
    );
  }

  async function dispatch(results: PerSeedResult[], stored?: LevelProgress): Promise<void> {
    const runner = new AnsweringRunner((request) =>
      folded(request.seeds.length === results.length ? results : [results[0] as PerSeedResult]),
    );
    useGame.setState({
      save: {
        ...emptySave(),
        levels: {
          [OPENS_AUDITED]: { ...emptyProgress(), completed: true },
          ...(stored ? { [AUDITED]: stored } : {}),
        },
      },
    });
    useGame.getState().attachRunner(runner);
    useGame.getState().openLevel(AUDITED);
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));
  }

  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.getState().attach(HOST);
    useLibrary.setState({
      save: withDiscrepancy(useLibrary.getState().save, discrepancy(AUDITED, AUDIT_LAYOUT)),
    });
  });

  afterEach(() => {
    useLibrary.getState().attach(null);
    useGame.getState().cancel();
    useGame.setState({ auditSeeds: {}, save: emptySave() });
  });

  test('a slow off-schedule layout leaves the medal the schedule earned', async () => {
    if (!level) throw new Error('w1-03 is not in the campaign');
    await dispatch([...onSchedule(), layoutResult(AUDIT_LAYOUT, SLOW_OFF_SCHEDULE)]);

    const state = useGame.getState();
    expect(state.seedResults).toHaveLength(level.seeds.length + 1);
    expect(state.verdict?.stats.ticks).toBe(SLOWEST_ON_SCHEDULE);
    expect(medalForLevel(level, true, state.verdict?.stats.ticks ?? 0)).toBe(Medal.Gold);
    expect(state.save.levels[AUDITED]?.medal).toBe(Medal.Gold);
    expect(state.save.levels[AUDITED]?.bestTicks).toBe(SLOWEST_ON_SCHEDULE);
    expect(state.save.levels[AUDITED]?.stars).toEqual([BONUS]);
  });

  test('the console reports the ticks the schedule spent, not the audit', async () => {
    await dispatch([...onSchedule(), layoutResult(AUDIT_LAYOUT, SLOW_OFF_SCHEDULE)]);

    const closed = useGame.getState().console.filter((line) => line.kind === 'success');
    expect(closed.map((line) => line.text)).toEqual([
      `work order closed — ${String(SLOWEST_ON_SCHEDULE)} ticks`,
    ]);
  });

  test('an off-schedule layout that fails still holds the work order open', async () => {
    await dispatch([
      ...onSchedule(),
      layoutResult(AUDIT_LAYOUT, SLOW_OFF_SCHEDULE, { passed: false }),
    ]);

    const state = useGame.getState();
    expect(state.verdict?.passed).toBe(false);
    expect(state.save.levels[AUDITED]?.completed).toBe(false);
    expect(state.save.levels[AUDITED]?.medal).toBe(Medal.None);
  });

  test('an off-schedule layout that misses the bonus still withholds the star', async () => {
    if (!level) throw new Error('w1-03 is not in the campaign');
    await dispatch([
      ...onSchedule(),
      layoutResult(AUDIT_LAYOUT, SLOW_OFF_SCHEDULE, { bonus: false }),
    ]);

    const state = useGame.getState();
    expect(state.save.levels[AUDITED]?.stars).toEqual([]);
    expect(state.save.levels[AUDITED]?.medal).toBe(Medal.Gold);
  });

  test('a personal best on the schedule is not hidden by a slower audit layout', async () => {
    await dispatch([...onSchedule(), layoutResult(AUDIT_LAYOUT, SLOW_OFF_SCHEDULE)], {
      ...emptyProgress(),
      completed: true,
      medal: Medal.Silver,
      bestTicks: 60,
    });

    expect(useGame.getState().personalBest).toEqual({
      previous: 60,
      now: SLOWEST_ON_SCHEDULE,
    });
  });
});
