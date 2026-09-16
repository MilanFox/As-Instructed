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

const { ReportSheet } = await import('../workspace/ReportSheet.tsx');
const { snapshotReport } = await import('../report.ts');
const { StructureScreen } = await import('../../meta/ui/StructureScreen.tsx');
const { useGame } = await import('../../game/store.ts');
const { useLibrary } = await import('../../meta/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { emptyLibrary } = await import('../../meta/save.ts');
const { STRUCTURE } = await import('../../meta/copy.ts');
const { Medal } = await import('../../game/score.ts');
const { buildCampaign } = await import('../../game/campaign.ts');
const { reportFor } = await import('../screens/review.ts');

function Results(): unknown {
  const report = snapshotReport(useGame.getState() as never);
  return report ? ReportSheet({ report }) : null;
}

type Props = Record<string, unknown>;

function words(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(words).join(' ');
  const element = node as { type?: unknown; props?: Props };
  const props = element.props;
  if (!props) return '';
  if (typeof element.type === 'function') {
    return words((element.type as (props: Props) => unknown)(props));
  }
  return words(props['children']);
}

function screen(component: () => unknown): string {
  driver.reset();
  return words(component()).replace(/\s+/g, ' ').trim();
}

interface Usage {
  ticks: number;
  calls: Record<string, { calls: number; ticks: number }>;
}

function reportRun(usage: Usage | null, seed = 2): void {
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: 'w1-03',
    trace: null,
    tick: 78,
    showResults: true,
    traceSeed: seed,
    seedResults: [
      { seed: 1, passed: true, ticks: 78, objectives: [], libraryUsage: decoy() },
      {
        seed: 2,
        passed: true,
        ticks: 78,
        objectives: [],
        ...(usage ? { libraryUsage: usage } : {}),
      },
    ] as never,
    verdict: {
      passed: true,
      ticks: 78,
      stats: { ticks: 78, ops: 78, chars: 0, senses: {}, spend: {} },
      objectives: [],
    } as never,
  });
}

function decoy(): Usage {
  return { ticks: 999, calls: { decoyRoutine: { calls: 7, ticks: 999 } } };
}

beforeEach(() => {
  useGame.setState({
    save: emptySave(),
    verdict: null,
    trace: null,
    seedResults: [],
    showResults: false,
  });
  useLibrary.getState().hydrate(null);
  useLibrary.setState({ save: emptyLibrary(), offer: null, notice: null });
  driver.reset();
});

describe('the report says what the Repository did on this run', () => {
  test('the routines counted are the ones that were actually called', () => {
    reportRun({
      ticks: 52,
      calls: {
        pathTo: { calls: 4, ticks: 30 },
        neverCalled: { calls: 0, ticks: 0 },
        step: { calls: 9, ticks: 22 },
      },
    });

    expect(screen(Results)).toContain('2 routines from the Repository, 52 ticks inside them.');
  });

  test('it is the seed the report is describing, not seed one', () => {
    reportRun({ ticks: 52, calls: { pathTo: { calls: 4, ticks: 52 } } });
    const text = screen(Results);

    expect(text).toContain('1 routine from the Repository, 52 ticks inside it.');
    expect(text).not.toContain('999');
  });

  test('a run that linked the library and called nothing says nothing', () => {
    reportRun({ ticks: 0, calls: { pathTo: { calls: 0, ticks: 0 } } });

    expect(screen(Results)).not.toContain('from the Repository');
  });

  test('a run that never linked it says nothing either', () => {
    reportRun(null);

    expect(screen(Results)).not.toContain('from the Repository');
  });

  test('one routine and one tick are written as one of each', () => {
    reportRun({ ticks: 1, calls: { pathTo: { calls: 1, ticks: 1 } } });

    expect(screen(Results)).toContain('1 routine from the Repository, 1 tick inside it.');
  });
});

