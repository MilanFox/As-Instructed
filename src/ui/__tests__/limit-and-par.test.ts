/**
 * Two tick numbers, and a player who can tell them apart.
 *
 * `w8-01` asks the run to close inside 215 ticks and pars at 165. Both were printed as "ticks"
 * with nothing to say which one ends the work order and which one moves the medal, and a player
 * who reads the wrong one either rewrites a passing program or watches a good one fail.
 * The fix gave each its own word.
 *
 * Nothing here hardcodes 215 or 165. The numbers are read off the level, so a par repair moves the
 * expectation with it; what is pinned is that the two numbers are different, that each is printed
 * under its own word, and that one line on the screen says which does what.
 *
 * The last section is the other end of the same defect: an ungraded work order has no par, so the
 * run report must not print one. That was the last place the two numbers could still read as one
 * kind of thing.
 *
 * The renderer is `src/ui/__tests__/react-driver.ts`, one hand-cranked React shared by every UI
 * test.
 */
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

const { Rail: ObjectiveRail } = await import('../desk/terminal/Rail.tsx');
const { ReportSheet } = await import('../desk/paper/ReportSheet.tsx');
const { snapshotReport } = await import('../desk/paper/report.ts');
const { useGame } = await import('../../game/store.ts');
const { emptySave } = await import('../../game/save.ts');
const { getLevel, campaignOrder } = await import('../../levels/index.ts');
const { isGraded } = await import('../../game/score.ts');

type LevelDef = NonNullable<ReturnType<typeof getLevel>>;
type Objective = LevelDef['objectives'][number];

/**
 * The run report as the desk draws it: a snapshot, on a certificate of closure or a HALT notice.
 * `Results` was a modal that destroyed itself; the sheet is the same
 * report on paper, and it is read off `snapshotReport` exactly as `usePaperwork` reads it.
 */
function Results(): unknown {
  const report = snapshotReport(useGame.getState() as never);
  return report ? ReportSheet({ report } as never) : null;
}

type Props = Record<string, unknown>;

/** The words a player reads, in order, from a component rendered with its children. */
function words(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(words).join(' ');
  const element = node as { type?: unknown; props?: Props };
  const props = element.props;
  if (!props) return '';
  const type = element.type;
  if (typeof type === 'function') {
    return words((type as (props: Props) => unknown)(props));
  }
  return words(props['children']);
}

/** Renders one screen and flattens it to the text on it, with single spaces between runs. */
function screen(component: () => unknown): string {
  driver.reset();
  return words(component()).replace(/\s+/g, ' ').trim();
}

const GRADED_WITH_A_LIMIT = 'w8-01';
const UNGRADED = 'w1-01';

/** The rail's own rule for "this level is scored on the clock as well as against par". */
function tickObjectiveOf(level: LevelDef): Objective | undefined {
  return level.objectives.find(
    (objective) => objective.meter?.kind === 'ticks' || /\bticks?\b/i.test(objective.label),
  );
}

/**
 * The deadline the level set, asked of the objective rather than read off a copy of it.
 *
 * A tick budget's `progress()` reports `[spent, deadline]`, so sampling it at tick zero is the
 * objective naming its own limit. Nothing here has to know that `w8-01` says 215.
 */
function limitOf(level: LevelDef): number | undefined {
  const objective = tickObjectiveOf(level);
  const at = objective?.progress?.({ trace: { endTick: 0 } } as never);
  return at?.[1];
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
    seedResults: [],
    showResults: false,
    tick: 0,
  });
  driver.reset();
});

describe('the rail prints both numbers and gives each its own word', () => {
  test('the fixture is a level where the two numbers really are different', () => {
    const level = getLevel(GRADED_WITH_A_LIMIT);
    expect(level && isGraded(level)).toBe(true);
    expect(level && limitOf(level)).toBeDefined();
    expect(level && limitOf(level)).not.toBe(level?.par.ticks);
  });

  test('both numbers are on the rail', () => {
    const level = getLevel(GRADED_WITH_A_LIMIT) as LevelDef;
    openLevel(GRADED_WITH_A_LIMIT, 180);
    const text = screen(ObjectiveRail);

    expect(text).toContain(String(limitOf(level)));
    expect(text).toContain(String(level.par.ticks));
  });

  test('the one that ends the work order is called a limit', () => {
    const level = getLevel(GRADED_WITH_A_LIMIT) as LevelDef;
    openLevel(GRADED_WITH_A_LIMIT, 180);

    expect(screen(ObjectiveRail)).toMatch(
      new RegExp(`limit 180 / ${String(limitOf(level))} ticks`),
    );
  });

  test('the one that moves the medal is called par', () => {
    const level = getLevel(GRADED_WITH_A_LIMIT) as LevelDef;
    openLevel(GRADED_WITH_A_LIMIT, 180);

    expect(screen(ObjectiveRail)).toMatch(new RegExp(`par 180 / ${String(level.par.ticks)}`));
  });

  test('the two are not introduced by the same word, which is the whole defect', () => {
    const level = getLevel(GRADED_WITH_A_LIMIT) as LevelDef;
    openLevel(GRADED_WITH_A_LIMIT, 180);
    const text = screen(ObjectiveRail);

    const wordBefore = (readout: string): string =>
      new RegExp(`(\\S+)\\s+${readout.replace('/', '\\/')}`).exec(text)?.[1] ?? '';

    const limitWord = wordBefore(`180 / ${String(limitOf(level))}`);
    const parWord = wordBefore(`180 / ${String(level.par.ticks)}`);

    expect(limitWord).not.toBe('');
    expect(parWord).not.toBe('');
    expect(limitWord).not.toBe(parWord);
  });

  test('and the screen says which is which, where both are on it', () => {
    openLevel(GRADED_WITH_A_LIMIT, 180);

    expect(screen(ObjectiveRail)).toContain('par sets the medal. the limit ends the work order.');
  });

  test('the note is not drawn where there is only one number to confuse', () => {
    const plain = campaignOrder().find(
      (level) =>
        isGraded(level) &&
        level.budget?.maxTicks === undefined &&
        tickObjectiveOf(level) === undefined,
    );
    expect(plain, 'a graded level with no tick limit').toBeDefined();
    if (!plain) return;

    openLevel(plain.id, 40);
    const text = screen(ObjectiveRail);

    expect(text).toContain('par');
    expect(text).not.toContain('the limit ends the work order');
  });
});

describe('an ungraded work order has no par to print', () => {
  test('the rail calls the clock ticks and never par', () => {
    openLevel(UNGRADED, 78);
    const text = screen(ObjectiveRail);

    expect(text).not.toMatch(/\bpar\b/);
    expect(text).toContain('ticks 78');
  });

  test('the report prints par on a graded work order', () => {
    const level = getLevel('w1-05');
    openLevel('w1-05', 78);

    expect(screen(Results)).toContain(`par ${String(level?.par.ticks)}`);
  });

  test('and prints no par at all on an ungraded one', () => {
    openLevel(UNGRADED, 78);

    expect(screen(Results)).not.toMatch(/\bpar\b/i);
  });

  test('the clock itself is still reported either way', () => {
    openLevel(UNGRADED, 78);
    expect(screen(Results)).toContain('ticks 78');

    openLevel('w1-05', 78);
    expect(screen(Results)).toContain('ticks 78');
  });
});
