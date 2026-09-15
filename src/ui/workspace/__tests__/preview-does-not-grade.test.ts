import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from '../../__tests__/react-driver.ts';

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

const { useWorkspace } = await import('../useWorkspace.ts');
const { TelemetryPanel } = await import('../TelemetryPanel.tsx');
const { WorkOrderCard } = await import('../WorkOrderCard.tsx');
const { useGame } = await import('../../../game/store.ts');
const { emptySave } = await import('../../../game/save.ts');
const { isGraded } = await import('../../../game/score.ts');
const { campaignOrder } = await import('../../../levels/index.ts');
const { runLevel, runReference } = await import('../../../levels/harness.ts');
const { SOLUTIONS } = await import('../../../levels/__tests__/solutions.ts');

type WorkspaceData = ReturnType<typeof useWorkspace>;
type LevelDef = ReturnType<typeof campaignOrder>[number];
type RunResult = ReturnType<typeof runLevel>;

type Props = Record<string, unknown>;

interface Drawn {
  classes: string[];
  attrs: Props;
  text: string;
  children: Drawn[];
}

function draw(node: unknown): Drawn[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ classes: [], attrs: {}, text: String(node), children: [] }];
  }
  if (Array.isArray(node)) return node.flatMap(draw);
  const element = node as { type?: unknown; props?: Props };
  const props = element.props;
  if (!props) return [];
  const type = element.type;
  if (typeof type === 'function') return draw((type as (props: Props) => unknown)(props));
  if (typeof type !== 'string') return draw(props['children']);
  const children = draw(props['children']);
  return [
    {
      classes: String(props['className'] ?? '')
        .split(/\s+/)
        .filter(Boolean),
      attrs: props,
      text: children
        .map((child) => child.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      children,
    },
  ];
}

