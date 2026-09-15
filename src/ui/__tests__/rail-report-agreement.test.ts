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
const { Dir, evaluateObjectives, senseTotals } = await import('../../engine/index.ts');
const { SOLUTIONS } = await import('../../levels/__tests__/solutions.ts');
const { aggregate } = await import('../../runtime/aggregate.ts');

type LevelDef = ReturnType<typeof campaignOrder>[number];
type RunResult = ReturnType<typeof runLevel>;
type SeedRun = Parameters<typeof aggregate>[0][number];

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
  kind: string;
  readout: string;
}

function rowsOf(component: () => unknown): Row[] {
  driver.reset();
  const tree = draw(component());
  return within(tree, hasClass('objective-row')).map((row) => ({
    label: within([row], hasClass('objective-row__label'))[0]?.text ?? '',
    state: String(row.attrs['data-state'] ?? ''),
    gauge: within([row], hasClass('progress-meter')).length > 0,
    kind: String(within([row], hasClass('progress-meter'))[0]?.attrs['data-kind'] ?? ''),
    readout: within([row], hasClass('progress-meter__read'))[0]?.text ?? '',
  }));
}

interface Line {
  label: string;
  value: string;
}

function linesOf(component: () => unknown): Line[] {
  driver.reset();
  const tree = draw(component());
  return within(tree, hasClass('report-line')).map((line) => ({
    label: within([line], hasClass('report-line__label'))[0]?.text ?? '',
    value: within([line], hasClass('report-line__value'))[0]?.text ?? '',
  }));
}

function bonusOf(level: LevelDef, run: RunResult): ReturnType<typeof evaluateObjectives> {
  return evaluateObjectives(level.bonus ?? [], {
    world: run.world,
    trace: run.trace,
    initialWorld: run.initialWorld,
    ops: run.ops,
    senses: senseTotals(run.trace),
  });
}

function show(level: LevelDef, run: RunResult): void {
  const bonus = bonusOf(level, run);
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

function seedRunsOf(
  level: LevelDef,
  drive: (level: LevelDef, seed: number) => RunResult,
): SeedRun[] {
  return level.seeds.map((seed) => {
    const run = drive(level, seed);
    const bonus = bonusOf(level, run);
    return {
      result: {
        seed,
        passed: run.verdict.passed,
        ticks: run.verdict.stats.ticks,
        ops: run.ops,
        objectives: run.verdict.objectives,
        ...(bonus.length > 0 ? { bonus } : {}),
      },
      trace: run.trace,
      verdict: run.verdict,
    };
  });
}

function showAggregate(level: LevelDef, runs: SeedRun[]): void {
  const response = aggregate(runs);
  if (!response.ok) throw new Error(`${level.id} came back with no run at all`);
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: level.id,
    trace: response.trace,
    traceSeed: response.traceSeed,
    tick: response.trace.endTick,
    runMode: 'dispatch',
    showResults: true,
    seedResults: response.results,
    failure: null,
    freshCommendations: [],
    personalBest: null,
    verdict: response.verdict,
  });
}

interface Disagreement {
  level: string;
  label: string;
  order: Row;
  report: Row;
}

