/**
 * The rail and the report say the same thing about the same objective, on every work order.
 *
 * `ReportObjective`'s own docstring is the claim: *"a budget that read as a gauge while the run
 * played and as a tick-box in the report is two different claims about the same number."* It was
 * not true. `ObjectiveRail` built its rows without the objective's declared `meter` and `unit`, so
 * `budgetFor` saw `undefined`, fell back to parsing the label, and DESIGN.md §11 A13 — *prefer a
 * declaration over the label* — held in the report and nowhere else. `w5-02`'s `eight-probes` was
 * reachable: a failed run drew a probe gauge in the report and a plain counter on the rail.
 *
 * So the assertion is not the three objectives `docs/FIX-UI-COVERAGE.md` measured. Those were
 * symptoms of one missing pair of fields, and the next objective to declare a meter would have
 * joined them silently. The invariant is the whole campaign, and it is asserted twice over: once on
 * a run that did nothing, and once on the reference solution.
 *
 * **Both halves are real runs.** `runLevel` builds the world, drives it and grades it exactly as
 * the worker does, and the bonus objectives are evaluated the same second pass `src/game/ports.ts`
 * makes — so the store holds a verdict the game could have produced, not a fixture shaped to make
 * a point. The playhead sits at `trace.endTick`, which is where the rail is when the report opens
 * over it: the same run, described twice, on one screen.
 *
 * A do-nothing program is the shape that matters. It is what a player's first Run does on a level
 * they have not solved, and it is the state where a declared budget is neither underspent nor
 * overrun — the two shapes `budgetFor` can recognise without a declaration. An objective that has
 * declared its meter is a gauge there; an objective the rail forgot to hand over is not.
 *
 * What is compared is the four things both components claim about a row: whether it is drawn as a
 * gauge, whether it is over, whether it carries the `limit` tag that says this number ends the work
 * order, and the readout itself — `21 / 16 beams` against `16/16`. Nothing here names a level, a
 * number or a unit; both sides are read off the same render.
 */
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

const { ObjectiveRail } = await import('../panels/ObjectiveRail.tsx');
const { Results } = await import('../screens/Results.tsx');
const { useGame } = await import('../../game/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { campaignOrder } = await import('../../levels/index.ts');
const { runLevel, runReference } = await import('../../levels/harness.ts');
const { evaluateObjectives, senseTotals } = await import('../../engine/index.ts');
const { SOLUTIONS } = await import('../../levels/__tests__/solutions.ts');

type LevelDef = ReturnType<typeof campaignOrder>[number];
type RunResult = ReturnType<typeof runLevel>;
type Props = Record<string, unknown>;

interface Drawn {
  classes: string[];
  text: string;
  children: Drawn[];
}

/** The component tree as marks and words, with function components called where they appear. */
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

/** One objective as a screen draws it. Everything both screens claim, and nothing either adds. */
interface Row {
  label: string;
  /** A gauge rather than a tick-box: the two shapes mean opposite things. */
  gauge: boolean;
  over: boolean;
  /** The word that says this number ends the work order rather than moving the medal. */
  limit: boolean;
  /** `21 / 16 beams`, or `16/16`, or nothing. */
  readout: string;
}

function rowsOf(component: () => unknown): Row[] {
  driver.reset();
  const tree = draw(component());
  return within(tree, (node) => node.classes.includes('objective')).map((row) => ({
    label: within([row], (node) => node.classes.includes('objective__label'))[0]?.text ?? '',
    gauge: row.classes.includes('objective--budget'),
    over: row.classes.includes('objective--over'),
    limit: within([row], (node) => node.classes.includes('objective__gate')).length > 0,
    readout:
      within([row], (node) =>
        node.classes.some((mark) => mark.startsWith('objective__progress')),
      )[0]?.text ?? '',
  }));
}

/**
 * The store as it stands the moment the report opens over the rail.
 *
 * The bonus pass is `src/game/ports.ts`': `buildVerdict` derives `passed` from every objective it
 * is handed and a missed bonus is not a failed run, so bonuses are graded separately and appended.
 */
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
  rail: Row;
  report: Row;
}

/** Every row of every work order, rail against report, for one way of driving the campaign. */
function sweep(drive: (level: LevelDef) => RunResult): { rows: number; found: Disagreement[] } {
  const found: Disagreement[] = [];
  let rows = 0;
  for (const level of campaignOrder()) {
    show(level, drive(level));
    const rail = rowsOf(ObjectiveRail);
    const report = rowsOf(Results);
    expect(
      report.map((row) => row.label),
      level.id,
    ).toEqual(rail.map((row) => row.label));
    rows += rail.length;
    rail.forEach((row, index) => {
      const twin = report[index] as Row;
      if (JSON.stringify(row) === JSON.stringify(twin)) return;
      found.push({ level: level.id, label: row.label, rail: row, report: twin });
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

  /*
   * Without this the pair above could agree by drawing no gauge anywhere, which is exactly the
   * failure they exist to catch — the rail's answer before the fix. The declared budgets have to be
   * on the screen for "the same" to mean anything.
   */
  test('and the agreement is not the agreement of two empty screens', () => {
    const gauges = campaignOrder().flatMap((level) => {
      show(level, idle(level));
      return rowsOf(ObjectiveRail).filter((row) => row.gauge);
    });

    expect(gauges.length).toBeGreaterThan(0);
    expect(gauges.some((row) => /\d+ \/ \d+ \w/.test(row.readout))).toBe(true);
  });

  /*
   * The one case `docs/FIX-UI-COVERAGE.md` measured as reachable today, and the reference solution
   * is what reaches it: it spends its eighth probe locating the break, so the bonus is met with its
   * progress exactly full — neither underspent nor overrun, the two shapes `budgetFor` can read
   * without a declaration. Before the fix the report drew `8 / 8 probes` as a gauge and the rail
   * drew `8 / 8` as a tick-box, which is the two-claims-about-one-number defect stated in full.
   */
  test('a bonus that declares its meter is a gauge on the rail too', () => {
    const level = campaignOrder().find((each) => each.id === 'w5-02') as LevelDef;
    show(level, reference(level));

    const bonus = level.bonus?.[0]?.label;
    const probes = rowsOf(ObjectiveRail).find((row) => row.label === bonus);
    expect(probes?.gauge).toBe(true);
    expect(probes?.readout).toBe(rowsOf(Results).find((row) => row.label === bonus)?.readout);
  });
});
