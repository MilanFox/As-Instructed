import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from './react-driver.ts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, ...driver.hooks };
});

vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla');
  const vanilla = createStore as unknown as (initialiser: unknown) => {
    subscribe: (notify: () => void) => () => void;
    getState: () => unknown;
  };
  const bind = (initialiser: unknown): unknown => {
    const api = vanilla(initialiser);
    const useBoundStore = (selector: (state: unknown) => unknown = (state) => state): unknown =>
      driver.hooks.useSyncExternalStore(api.subscribe, () => selector(api.getState()));
    return Object.assign(useBoundStore, api);
  };
  return {
    create: (initialiser?: unknown) => (initialiser ? bind(initialiser) : bind),
    createStore,
  };
});

const { useWorkspace } = await import('../workspace/useWorkspace.ts');
const { postRunReport, useReport } = await import('../report.ts');
const { useGame } = await import('../../game/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { getLevel } = await import('../../levels/index.ts');

const LEVEL = 'w1-03';
const OTHER = 'w1-04';

function finished(levelId: string, passed: boolean, ticks: number): void {
  const level = getLevel(levelId);
  if (!level) throw new Error(`no level ${levelId}`);
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: levelId,
    trace: null,
    traceSeed: null,
    tick: ticks,
    endTick: ticks,
    runMode: 'dispatch',
    runState: 'idle',
    showResults: true,
    resultId: useGame.getState().resultId + 1,
    seedResults: [],
    failure: null,
    freshAchievements: [],
    personalBest: null,
    verdict: {
      passed,
      ticks,
      stats: { ticks, ops: ticks, chars: 0, senses: {}, spend: {} },
      objectives: level.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        met: passed,
      })),
    } as never,
  });
}

function Screen(): ReturnType<typeof useWorkspace> {
  return useWorkspace();
}

function shown(): ReturnType<typeof useWorkspace> {
  driver.reset();
  return Screen();
}

beforeEach(() => {
  useReport.getState().clear();
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: null,
    showResults: false,
    resultId: 0,
    verdict: null,
    trace: null,
    seedResults: [],
    runState: 'idle',
  });
  driver.reset();
});

describe('the sheet shows the run on the board and no other', () => {
  test('a dispatch puts its own verdict on the sheet', () => {
    finished(LEVEL, false, 900);
    postRunReport();

    expect(shown().report?.ticks).toBe(900);
    expect(shown().report?.passed).toBe(false);
  });

  test('a later run replaces the earlier one rather than queueing behind it', () => {
    finished(LEVEL, false, 900);
    postRunReport();
    finished(LEVEL, true, 78);
    postRunReport();

    const report = shown().report;
    expect(report?.ticks).toBe(78);
    expect(report?.passed).toBe(true);
    expect(useReport.getState().report).toBe(report);
  });

  test('and the earlier run is not reachable from anywhere in the UI', () => {
    finished(LEVEL, false, 900);
    postRunReport();
    const stale = useReport.getState().report;
    finished(LEVEL, true, 78);
    postRunReport();

    expect(useReport.getState().report).not.toBe(stale);
    expect(shown().report).not.toBe(stale);
  });

  test('a dispatch in flight takes the previous verdict off the screen', () => {
    finished(LEVEL, false, 900);
    postRunReport();
    useReport.getState().clear();

    expect(shown().report).toBeNull();
  });

  test('a report belonging to another work order never renders as this one', () => {
    finished(LEVEL, true, 78);
    postRunReport();
    useGame.setState({ currentLevelId: OTHER, showResults: false });

    expect(shown().report).toBeNull();
    expect(shown().closePending).toBe(false);
  });

  test('nothing posts a report while the run is still open', () => {
    useGame.setState({ currentLevelId: LEVEL, showResults: false });
    postRunReport();

    expect(useReport.getState().report).toBeNull();
  });
});

describe('the report is this session only', () => {
  test('posting one writes nothing to storage, so a reload cannot resurrect it', () => {
    const writes: string[] = [];
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(key);
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });

    finished(LEVEL, true, 78);
    postRunReport();

    expect(useReport.getState().report).not.toBeNull();
    expect(writes).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('closing a work order', () => {
  test('a pass waits for an acknowledgement before the sheet is readable', () => {
    finished(LEVEL, true, 78);
    postRunReport();

    expect(shown().closePending).toBe(true);

    shown().closeOut();

    expect(shown().closePending).toBe(false);
    expect(shown().report?.passed).toBe(true);
  });

  test('a failure has nothing to acknowledge', () => {
    finished(LEVEL, false, 900);
    postRunReport();

    expect(shown().closePending).toBe(false);
  });

  test('a rerun asks for the acknowledgement again', () => {
    finished(LEVEL, true, 78);
    postRunReport();
    shown().closeOut();
    finished(LEVEL, true, 74);
    postRunReport();

    expect(shown().closePending).toBe(true);
  });
});
