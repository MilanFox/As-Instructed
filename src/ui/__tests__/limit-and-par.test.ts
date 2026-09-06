/**
 * Two tick numbers, and a player who can tell them apart.
 *
 * `w8-01` asks the run to close inside 215 ticks and pars at 165. Both were printed as "ticks"
 * with nothing to say which one ends the work order and which one moves the medal, and a player
 * who reads the wrong one either rewrites a passing program or watches a good one fail
 * (`docs/FIX-INCENTIVES.md` §H). The fix gave each its own word.
 *
 * Nothing here hardcodes 215 or 165. The numbers are read off the level, so a par repair moves the
 * expectation with it; what is pinned is that the two numbers are different, that each is printed
 * under its own word, and that one line on the screen says which does what.
 *
 * The last section is the other end of the same defect: an ungraded work order has no par, so the
 * run report must not print one. That was the last place the two numbers could still read as one
 * kind of thing.
 *
 * The renderer is local to this file, and so is each sibling's, which is not a preference:
 * `src/__tests__/unused-exports.test.ts` pins the count of exports whose only readers are tests at
 * an exact number, so a shared fixture module fails the suite until that number is changed.
 * `docs/FIX-UI-COVERAGE.md` carries the one-line change that would let them share one.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';

const driver = vi.hoisted(() => {
  interface Slot {
    filled: boolean;
    value: unknown;
    deps: readonly unknown[] | undefined;
  }

  const slots: Slot[] = [];
  let cursor = 0;

  function slot(): Slot {
    const existing = slots[cursor];
    cursor += 1;
    if (existing) return existing;
    const fresh: Slot = { filled: false, value: undefined, deps: undefined };
    slots[cursor - 1] = fresh;
    return fresh;
  }

  function same(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((each, index) => Object.is(each, b[index]));
  }

  function memo<T>(factory: () => T, deps: readonly unknown[]): T {
    const here = slot();
    if (!here.filled || !same(here.deps, deps)) {
      here.filled = true;
      here.value = factory();
      here.deps = deps;
    }
    return here.value as T;
  }

  const hooks = {
    useState<T>(initial: T | (() => T)): [T, (next: T) => void] {
      const here = slot();
      if (!here.filled) {
        here.filled = true;
        here.value = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      return [
        here.value as T,
        (next: T): void => {
          here.value = next;
        },
      ];
    },
    useRef<T>(initial: T): { current: T } {
      const here = slot();
      if (!here.filled) {
        here.filled = true;
        here.value = { current: initial };
      }
      return here.value as { current: T };
    },
    useCallback<T>(fn: T, deps: readonly unknown[]): T {
      return memo(() => fn, deps);
    },
    useMemo: memo,
    useEffect(): void {},
    useLayoutEffect(): void {},
    useSyncExternalStore<T>(_subscribe: unknown, snapshot: () => T): T {
      return snapshot();
    },
    useDebugValue(): void {},
  };

  return {
    hooks,
    reset(): void {
      slots.length = 0;
      cursor = 0;
    },
  };
});

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
const { getLevel, campaignOrder } = await import('../../levels/index.ts');
const { isGraded } = await import('../../game/score.ts');

type LevelDef = NonNullable<ReturnType<typeof getLevel>>;
type Objective = LevelDef['objectives'][number];

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
