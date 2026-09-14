import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';

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
    renderUntilStable(render: () => unknown, limit = 25): number {
      let passes = 0;
      do {
        dirty = false;
        cursor = 0;
        render();
        passes += 1;
        for (const effect of effects.splice(0)) effect();
      } while (dirty && passes < limit);
      return passes;
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

import type { LevelProfile } from '../types.ts';

const { RefactorScreen } = await import('../ui/RefactorScreen.tsx');
const { StructureScreen } = await import('../ui/StructureScreen.tsx');
const { emptyLibrary } = await import('../save.ts');
const { REFACTOR, STRUCTURE } = await import('../copy.ts');
const { useLibrary } = await import('../store.ts');

const LIB = `export function pathTo(from, to) {
  const legs = [];
  while (from.x !== to.x) legs.push('x');
  return legs;
}
`;

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

function seedPublished(source: string, names: readonly string[]): void {
  useLibrary.getState().hydrate(null);
  useLibrary.setState({
    save: {
      ...emptyLibrary(),
      unlocked: true,
      briefed: true,
      source,
      published: names.map((name) => ({ name, fromLevel: 'w3-04', at: 1 })),
    },
    offer: null,
    notice: null,
  });
  driver.reset();
}

function seedOnePublished(): void {
  seedPublished(LIB, ['pathTo']);
}

function profile(levelId: string, calls: number, ticks: number, total: number): LevelProfile {
  return {
    levelId,
    key: `${levelId}-key`,
    passed: true,
    ticks: total,
    medal: 'silver',
    parTicks: Math.round(total * 0.8),
    usage: { ticks, calls: { pathTo: { calls, ticks } } },
    imports: ['pathTo'],
    at: 1,
  };
}

function seedMeasured(): void {
  seedOnePublished();
  const save = useLibrary.getState().save;
  useLibrary.setState({
    save: {
      ...save,
      profiles: {
        'w3-04': profile('w3-04', 4, 48, 200),
        'w4-01': profile('w4-01', 10, 30, 140),
      },
    },
  });
  driver.reset();
}

function render(component: () => unknown): string {
  let tree: unknown = null;
  driver.renderUntilStable(() => (tree = component()));
  return textOf(tree);
}

function expandAll(component: () => unknown): string {
  let tree: unknown = null;
  driver.renderUntilStable(() => (tree = component()));
  for (const open of expanders(tree)) open();
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

describe('Cost, with one published subroutine and nothing measured', () => {
  beforeEach(seedOnePublished);

  test('the tab says why it has no numbers instead of showing zeroes', () => {
    const text = render(RefactorScreen);

    expect(text).toContain(REFACTOR.nothingMeasured);
    expect(text).not.toContain(REFACTOR.lede);
    expect(text).toMatch(/pathTo[^|]*—\s+—\s+—\s+—/);
    expect(text).not.toMatch(/pathTo[^|]*\b0\s+0\s+0\s+0\b/);
  });

  test('the per-call column explains itself before anything is measured', () => {
    expect(render(RefactorScreen)).toContain(REFACTOR.perCallNote);
  });

  test('the opened row names the reason, not a joke about being uncalled', () => {
    expect(render(RefactorScreen)).not.toContain(REFACTOR.neverMeasured);
    expect(expandAll(RefactorScreen)).toContain(REFACTOR.neverMeasured);
  });

  test('a report with no measured run carries no range and no invented per-call', () => {
    const report = useLibrary.getState().reports()[0];
    expect(report?.name).toBe('pathTo');
    expect(report?.range).toBeUndefined();
    expect(report?.perCall).toBe(0);
  });
});

describe('Cost, when the cost depends on the arguments', () => {
  beforeEach(seedMeasured);

  test('per call is the measured range across work orders, not one blended figure', () => {
    const report = useLibrary.getState().reports()[0];
    expect(report?.range).toEqual({ low: 3, high: 12, lowLevel: 'w4-01', highLevel: 'w3-04' });
    expect(report?.callers.map((each) => each.perCall)).toEqual([12, 3]);

    const text = render(RefactorScreen);
    expect(text).toContain('3–12');
  });

  test('the opened row states that the arguments drive the cost', () => {
    expect(expandAll(RefactorScreen)).toContain(REFACTOR.varies(3, 'w4-01', 12, 'w3-04'));
  });
});

describe('Structure, with one published subroutine', () => {
  beforeEach(seedOnePublished);

  test('the tab states what it measures and why it is one line', () => {
    const text = render(StructureScreen);

    expect(text).toContain(STRUCTURE.lede);
    expect(text).toContain(STRUCTURE.single);
  });

  test('one subroutine is not reported as a flat library', () => {
    const text = render(StructureScreen);

    expect(text).not.toContain(STRUCTURE.flat);
    expect(text).not.toContain(STRUCTURE.nested);
    expect(text).not.toContain(STRUCTURE.footnote);
  });
});

describe('Structure, with two subroutines that never call each other', () => {
  beforeEach(() => {
    seedPublished('export function a() {}\nexport function b() {}\n', ['a', 'b']);
  });

  test('flatness is still reported once there is something it could have called', () => {
    expect(render(StructureScreen)).toContain(STRUCTURE.flat);
  });
});
