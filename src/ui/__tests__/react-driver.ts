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
