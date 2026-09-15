import { describe, expect, test, vi } from 'vitest';
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

const { WorkOrderCard } = await import('../workspace/WorkOrderCard.tsx');
const { ReportSheet } = await import('../workspace/ReportSheet.tsx');
const { useWorkspace } = await import('../workspace/useWorkspace.ts');
const { snapshotReport } = await import('../paper/report.ts');
const { useGame } = await import('../../game/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { campaignOrder } = await import('../../levels/index.ts');
const { runLevel, runReference } = await import('../../levels/harness.ts');
const { evaluateObjectives, senseTotals } = await import('../../engine/index.ts');
const { SOLUTIONS } = await import('../../levels/__tests__/solutions.ts');

type LevelDef = ReturnType<typeof campaignOrder>[number];
type RunResult = ReturnType<typeof runLevel>;

function OrderCard(): unknown {
  return WorkOrderCard({ workspace: useWorkspace() });
}

function Report(): unknown {
  const report = snapshotReport(useGame.getState());
  return report ? ReportSheet({ report }) : null;
}

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

interface Row {
  label: string;
  state: string;
  gauge: boolean;
  readout: string;
}

function rowsOf(component: () => unknown): Row[] {
  driver.reset();
  const tree = draw(component());
  return within(tree, hasClass('objective-row')).map((row) => ({
    label: within([row], hasClass('objective-row__label'))[0]?.text ?? '',
    state: String(row.attrs['data-state'] ?? ''),
    gauge: within([row], hasClass('progress-meter')).length > 0,
    readout: within([row], hasClass('progress-meter__read'))[0]?.text ?? '',
  }));
}

function show(level: LevelDef, run: RunResult): void {
  const bonus = evaluateObjectives(level.bonus ?? [], {
    world: run.world,
    trace: run.trace,
    initialWorld: run.initialWorld,
    ops: run.ops,
    senses: senseTotals(run.trace),
  });
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: level.id,
    trace: run.trace,
    traceSeed: run.seed,
    tick: run.trace.endTick,
    runMode: 'dispatch',
    showResults: true,
    seedResults: [],
    failure: null,
    freshCommendations: [],
    personalBest: null,
    verdict: { ...run.verdict, objectives: [...run.verdict.objectives, ...bonus] },
  });
}

interface Disagreement {
  level: string;
  label: string;
  order: Row;
  report: Row;
}

function sweep(drive: (level: LevelDef) => RunResult): { rows: number; found: Disagreement[] } {
  const found: Disagreement[] = [];
  let rows = 0;
  for (const level of campaignOrder()) {
    show(level, drive(level));
    const order = rowsOf(OrderCard);
    const report = rowsOf(Report);
    expect(
      report.map((row) => row.label),
      level.id,
    ).toEqual(order.map((row) => row.label));
    rows += order.length;
    order.forEach((row, index) => {
      const twin = report[index] as Row;
      if (JSON.stringify(row) === JSON.stringify(twin)) return;
      found.push({ level: level.id, label: row.label, order: row, report: twin });
    });
  }
  return { rows, found };
}

const seedOf = (level: LevelDef): number => level.seeds[0] ?? 1;

const idle = (level: LevelDef): RunResult => runLevel(level, seedOf(level), () => {});

const reference = (level: LevelDef): RunResult =>
  runReference(level, seedOf(level), SOLUTIONS[level.id] as never);

describe('one objective, two screens', () => {
  test('a run that did nothing is described the same way on both', () => {
    const { rows, found } = sweep(idle);

    expect(found).toEqual([]);
    expect(rows).toBeGreaterThan(campaignOrder().length);
  });

  test('and so is the reference solution', () => {
    const { rows, found } = sweep(reference);

    expect(found).toEqual([]);
    expect(rows).toBeGreaterThan(campaignOrder().length);
  });

  test('and the agreement is not the agreement of two empty screens', () => {
    const gauges = campaignOrder().flatMap((level) => {
      show(level, idle(level));
      return rowsOf(OrderCard).filter((row) => row.gauge);
    });

    expect(gauges.length).toBeGreaterThan(0);
    expect(gauges.some((row) => /\d+ \/ \d+ \w/.test(row.readout))).toBe(true);
  });

  test('a bonus that declares its meter is a gauge on the work order too', () => {
    const level = campaignOrder().find((each) => each.id === 'w5-02') as LevelDef;
    show(level, reference(level));

    const bonus = level.bonus?.[0]?.label as string;
    const probes = rowsOf(OrderCard).find((row) => row.label.endsWith(bonus));
    expect(probes?.gauge).toBe(true);
    expect(probes?.readout).toBe(rowsOf(Report).find((row) => row.label.endsWith(bonus))?.readout);
  });
});