function within(nodes: Drawn[], match: (node: Drawn) => boolean): Drawn[] {
  const found: Drawn[] = [];
  const walk = (list: Drawn[]): void => {
    for (const node of list) {
      if (match(node)) found.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

const hasClass =
  (name: string) =>
  (node: Drawn): boolean =>
    node.classes.includes(name);

type RunMode = 'preview' | 'dispatch';

function place(level: LevelDef, run: RunResult, runMode: RunMode): void {
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: level.id,
    trace: run.trace,
    traceSeed: run.seed,
    tick: run.trace.endTick,
    endTick: run.trace.endTick,
    playing: false,
    runState: 'idle',
    previewState: 'idle',
    runMode,
    verdict: run.verdict,
    seedResults: [],
    failure: null,
    freshAchievements: [],
    personalBest: null,
    showResults: false,
  });
}

function useWorkspaceNow(): WorkspaceData {
  driver.reset();
  return useWorkspace();
}

function render(
  component: (props: { workspace: WorkspaceData }) => unknown,
  workspace: WorkspaceData,
): Drawn[] {
  driver.reset();
  return draw(component({ workspace }));
}

const runStateWord = (tree: Drawn[]): string => within(tree, hasClass('run-state'))[0]?.text ?? '';

function statCell(tree: Drawn[], label: string): { value: string; tone: unknown } {
  const cell = within(tree, hasClass('stat-cell')).find(
    (node) => within([node], hasClass('stat-cell__label'))[0]?.text === label,
  );
  const value = within(
    [cell ?? { classes: [], attrs: {}, text: '', children: [] }],
    hasClass('stat-cell__value'),
  )[0];
  return { value: value?.text ?? '', tone: value?.attrs['data-tone'] };
}

const GRADED = campaignOrder().find((level) => isGraded(level)) as LevelDef;
const SEED = GRADED.seeds[0] ?? 1;

// A run that only dawdles: it ends over par, so a dispatch of it really does show the
// over-par tone the preview must not.
const DAWDLED = runLevel(GRADED, SEED, (sim, botId) => {
  sim.wait(botId, GRADED.par.ticks + 1);
});

const SOLVED = runReference(GRADED, SEED, SOLUTIONS[GRADED.id] as never);

describe('a preview does not grade the level', () => {
  test('the run this suite previews is one a dispatch would fail and call over par', () => {
    expect([GRADED.id, DAWDLED.verdict.passed]).toEqual([GRADED.id, false]);
    expect([GRADED.id, DAWDLED.verdict.stats.ticks > GRADED.par.ticks]).toEqual([GRADED.id, true]);
    expect([GRADED.id, SOLVED.verdict.passed]).toEqual([GRADED.id, true]);
  });

  test('the workspace bundle has no verdict on it at all', () => {
    place(GRADED, DAWDLED, 'preview');

    expect(['verdict on the bundle', 'verdict' in useWorkspaceNow()]).toEqual([
      'verdict on the bundle',
      false,
    ]);
  });

  test('a trace left behind by a preview is ungraded', () => {
    place(GRADED, DAWDLED, 'preview');
    const workspace = useWorkspaceNow();

    expect(['grade', workspace.grade]).toEqual(['grade', null]);
    expect(['targets.ticks', workspace.targets.ticks]).toEqual(['targets.ticks', null]);
    expect(['runMode', workspace.runMode]).toEqual(['runMode', 'preview']);
    expect(['trace', workspace.trace !== null]).toEqual(['trace', true]);
  });

  test('the run mode is the only thing that turns that same trace into a grade', () => {
    place(GRADED, DAWDLED, 'preview');
    expect(['before', useWorkspaceNow().grade]).toEqual(['before', null]);

    useGame.setState({ runMode: 'dispatch' });
    const workspace = useWorkspaceNow();

    expect(['grade', workspace.grade]).toEqual(['grade', DAWDLED.verdict]);
    expect(['targets.ticks', workspace.targets.ticks]).toEqual([
      'targets.ticks',
      DAWDLED.verdict.stats.ticks,
    ]);
  });
});

describe('telemetry reads a preview as a preview', () => {
  test('a failing run that was only previewed is not called fail', () => {
    place(GRADED, DAWDLED, 'preview');

    expect(['run state', runStateWord(render(TelemetryPanel, useWorkspaceNow()))]).toEqual([
      'run state',
      'preview',
    ]);
  });

  test('a passing run that was only previewed is not called pass', () => {
    place(GRADED, SOLVED, 'preview');

    expect(['run state', runStateWord(render(TelemetryPanel, useWorkspaceNow()))]).toEqual([
      'run state',
      'preview',
    ]);
  });

  test('the same two runs are called fail and pass once they are dispatched', () => {
    place(GRADED, DAWDLED, 'dispatch');
    expect(['dispatched failure', runStateWord(render(TelemetryPanel, useWorkspaceNow()))]).toEqual(
      ['dispatched failure', 'fail'],
    );

    place(GRADED, SOLVED, 'dispatch');
    expect(['dispatched pass', runStateWord(render(TelemetryPanel, useWorkspaceNow()))]).toEqual([
      'dispatched pass',
      'pass',
    ]);
  });
});

describe('the work order counts no ticks against a preview', () => {
  test('a previewed run over par shows neither a tick count nor the over tone', () => {
    place(GRADED, DAWDLED, 'preview');
    const ticks = statCell(render(WorkOrderCard, useWorkspaceNow()), 'Ticks');

    expect(['ticks readout', ticks.value]).toEqual(['ticks readout', '—']);
    expect(['ticks tone', ticks.tone]).toEqual(['ticks tone', undefined]);
  });

  test('the same run dispatched does show both, so the tone falls out of the ticks alone', () => {
    place(GRADED, DAWDLED, 'dispatch');
    const ticks = statCell(render(WorkOrderCard, useWorkspaceNow()), 'Ticks');

    expect(['ticks readout', ticks.value]).toEqual([
      'ticks readout',
      String(DAWDLED.verdict.stats.ticks),
    ]);
    expect(['ticks tone', ticks.tone]).toEqual(['ticks tone', 'over']);
  });
});

const ROOT = new URL('../', import.meta.url);

const SOURCES = readdirSync(ROOT)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => ({ name, text: readFileSync(new URL(name, ROOT), 'utf8') }));

const SHOWS_THE_GRADE = [
  'TelemetryPanel.tsx',
  'WorkOrderCard.tsx',
  'ObjectiveItem.tsx',
  'TransportDeck.tsx',
  'ReportSheet.tsx',
  'ClosedBanner.tsx',
  'Dossier.tsx',
  'Postings.tsx',
] as const;

describe('nothing in the workspace reaches past the gate', () => {
  test('the suite is reading the files it thinks it is', () => {
    expect(SOURCES.length).toBeGreaterThan(SHOWS_THE_GRADE.length);
    expect(SOURCES.map((file) => file.name)).toEqual(
      expect.arrayContaining([...SHOWS_THE_GRADE, 'useWorkspace.ts']),
    );
  });

  test('only the hook that gates it reads the store verdict', () => {
    const offenders = SOURCES.filter(
      (file) => file.name !== 'useWorkspace.ts' && /\.verdict\b/.test(file.text),
    ).map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  test('nothing reads a verdict off the workspace bundle', () => {
    const offenders = SOURCES.filter((file) => /\bworkspace\.verdict\b/.test(file.text)).map(
      (file) => file.name,
    );

    expect(offenders).toEqual([]);
  });

  test('no panel that shows the grade keeps state of its own to latch it in', () => {
    const offenders = SOURCES.filter(
      (file) =>
        (SHOWS_THE_GRADE as readonly string[]).includes(file.name) &&
        /\buseState\b/.test(file.text),
    ).map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  test('no file carries a launch latch', () => {
    const offenders = SOURCES.filter((file) => /\blaunch(?:ed|ing)?\b/i.test(file.text)).map(
      (file) => file.name,
    );

    expect(offenders).toEqual([]);
  });
});
