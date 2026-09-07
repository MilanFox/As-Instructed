import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { MetaHost } from '../store.ts';

/**
 * The publish dialog has to settle.
 *
 * The dialog once derived its selection from `offer` and handed the result back to a store action
 * that replaced `offer` with a new object, so every commit
 * invalidated the memo that caused it. React answered with `Maximum update depth exceeded` and,
 * with no boundary above the modal layer, unmounted the whole application to a black screen.
 *
 * Vitest runs in node, so there is no React DOM here to count nested updates for us. The driver
 * below is a hand-cranked React: real hook semantics, real dependency comparison, the real
 * component, rendered over and over until nothing asks for another pass. A component that settles
 * cannot run away; a component that runs away never settles. `renderUntilStable` returns the pass
 * count, and the assertion is on that number rather than on anything the dialog draws.
 */

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
    /** Renders until a pass asks for no further pass, or gives up at `limit`. */
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

/**
 * zustand lives in `node_modules`, so its own `import React from 'react'` is resolved by node and
 * never sees the mock above. Its React binding is eight lines; this is those eight lines over the
 * driver's hooks. The store itself is the real one.
 */
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

const { PublishDialog } = await import('../ui/PublishDialog.tsx');
const { PUBLISH } = await import('../copy.ts');
const { emptyLibrary } = await import('../save.ts');
const { useLibrary } = await import('../store.ts');

const PROGRAM = `function leg(n) {
  for (let i = 0; i < n; i += 1) move();
}

function lap() {
  leg(3);
  turn();
  leg(3);
}

lap();
`;

/** Every checkbox the dialog drew, in order, with the handler it drew it with. */
function checkboxes(tree: unknown): { onChange: (event: unknown) => void }[] {
  const found: { onChange: (event: unknown) => void }[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return;
    if (props['type'] === 'checkbox' && typeof props['onChange'] === 'function') {
      found.push({ onChange: props['onChange'] as (event: unknown) => void });
    }
    walk(props['children']);
  };
  walk(tree);
  return found;
}

/** The dialog's own button, by the label the player reads on it. */
function press(tree: unknown, label: string): void {
  let handler: (() => void) | null = null;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return;
    if (props['children'] === label && typeof props['onClick'] === 'function') {
      handler = props['onClick'] as () => void;
    }
    walk(props['children']);
  };
  walk(tree);
  if (!handler) throw new Error(`no button labelled ${label}`);
  (handler as () => void)();
}

/** Enough of a campaign for `confirmPublish` to run against. No dependent work orders, no suite. */
function stubHost(): MetaHost & { levelCode: Map<string, string> } {
  const levelCode = new Map<string, string>();
  return {
    levelCode,
    runner: { run: () => Promise.reject(new Error('not wanted here')) } as MetaHost['runner'],
    targets: () => [],
    facts: () => [],
    completed: () => [],
    applyMedals: () => {},
    setLevelCode: (levelId: string, code: string) => void levelCode.set(levelId, code),
    openLevel: () => {},
  };
}

describe('the publish dialog settles', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.setState({
      save: { ...emptyLibrary(), unlocked: true, briefed: true },
      offer: null,
      notice: null,
    });
    driver.reset();
  });

  test('an offer with nothing ticked settles at once', () => {
    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);
    expect(useLibrary.getState().offer?.levelId).toBe('w1-01');

    const passes = driver.renderUntilStable(() => PublishDialog());

    // One render, one more for the effect that clears the tick state on a new offer. Then still.
    expect(passes).toBe(2);
  });

  test('ticking a routine settles too', () => {
    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);

    let tree: unknown = null;
    const passes = driver.renderUntilStable(() => (tree = PublishDialog()));
    expect(passes).toBeLessThan(25);

    const boxes = checkboxes(tree);
    expect(boxes.length).toBeGreaterThan(0);
    (boxes[0] as { onChange: (event: unknown) => void }).onChange({
      target: { checked: true },
    });

    expect(driver.renderUntilStable(() => PublishDialog())).toBeLessThan(25);
  });

  test('the offer the dialog is reading is never replaced under it', () => {
    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);
    const offer = useLibrary.getState().offer;

    driver.renderUntilStable(() => PublishDialog());

    expect(useLibrary.getState().offer).toBe(offer);
  });
});

/**
 * The three buttons, pressed through the dialog that draws them. The selection now travels as an
 * argument rather than through the store, so these pin that the trip still arrives.
 */
describe('the dialog still publishes, declines and stops offering', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.setState({
      save: { ...emptyLibrary(), unlocked: true, briefed: true },
      offer: null,
      notice: null,
    });
    driver.reset();
  });

  test('PUBLISH moves the ticked routine into lib.ts and closes the offer', async () => {
    const host = stubHost();
    useLibrary.getState().attach(host);
    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);

    let tree: unknown = null;
    driver.renderUntilStable(() => (tree = PublishDialog()));
    checkboxes(tree).forEach((box) => box.onChange({ target: { checked: true } }));
    driver.renderUntilStable(() => (tree = PublishDialog()));

    press(tree, PUBLISH.confirm);
    await Promise.resolve();

    expect(useLibrary.getState().offer).toBeNull();
    expect(useLibrary.getState().source).toContain('function leg');
    expect(useLibrary.getState().save.published.map((each) => each.name)).toContain('leg');
    expect(host.levelCode.get('w1-01')).toBeDefined();

    useLibrary.getState().attach(null);
  });

  test('Not this time declines this work order only', () => {
    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);
    let tree: unknown = null;
    driver.renderUntilStable(() => (tree = PublishDialog()));

    press(tree, PUBLISH.skip);

    expect(useLibrary.getState().offer).toBeNull();
    expect(useLibrary.getState().save.publishDeclined).toEqual(['w1-01']);
    expect(useLibrary.getState().save.publishMuted).toBe(false);

    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);
    expect(useLibrary.getState().offer).toBeNull();
    useLibrary.getState().offerPublish('w1-02', PROGRAM, []);
    expect(useLibrary.getState().offer?.levelId).toBe('w1-02');
  });

  test('Stop offering turns the prompt off for the rest of the game', () => {
    useLibrary.getState().offerPublish('w1-01', PROGRAM, []);
    let tree: unknown = null;
    driver.renderUntilStable(() => (tree = PublishDialog()));

    press(tree, PUBLISH.never);

    expect(useLibrary.getState().offer).toBeNull();
    expect(useLibrary.getState().save.publishMuted).toBe(true);
    useLibrary.getState().offerPublish('w1-02', PROGRAM, []);
    expect(useLibrary.getState().offer).toBeNull();
  });
});
