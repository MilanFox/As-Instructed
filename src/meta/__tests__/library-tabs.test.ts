import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { RegressionTarget, SuiteResult } from '../regression.ts';
import type { MetaHost } from '../store.ts';
import type { LibrarySave, RegressionEntry } from '../types.ts';

const driver = vi.hoisted(() => {
  interface Slot {
    filled: boolean;
    value: unknown;
    deps: readonly unknown[] | undefined;
  }

  const slots: Slot[] = [];
  const effects: (() => void)[] = [];
  let cursor = 0;
  let dirty = false;

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
    useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
      const here = slot();
      if (!here.filled) {
        here.filled = true;
        here.value = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const set = (next: T | ((previous: T) => T)): void => {
        const value =
          typeof next === 'function' ? (next as (previous: T) => T)(here.value as T) : next;
        if (Object.is(value, here.value)) return;
        here.value = value;
        dirty = true;
      };
      return [here.value as T, set];
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
    useEffect(effect: () => void, deps?: readonly unknown[]): void {
      const here = slot();
      if (here.filled && same(here.deps, deps)) return;
      here.filled = true;
      here.deps = deps;
      effects.push(effect);
    },
    useSyncExternalStore<T>(subscribe: (notify: () => void) => () => void, snapshot: () => T): T {
      const here = slot();
      if (!here.filled) {
        here.filled = true;
        here.value = subscribe(() => {
          dirty = true;
        });
      }
      return snapshot();
    },
    useDebugValue(): void {},
  };

  return {
    hooks,
    reset(): void {
      slots.length = 0;
      effects.length = 0;
      cursor = 0;
      dirty = false;
    },
    renderUntilStable(render: () => unknown, limit = 25): unknown {
      let tree: unknown = null;
      let passes = 0;
      do {
        dirty = false;
        cursor = 0;
        tree = render();
        passes += 1;
        for (const effect of effects.splice(0)) effect();
      } while (dirty && passes < limit);
      return tree;
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

vi.mock('../ui/LibraryEditor.tsx', () => ({ LibraryEditor: () => null }));

const { LibraryPanel } = await import('../ui/LibraryPanel.tsx');
const { RegressionReport } = await import('../ui/RegressionReport.tsx');
const { DiscrepancyList } = await import('../ui/DiscrepancyList.tsx');
const { DISCREPANCY, REGRESSION } = await import('../copy.ts');
const { COMPLETIONS_PER_DISCREPANCY, MIN_CLOSED_BEFORE_FIRST } = await import('../discrepancy.ts');
const { emptyLibrary } = await import('../save.ts');
const { summarise } = await import('../regression.ts');
const { useLibrary } = await import('../store.ts');

function text(tree: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (!node || typeof node !== 'object') return;
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return;
    walk(props['children']);
  };
  walk(tree);
  return parts.join(' ');
}

const CURRENT_LEVEL_CODE = "import { pathTo } from 'lib';\n\npathTo({ x: 3, y: 4 });\n";

const CLOSED_TARGET = {
  levelId: 'w3-05',
  code: 'move();\nturn();\n',
  seeds: [1, 2, 3],
  parTicks: 40,
  medal: 'gold',
} as RegressionTarget;

function playerHost(overrides: Partial<MetaHost> = {}): MetaHost {
  return {
    runner: { run: () => Promise.reject(new Error('not wanted here')) } as MetaHost['runner'],
    targets: () => [CLOSED_TARGET],
    inHand: () => ({ levelId: 'w4-01', code: CURRENT_LEVEL_CODE }),
    facts: () => [],
    completed: () => [],
    applyMedals: () => {},
    setLevelCode: () => {},
    openLevel: () => {},
    ...overrides,
  };
}

function playerSave(): LibrarySave {
  return {
    ...emptyLibrary(),
    unlocked: true,
    briefed: true,
    source: 'export function pathTo() {}\n',
    published: [{ name: 'pathTo', fromLevel: 'w3-05', at: 1 }],
  };
}

describe('Regression counts the work order in hand as a reader', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.setState({ save: playerSave(), suite: null, suiteProgress: null });
    driver.reset();
  });

  test('one subroutine, imported only by the level being worked on, is not reported unused', () => {
    useLibrary.getState().attach(playerHost());

    const rendered = text(driver.renderUntilStable(() => RegressionReport()));

    expect(rendered).not.toContain(REGRESSION.readsNothing);
    expect(rendered).toContain(REGRESSION.readsInHand('w4-01'));
    expect(rendered).toContain(REGRESSION.lede);
  });

  test('a closed work order that imports lib.ts is counted as well', () => {
    useLibrary.getState().attach(
      playerHost({
        targets: () => [{ ...CLOSED_TARGET, code: CURRENT_LEVEL_CODE }],
        inHand: () => null,
      }),
    );

    const rendered = text(driver.renderUntilStable(() => RegressionReport()));

    expect(rendered).toContain(REGRESSION.readsClosed(1));
    expect(rendered).not.toContain(REGRESSION.readsNothing);
  });

  test('the level in hand is not double-counted when it is also closed', () => {
    useLibrary.getState().attach(
      playerHost({
        targets: () => [{ ...CLOSED_TARGET, levelId: 'w4-01', code: CURRENT_LEVEL_CODE }],
      }),
    );

    const readers = useLibrary.getState().readers();

    expect(readers.closed).toEqual(['w4-01']);
    expect(readers.inHand).toBeUndefined();
  });

  test('nothing importing lib.ts still reads as nothing', () => {
    useLibrary.getState().attach(playerHost({ inHand: () => null }));

    const rendered = text(driver.renderUntilStable(() => RegressionReport()));

    expect(rendered).toContain(REGRESSION.readsNothing);
  });
});

