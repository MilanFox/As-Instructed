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

const { WorkOrderCard } = await import('../workspace/WorkOrderCard.tsx');
const { ReportSheet } = await import('../workspace/ReportSheet.tsx');
const { useWorkspace } = await import('../workspace/useWorkspace.ts');
const { snapshotReport } = await import('../report.ts');
const { useGame } = await import('../../game/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { getLevel, campaignOrder } = await import('../../levels/index.ts');
const { isGraded } = await import('../../game/score.ts');

type LevelDef = NonNullable<ReturnType<typeof getLevel>>;
type Objective = LevelDef['objectives'][number];

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
  text: string;
  children: Drawn[];
}

function draw(node: unknown): Drawn[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ classes: [], text: String(node), children: [] }];
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

function render(component: () => unknown): Drawn[] {
  driver.reset();
  return draw(component());
}

function screen(component: () => unknown): string {
  return render(component)
    .map((node) => node.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cells(tree: Drawn[]): Map<string, string> {
  const pairs = within(tree, hasClass('stat-cell')).map((cell): [string, string] => [
    within([cell], hasClass('stat-cell__label'))[0]?.text ?? '',
    within([cell], hasClass('stat-cell__value'))[0]?.text ?? '',
  ]);
  return new Map(pairs);
}

function readouts(tree: Drawn[]): Map<string, string> {
  const pairs = within(tree, hasClass('objective-row')).map((row): [string, string] => [
    within([row], hasClass('objective-row__label'))[0]?.text ?? '',
    within([row], hasClass('progress-meter__read'))[0]?.text ?? '',
  ]);
  return new Map(pairs);
}

// The limit is stated by an objective of its own here, and by the shift budget on w2-03.
const LIMIT_AS_OBJECTIVE = 'w8-01';
const LIMIT_AS_BUDGET = 'w2-03';
const NO_LIMIT = 'w1-03';
const UNGRADED = 'w1-01';

function tickObjectiveOf(level: LevelDef): Objective | undefined {
  return level.objectives.find(
    (objective) => objective.meter?.kind === 'ticks' || /\bticks?\b/i.test(objective.label),
  );
}

function limitOf(level: LevelDef): number | undefined {
  const objective = tickObjectiveOf(level);
  try {
    // Some deadlines are measured off the board, which this empty source cannot supply.
    return objective?.progress?.({ trace: { endTick: 0 } } as never)?.[1];
  } catch {
    return undefined;
  }
}

function openLevel(id: string, ticks: number): void {
  const level = getLevel(id);
  if (!level) throw new Error(`no level ${id}`);
  const deadline = limitOf(level);
  const counted = tickObjectiveOf(level);
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    currentLevelId: id,
    trace: null,
    tick: ticks,
    runMode: 'dispatch',
    showResults: true,
    seedResults: [],
    verdict: {
      passed: true,
      ticks,
      stats: { ticks, ops: ticks, chars: 0, senses: {}, spend: {} },
      objectives: level.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        met: true,
        ...(objective === counted && deadline !== undefined
          ? { progress: [Math.min(ticks, deadline), deadline] as [number, number] }
          : {}),
      })),
    } as never,
  });
}

beforeEach(() => {
  useGame.setState({
    save: emptySave(),
    screen: 'workspace',
    verdict: null,
    trace: null,
    runMode: null,
    seedResults: [],
    showResults: false,
    tick: 0,
  });
  driver.reset();
});