describe('the line is a fact, not a scoreline', () => {
  function withoutTheLine(text: string): string {
    return text.replace(
      / ?On record Repository \d+ routines? from the Repository, \d+ ticks? inside (?:it|them)\./,
      '',
    );
  }

  test('the report reads exactly the same everywhere else', () => {
    reportRun(null);
    const bare = screen(Results);

    reportRun({
      ticks: 400,
      calls: { pathTo: { calls: 40, ticks: 300 }, step: { calls: 12, ticks: 100 } },
    });
    const used = screen(Results);

    expect(used).not.toBe(bare);
    expect(withoutTheLine(used).replace(/\s+/g, ' ').trim()).toBe(bare);
  });

  test('no medal, no points and no star moved', () => {
    reportRun(null);
    const bare = screen(Results);
    reportRun({ ticks: 400, calls: { pathTo: { calls: 40, ticks: 400 } } });
    const used = screen(Results);

    const scoreline = (text: string): string =>
      /Ticks \d+.*?(?= Seeds )/.exec(text)?.[0] ?? 'no scoreline';

    expect(scoreline(bare)).toMatch(/Points \d/);
    expect(scoreline(used)).toBe(scoreline(bare));
  });
});

function profile(levelId: string, imports: string[], usage: Usage): Record<string, unknown> {
  return {
    levelId,
    key: `key-${levelId}`,
    passed: true,
    ticks: 100,
    medal: Medal.Silver,
    parTicks: 90,
    usage,
    imports,
    at: 1,
  };
}

const LIBRARY_SOURCE = [
  'export function step(back: number): number {',
  '  return back;',
  '}',
  '',
  'export function follow(): void {',
  '  step(-1);',
  '}',
  '',
].join('\n');

const SPEND: Usage = {
  ticks: 50,
  calls: { follow: { calls: 3, ticks: 30 }, step: { calls: 5, ticks: 20 } },
};

function reusedLibrary(): void {
  const save = emptyLibrary();
  save.source = LIBRARY_SOURCE;
  for (const levelId of ['w4-01', 'w4-02', 'w4-03']) {
    (save.profiles as Record<string, unknown>)[levelId] = profile(levelId, ['follow'], SPEND);
  }
  useLibrary.setState({ save });
}

function routine(name: string): { levels: string[]; callCount: number } | undefined {
  return useLibrary
    .getState()
    .structure()
    .functions.find((each) => each.name === name);
}

describe('the Structure tab says how far a routine has travelled', () => {
  test('the column is there and it is about work orders', () => {
    reusedLibrary();

    expect(STRUCTURE.columns.orders).toBe('Work orders');
    expect(screen(StructureScreen)).toContain('Work orders');
  });

  test('the count is the number of work orders that import it', () => {
    reusedLibrary();

    expect(routine('follow')?.levels).toEqual(['w4-01', 'w4-02', 'w4-03']);
    expect(routine('follow')?.callCount).toBe(9);
    expect(screen(StructureScreen)).toMatch(/follow\s+3\s+9\s+90\b/);
  });

  test('a routine no work order imports shows no number rather than a zero', () => {
    reusedLibrary();

    expect(routine('step')?.levels).toEqual([]);
    expect(routine('step')?.callCount).toBe(15);
    expect(screen(StructureScreen)).toMatch(/step\s+—\s+15\s+60\b/);
  });

  test('a fourth work order importing it moves the number', () => {
    reusedLibrary();
    expect(screen(StructureScreen)).toMatch(/follow\s+3\s+9\b/);

    const save = { ...useLibrary.getState().save };
    save.profiles = { ...save.profiles, 'w4-04': profile('w4-04', ['follow'], SPEND) as never };
    useLibrary.setState({ save });

    expect(screen(StructureScreen)).toMatch(/follow\s+4\s+12\b/);
  });
});

describe('reuse pays nothing on any scoreboard', () => {
  function closedCampaign(): void {
    const save = emptySave();
    save.levels['w1-03'] = { completed: true, medal: Medal.Gold, stars: [], attempts: 1 };
    save.levels['w4-01'] = { completed: true, medal: Medal.Bronze, stars: [], attempts: 1 };
    useGame.setState({ save });
  }

  test('the site map totals are the same with a heavily reused Repository as without', () => {
    closedCampaign();
    const bare = buildCampaign(useGame.getState().save);

    reusedLibrary();

    expect(buildCampaign(useGame.getState().save)).toEqual(bare);
  });

  test('and so is the performance grade', () => {
    closedCampaign();
    const bare = reportFor(useGame.getState().save);

    reusedLibrary();

    expect(reportFor(useGame.getState().save)).toEqual(bare);
  });
});
