import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { RunResponse } from '../../runtime/protocol.ts';
import type { RunSubmission, RunnerPort } from '../../game/ports.ts';
import { runSeeds, useGame } from '../../game/store.ts';
import { campaignOrder } from '../../levels/index.ts';
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