function badgeClasses(tree: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return;
    const className = props['className'];
    if (typeof className === 'string' && className.startsWith('lib__badge')) found.push(className);
    walk(props['children']);
  };
  walk(tree);
  return found;
}

function suiteOf(...states: RegressionEntry['state'][]): SuiteResult {
  const run = {
    revisionId: 'r1',
    startedAt: 1,
    finishedAt: 2,
    entries: states.map((state, index) => ({ levelId: `w3-0${index}`, state })),
  };
  return { run, summary: summarise(run), cache: [], profiles: [] };
}

describe('The Regression tab flags a result only when something moved', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.setState({ save: playerSave(), suite: null, suiteProgress: null, busy: false });
    useLibrary.getState().attach(playerHost());
    driver.reset();
  });

  test('a run where every level came out the same raises no badge', () => {
    useLibrary.setState({ suite: suiteOf('nominal', 'nominal') });

    const tree = driver.renderUntilStable(() => LibraryPanel());

    expect(badgeClasses(tree)).toEqual([]);
    expect(text(tree)).not.toContain('•');
  });

  test('a level that got slower raises the danger badge', () => {
    useLibrary.setState({ suite: suiteOf('nominal', 'degraded') });

    const tree = driver.renderUntilStable(() => LibraryPanel());

    expect(badgeClasses(tree)).toEqual(['lib__badge']);
    expect(text(tree)).toContain('•');
  });

  test('a level that stopped closing raises the danger badge', () => {
    useLibrary.setState({ suite: suiteOf('broken', 'nominal') });

    expect(badgeClasses(driver.renderUntilStable(() => LibraryPanel()))).toEqual(['lib__badge']);
  });

  test('an improvement is announced too, but not in alarm colours', () => {
    useLibrary.setState({ suite: suiteOf('improved', 'nominal') });

    expect(badgeClasses(driver.renderUntilStable(() => LibraryPanel()))).toEqual([
      'lib__badge lib__badge--ok',
    ]);
  });

  test('an improvement alongside a regression is still an alarm', () => {
    useLibrary.setState({ suite: suiteOf('improved', 'broken') });

    expect(badgeClasses(driver.renderUntilStable(() => LibraryPanel()))).toEqual(['lib__badge']);
  });

  test('a suite still running is flagged before its verdict is known', () => {
    useLibrary.setState({ suite: null, busy: true });

    expect(badgeClasses(driver.renderUntilStable(() => LibraryPanel()))).toEqual([
      'lib__badge lib__badge--ok',
    ]);
  });
});

describe('Discrepancies explains itself', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.setState({ save: playerSave() });
    useLibrary.getState().attach(playerHost());
    driver.reset();
  });

  test('an empty list still states what a discrepancy is and what to do', () => {
    const rendered = text(driver.renderUntilStable(() => DiscrepancyList()));

    expect(rendered).toContain(DISCREPANCY.lede);
    expect(rendered).toContain(
      DISCREPANCY.schedule(MIN_CLOSED_BEFORE_FIRST, COMPLETIONS_PER_DISCREPANCY),
    );
    expect(rendered).toContain(DISCREPANCY.todo);
  });

  test('a raised discrepancy keeps the explanation above it', () => {
    useLibrary.setState({
      save: {
        ...playerSave(),
        discrepancies: [{ id: 'DISCREPANCY 4471-w305', levelId: 'w3-05', seed: 512, raisedAt: 1 }],
      },
    });

    const rendered = text(driver.renderUntilStable(() => DiscrepancyList()));

    expect(rendered).toContain(DISCREPANCY.lede);
    expect(rendered).toContain(DISCREPANCY.todo);
    expect(rendered).toContain(DISCREPANCY.layout(512));
  });

  test('muting says so rather than leaving the schedule line standing alone', () => {
    useLibrary.setState({ save: { ...playerSave(), discrepanciesMuted: true } });

    const rendered = text(driver.renderUntilStable(() => DiscrepancyList()));

    expect(rendered).toContain(DISCREPANCY.muted);
  });
});