function sweep(present: (level: LevelDef) => void): { rows: number; found: Disagreement[] } {
  const found: Disagreement[] = [];
  let rows = 0;
  for (const level of campaignOrder()) {
    present(level);
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

const idleAt = (level: LevelDef, seed: number): RunResult => runLevel(level, seed, () => {});

const referenceAt = (level: LevelDef, seed: number): RunResult =>
  runReference(level, seed, SOLUTIONS[level.id] as never);

const idle = (level: LevelDef): RunResult => idleAt(level, seedOf(level));

const reference = (level: LevelDef): RunResult => referenceAt(level, seedOf(level));

function wastefulRuns(level: LevelDef, wasteful: number): SeedRun[] {
  return seedRunsOf(level, (each, seed) =>
    runLevel(each, seed, (sim, botId) => {
      (SOLUTIONS[each.id] as never as { run(sim: unknown, bot: number): void }).run(sim, botId);
      if (seed === wasteful) for (let spent = 0; spent < 3; spent++) sim.move(botId, Dir.North);
    }),
  );
}

const onOneSeed =
  (drive: (level: LevelDef) => RunResult) =>
  (level: LevelDef): void =>
    show(level, drive(level));

const onEverySeed =
  (drive: (level: LevelDef, seed: number) => RunResult) =>
  (level: LevelDef): void =>
    showAggregate(level, seedRunsOf(level, drive));

describe('one objective, two screens', () => {
  test('a run that did nothing is described the same way on both', () => {
    const { rows, found } = sweep(onOneSeed(idle));

    expect(found).toEqual([]);
    expect(rows).toBeGreaterThan(campaignOrder().length);
  });

  test('and so is the reference solution', () => {
    const { rows, found } = sweep(onOneSeed(reference));

    expect(found).toEqual([]);
    expect(rows).toBeGreaterThan(campaignOrder().length);
  });

  test('and so is a folded run, where the reading may come from a seed the board is not', () => {
    const { rows, found } = sweep(onEverySeed(idleAt));

    expect(found).toEqual([]);
    expect(rows).toBeGreaterThan(campaignOrder().length);
  });

  test('and so is the reference solution folded across every seed it runs on', () => {
    const { rows, found } = sweep(onEverySeed(referenceAt));

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

  test('a met budget is kinded apart from a progress meter, and names any headroom', () => {
    const level = campaignOrder().find((each) => each.id === 'w1-03') as LevelDef;
    show(level, reference(level));

    for (const screen of [rowsOf(OrderCard), rowsOf(Report)]) {
      const tiles = screen.find((row) => !row.label.startsWith('BONUS'));
      const moves = screen.find((row) => row.label.startsWith('BONUS'));

      expect(tiles?.kind).toBe('progress');
      expect(tiles?.readout).toMatch(/^\d+ \/ \d+ tiles$/);
      expect(moves?.kind).toBe('budget');
      expect(moves?.state).toBe('met');
      // w1-03 allows one move fewer than it has floor, so a clean drive has no headroom left.
      expect(moves?.readout).toMatch(/^\d+ \/ \d+ moves$/);
    }

    const roomy = campaignOrder().find((each) => each.id === 'w2-03') as LevelDef;
    show(roomy, reference(roomy));

    for (const screen of [rowsOf(OrderCard), rowsOf(Report)]) {
      const footprint = screen.find((row) => row.label.startsWith('BONUS'));

      expect(footprint?.kind).toBe('budget');
      expect(footprint?.state).toBe('met');
      expect(footprint?.readout).toMatch(/^\d+ \/ \d+ tiles · \d+ spare$/);
    }
  });

  test('a bonus missed on one seed reads that seed, not the one that kept it', () => {
    const level = campaignOrder().find((each) => each.id === 'w1-03') as LevelDef;
    const wasteful = level.seeds[level.seeds.length - 1] as number;
    expect(level.seeds.length).toBeGreaterThan(1);
    expect(level.seeds[0]).not.toBe(wasteful);

    const runs = wastefulRuns(level, wasteful);

    expect(runs.every((run) => run.result.passed)).toBe(true);
    expect(
      runs.filter((run) => run.result.bonus?.some((row) => !row.met)).map((run) => run.result.seed),
    ).toEqual([wasteful]);

    showAggregate(level, runs);

    for (const screen of [rowsOf(OrderCard), rowsOf(Report)]) {
      const tiles = screen.find((row) => !row.label.startsWith('BONUS')) as Row;
      const moves = screen.find((row) => row.label.startsWith('BONUS')) as Row;
      const [, used, allowance] = /^(\d+) \/ (\d+) moves · over by \d+$/.exec(moves.readout) ?? [];

      expect(tiles.readout).toMatch(/^\d+ \/ \d+ tiles$/);
      expect(moves.state).toBe('over');
      expect(Number(used)).toBeGreaterThan(Number(allowance));
    }
  });

  test('and the sheet says out loud which seed dropped the star', () => {
    const level = campaignOrder().find((each) => each.id === 'w1-03') as LevelDef;
    const wasteful = level.seeds[level.seeds.length - 1] as number;
    const kept = level.seeds[0] as number;
    const runs = wastefulRuns(level, wasteful);

    showAggregate(level, runs);
    const lines = linesOf(Report);
    const bonusLabel = level.bonus?.[0]?.label as string;

    expect(lines.find((line) => line.label === 'Bonus')?.value).toBe(
      `Missed on seed ${String(wasteful)}`,
    );
    const spent = runs.find((run) => run.result.seed === wasteful)?.result.bonus?.[0]
      ?.progress as [number, number];
    expect(lines.find((line) => line.label === `Seed ${String(wasteful)}`)?.value).toBe(
      `${bonusLabel} (${String(spent[0])}/${String(spent[1])})`,
    );
    expect(lines.find((line) => line.label === `Seed ${String(kept)}`)?.value).toBe('closed');
  });

  test('and no seed is named when there is no star to account for', () => {
    const level = campaignOrder().find((each) => each.id === 'w1-03') as LevelDef;
    const wasteful = level.seeds[level.seeds.length - 1] as number;
    const named = (): boolean => linesOf(Report).some((line) => line.label === 'Bonus');

    showAggregate(level, seedRunsOf(level, referenceAt));
    expect(named()).toBe(false);

    showAggregate(level, seedRunsOf(level, idleAt));
    expect(named()).toBe(false);

    const onlyWasteful = wastefulRuns(level, wasteful).filter(
      (run) => run.result.seed === wasteful,
    );
    showAggregate(level, onlyWasteful);
    expect(named()).toBe(false);
    expect(linesOf(Report).find((line) => line.label === `Seed ${String(wasteful)}`)?.value).toBe(
      'closed',
    );
  });
});
