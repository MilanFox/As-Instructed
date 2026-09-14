import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { MetaHost } from '../store.ts';
import type { LevelProfile, LibrarySave } from '../types.ts';

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

const { RefactorScreen } = await import('../ui/RefactorScreen.tsx');
const { REFACTOR } = await import('../copy.ts');
const { emptyLibrary } = await import('../save.ts');
const { useLibrary } = await import('../store.ts');

const LIB = `export function pathTo(from, to) {
  return [from, to];
}
`;

const CALLER_CODE = "import { pathTo } from 'lib';\n\npathTo({ x: 0, y: 0 }, { x: 3, y: 4 });\n";
const PLAIN_CODE = 'move();\nturn();\n';

function textOf(tree: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || node === undefined || node === false || node === true) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    const element = node as { type?: unknown; props?: Record<string, unknown> };
    const props = element.props;
    if (typeof element.type === 'function') {
      walk((element.type as (props: unknown) => unknown)(props ?? {}));
      return;
    }
    if (!props) return;
    walk(props['children']);
  };
  walk(tree);
  return parts.join(' ');
}

function render(component: () => unknown): string {
  return textOf(driver.renderUntilStable(component));
}

function expandAll(component: () => unknown): string {
  for (const open of expanders(driver.renderUntilStable(component))) open();
  return render(component);
}

function expanders(tree: unknown): (() => void)[] {
  const found: (() => void)[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const element = node as { type?: unknown; props?: Record<string, unknown> };
    const props = element.props;
    if (typeof element.type === 'function') {
      walk((element.type as (props: unknown) => unknown)(props ?? {}));
      return;
    }
    if (!props) return;
    if (props['className'] === 'lib-row' && typeof props['onClick'] === 'function') {
      found.push(props['onClick'] as () => void);
    }
    walk(props['children']);
  };
  walk(tree);
  return found;
}

function host(overrides: Partial<MetaHost> = {}): MetaHost {
  return {
    runner: { run: () => Promise.reject(new Error('not wanted here')) } as MetaHost['runner'],
    targets: () => [],
    facts: () => [
      {
        id: 'w4-01',
        title: 'Loading Dock',
        world: 4,
        parTicks: 100,
        seeds: [1, 2, 3],
        graded: true,
      },
    ],
    completed: () => [],
    applyMedals: () => {},
    setLevelCode: () => {},
    openLevel: () => {},
    ...overrides,
  };
}

function afterFirstPublish(): LibrarySave {
  return {
    ...emptyLibrary(),
    unlocked: true,
    briefed: true,
    source: LIB,
    published: [{ name: 'pathTo', fromLevel: 'w3-04', at: 1 }],
  };
}

function completionOf(code: string) {
  return {
    levelId: 'w4-01',
    code,
    ticks: 120,
    runs: [
      {
        seed: 1,
        ticks: 110,
        libraryUsage: { ticks: 40, calls: { pathTo: { calls: 4, ticks: 40 } } },
      },
      {
        seed: 2,
        ticks: 120,
        libraryUsage: { ticks: 60, calls: { pathTo: { calls: 4, ticks: 60 } } },
      },
      {
        seed: 3,
        ticks: 118,
        libraryUsage: { ticks: 44, calls: { pathTo: { calls: 4, ticks: 44 } } },
      },
    ],
  };
}

function suiteProfile(): LevelProfile {
  return {
    levelId: 'w4-01',
    key: 'suite-key',
    passed: true,
    ticks: 200,
    medal: 'bronze',
    parTicks: 100,
    usage: { ticks: 200, calls: { pathTo: { calls: 4, ticks: 200 } } },
    imports: ['pathTo'],
    at: 1,
  };
}

function seed(save: LibrarySave = afterFirstPublish()): void {
  useLibrary.getState().hydrate(null);
  useLibrary.setState({ save, source: save.source, offer: null, notice: null, suite: null });
  useLibrary.getState().attach(host());
  driver.reset();
}

describe('a closed work order that calls a subroutine records its own cost profile', () => {
  beforeEach(() => {
    seed();
  });

  test('one publish, then one completion, is enough to measure a per-call cost', () => {
    expect(useLibrary.getState().save.profiles).toEqual({});

    useLibrary.getState().recordCompletion(completionOf(CALLER_CODE));

    const profile = useLibrary.getState().save.profiles['w4-01'];
    expect(profile).toBeDefined();
    expect(profile?.usage.calls['pathTo']).toEqual({ calls: 4, ticks: 60 });
    expect(profile?.imports).toEqual(['pathTo']);
    expect(profile?.passed).toBe(true);
    expect(profile?.key).not.toBe('');

    const report = useLibrary.getState().reports()[0];
    expect(report?.calls).toBe(4);
    expect(report?.perCall).toBe(15);
  });

  test('the Cost tab shows the measurement instead of stating that nothing is measured', () => {
    useLibrary.getState().recordCompletion(completionOf(CALLER_CODE));

    const collapsed = render(RefactorScreen);

    expect(collapsed).not.toContain(REFACTOR.nothingMeasured);
    expect(collapsed).toContain('pathTo');
    expect(collapsed).toContain('15');

    expect(expandAll(RefactorScreen)).toContain('Loading Dock');
  });

  test('a work order that does not import lib.ts records nothing', () => {
    useLibrary.getState().recordCompletion(completionOf(PLAIN_CODE));

    expect(useLibrary.getState().save.profiles).toEqual({});
  });

  test('a locked library records nothing', () => {
    seed({ ...afterFirstPublish(), unlocked: false });

    useLibrary.getState().recordCompletion(completionOf(CALLER_CODE));

    expect(useLibrary.getState().save.profiles).toEqual({});
  });

  test('the medal on the profile follows the level facts, not the caller', () => {
    useLibrary.getState().recordCompletion(completionOf(CALLER_CODE));

    expect(useLibrary.getState().save.profiles['w4-01']?.medal).toBe('silver');
    expect(useLibrary.getState().save.profiles['w4-01']?.parTicks).toBe(100);
  });
});

describe('suite and completion are one source of truth per work order', () => {
  beforeEach(() => {
    seed();
  });

  test('a completion replaces an older suite profile for the same work order', () => {
    const save = useLibrary.getState().save;
    useLibrary.setState({ save: { ...save, profiles: { 'w4-01': suiteProfile() } } });

    useLibrary.getState().recordCompletion(completionOf(CALLER_CODE));

    const profiles = useLibrary.getState().save.profiles;
    expect(Object.keys(profiles)).toEqual(['w4-01']);
    expect(profiles['w4-01']?.usage.calls['pathTo']?.ticks).toBe(60);
  });

  test('a later suite run replaces the completion profile', async () => {
    useLibrary.getState().recordCompletion(completionOf(CALLER_CODE));

    const { applySuite } = await import('../regression.ts');
    const applied = applySuite(
      useLibrary.getState().save,
      {
        run: { revisionId: 'r2', startedAt: 1, entries: [] },
        summary: { total: 0, broken: 0, degraded: 0, improved: 0, nominal: 0, cached: 0 },
        cache: [],
        profiles: [suiteProfile()],
      },
      { revisionId: 'r2' },
    );

    expect(Object.keys(applied.save.profiles)).toEqual(['w4-01']);
    expect(applied.save.profiles['w4-01']?.key).toBe('suite-key');
  });
});