describe('the work order prints both numbers and gives each its own word', () => {
  test('the fixture is a level where the two numbers really are different', () => {
    const level = getLevel(LIMIT_AS_OBJECTIVE);
    expect(level && isGraded(level)).toBe(true);
    expect(level && limitOf(level)).toBeDefined();
    expect(level && limitOf(level)).not.toBe(level?.par.ticks);
  });

  test('both numbers are on the work order', () => {
    const level = getLevel(LIMIT_AS_OBJECTIVE) as LevelDef;
    openLevel(LIMIT_AS_OBJECTIVE, 180);
    const text = screen(OrderCard);

    expect(text).toContain(String(limitOf(level)));
    expect(text).toContain(String(level.par.ticks));
  });

  test('the one that moves the medal is a cell called par', () => {
    const level = getLevel(LIMIT_AS_OBJECTIVE) as LevelDef;
    openLevel(LIMIT_AS_OBJECTIVE, 180);

    expect(cells(render(OrderCard)).get('Par')).toBe(`${String(level.par.ticks)} t`);
  });

  test('the one that ends the work order is the objective that ends it', () => {
    const level = getLevel(LIMIT_AS_OBJECTIVE) as LevelDef;
    const counted = tickObjectiveOf(level) as Objective;
    const limit = limitOf(level) as number;
    openLevel(LIMIT_AS_OBJECTIVE, 180);

    expect(readouts(render(OrderCard)).get(counted.label)).toBe(
      `180 / ${String(limit)} ticks · ${String(limit - 180)} spare`,
    );
  });

  test('the two are not introduced by the same word, which is the whole defect', () => {
    const level = getLevel(LIMIT_AS_OBJECTIVE) as LevelDef;
    const counted = tickObjectiveOf(level) as Objective;
    openLevel(LIMIT_AS_OBJECTIVE, 180);
    const tree = render(OrderCard);

    const parWord = [...cells(tree)].find(
      ([, value]) => value === `${String(level.par.ticks)} t`,
    )?.[0];
    const limitWord = [...readouts(tree)].find(([, value]) =>
      value.startsWith(`180 / ${String(limitOf(level))}`),
    )?.[0];

    expect(parWord).toBe('Par');
    expect(limitWord).toBe(counted.label);
    expect(limitWord).not.toBe(parWord);
  });

  test('a shift budget is a cell of its own rather than a second par', () => {
    const level = getLevel(LIMIT_AS_BUDGET) as LevelDef;
    const stop = level.budget?.maxTicks as number;
    expect(stop).not.toBe(level.par.ticks);
    openLevel(LIMIT_AS_BUDGET, 40);
    const stats = cells(render(OrderCard));

    expect(stats.get('Par')).toBe(`${String(level.par.ticks)} t`);
    expect(stats.get('Limit')).toBe(`${String(stop)} t`);
  });

  test('a work order with no limit says so rather than printing par twice', () => {
    const level = getLevel(NO_LIMIT) as LevelDef;
    expect(isGraded(level)).toBe(true);
    expect(limitOf(level)).toBeUndefined();
    expect(level.budget?.maxTicks).toBeUndefined();

    openLevel(NO_LIMIT, 40);
    const stats = cells(render(OrderCard));

    expect(stats.get('Par')).toBe(`${String(level.par.ticks)} t`);
    expect(stats.get('Limit')).toBe('none');
  });

  test('every graded work order in the campaign fills both cells', () => {
    const graded = campaignOrder().filter((level) => isGraded(level));
    expect(graded.length).toBeGreaterThan(0);

    for (const level of graded) {
      openLevel(level.id, 40);
      const stats = cells(render(OrderCard));

      expect(stats.get('Par'), level.id).toBe(`${String(level.par.ticks)} t`);
      expect(stats.get('Limit'), level.id).not.toBe(stats.get('Par'));
    }
  });
});

describe('an ungraded work order has no par to print', () => {
  test('the work order leaves par blank and still counts the clock', () => {
    openLevel(UNGRADED, 78);
    const stats = cells(render(OrderCard));

    expect(stats.get('Par')).toBe('—');
    expect(stats.get('Ticks')).toBe('78');
  });

  test('a graded work order prints the number instead', () => {
    const level = getLevel(NO_LIMIT) as LevelDef;
    openLevel(NO_LIMIT, 78);

    expect(cells(render(OrderCard)).get('Par')).toBe(`${String(level.par.ticks)} t`);
  });

  test('the report prints par on a graded work order', () => {
    const level = getLevel(NO_LIMIT) as LevelDef;
    openLevel(NO_LIMIT, 78);

    expect(cells(render(Report)).get('Par')).toBe(String(level.par.ticks));
  });

  test('and prints no par at all on an ungraded one', () => {
    openLevel(UNGRADED, 78);

    expect(cells(render(Report)).get('Par')).toBe('—');
  });

  test('the clock itself is still reported either way', () => {
    openLevel(UNGRADED, 78);
    expect(cells(render(Report)).get('Ticks')).toBe('78');

    openLevel(NO_LIMIT, 78);
    expect(cells(render(Report)).get('Ticks')).toBe('78');
  });
});
