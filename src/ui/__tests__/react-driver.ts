/**
 * A hand-cranked React, shared by every UI test that renders a component in node.
 *
 * Vitest runs in node: there is no DOM, and no new dependency is allowed. `src/meta/__tests__/publish-dialog.test.ts`
 * set the precedent — real hook semantics, real `Object.is` dependency comparison, the real
 * component called as a function — and four files then carried a trimmed copy of it each. Four
 * copies of one driver is the duplicated-constant class the two ratchets in `src/__tests__` exist
 * to catch, sitting inside the test suite; `docs/FIX-RAIL-METER.md` §4 is the extraction.
 *
 * Nothing was weakened to make it shareable. The version here is the widest of the four — the
 * `useState` setter takes an updater function as well as a value, which only
 * `modal-dismissal.test.ts` needed and none of the others can be harmed by.
 *
 * **Effects never run.** `useEffect` and `useLayoutEffect` are no-ops rather than a queue, and
 * every file that uses this driver depends on that: `App`'s mount effect builds a `RuntimeRunner`
 * and a canvas renderer, and these tests are about what a component *renders*, not what it mounts.
 * A driver that flushed effects would be a different instrument and would need its own name.
 *
 * `vi.mock` is hoisted per test file and cannot be moved in here, so each file keeps its own two
 * mock registrations. They are three lines each and they read the driver back out of this module,
 * which is the same instance the test body imports.
 */

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
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
    const here = slot();
    if (!here.filled) {
      here.filled = true;
      here.value = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const set = (next: T | ((previous: T) => T)): void => {
      here.value =
        typeof next === 'function' ? (next as (previous: T) => T)(here.value as T) : next;
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
  useEffect(): void {},
  useLayoutEffect(): void {},
  useSyncExternalStore<T>(_subscribe: unknown, snapshot: () => T): T {
    return snapshot();
  },
  useDebugValue(): void {},
};

export const reactDriver = {
  hooks,
  reset(): void {
    slots.length = 0;
    cursor = 0;
  },
};
