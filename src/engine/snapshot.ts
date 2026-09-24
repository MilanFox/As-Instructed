export const SNAPSHOT_MAX_DEPTH = 6;
export const SNAPSHOT_MAX_ENTRIES = 64;
export const SNAPSHOT_MAX_STRING = 400;
export const SNAPSHOT_MAX_NODES = 2_000;

export type Snapshot =
  | null
  | boolean
  | number
  | string
  | { $: 'undefined' }
  | { $: 'number'; value: 'NaN' | 'Infinity' | '-Infinity' | '-0' }
  | { $: 'bigint'; value: string }
  | { $: 'symbol'; description: string }
  | { $: 'function'; name: string }
  | { $: 'string'; head: string; length: number; omitted: number }
  | { $: 'array'; items: Snapshot[]; length: number; omitted: number }
  | { $: 'object'; ctor: string | null; entries: [string, Snapshot][]; omitted: number }
  | { $: 'map'; entries: [Snapshot, Snapshot][]; size: number; omitted: number }
  | { $: 'set'; items: Snapshot[]; size: number; omitted: number }
  | { $: 'error'; name: string; message: string }
  | { $: 'getter' }
  | { $: 'cycle' }
  | { $: 'truncated'; reason: 'depth' | 'size' };

export interface SnapshotBudget {
  nodes: number;
}

export function snapshotBudget(nodes: number = SNAPSHOT_MAX_NODES): SnapshotBudget {
  return { nodes };
}

export function snapshot(value: unknown, budget: SnapshotBudget = snapshotBudget()): Snapshot {
  return encode(value, budget, 0, []);
}

function encode(value: unknown, budget: SnapshotBudget, depth: number, path: object[]): Snapshot {
  if (budget.nodes <= 0) return { $: 'truncated', reason: 'size' };
  budget.nodes -= 1;

  switch (typeof value) {
    case 'undefined':
      return { $: 'undefined' };
    case 'boolean':
      return value;
    case 'number':
      if (Number.isNaN(value)) return { $: 'number', value: 'NaN' };
      if (value === Number.POSITIVE_INFINITY) return { $: 'number', value: 'Infinity' };
      if (value === Number.NEGATIVE_INFINITY) return { $: 'number', value: '-Infinity' };
      if (Object.is(value, -0)) return { $: 'number', value: '-0' };
      return value;
    case 'string':
      return value.length <= SNAPSHOT_MAX_STRING
        ? value
        : {
            $: 'string',
            head: value.slice(0, SNAPSHOT_MAX_STRING),
            length: value.length,
            omitted: value.length - SNAPSHOT_MAX_STRING,
          };
    case 'bigint':
      return { $: 'bigint', value: value.toString() };
    case 'symbol':
      return { $: 'symbol', description: value.description ?? '' };
    case 'function':
      return { $: 'function', name: value.name };
    default:
      break;
  }

  if (value === null) return null;
  const target = value as object;
  if (path.includes(target)) return { $: 'cycle' };
  if (target instanceof Error) {
    return { $: 'error', name: target.name, message: clipText(target.message) };
  }
  if (depth >= SNAPSHOT_MAX_DEPTH) return { $: 'truncated', reason: 'depth' };

  path.push(target);
  try {
    return encodeContainer(target, budget, depth + 1, path);
  } catch {
    return { $: 'truncated', reason: 'size' };
  } finally {
    path.pop();
  }
}

function encodeContainer(
  target: object,
  budget: SnapshotBudget,
  depth: number,
  path: object[],
): Snapshot {
  if (Array.isArray(target) || ArrayBuffer.isView(target)) {
    const list = target as ArrayLike<unknown>;
    const shown = Math.min(list.length, SNAPSHOT_MAX_ENTRIES);
    const items: Snapshot[] = [];
    for (let i = 0; i < shown; i++) items.push(encode(list[i], budget, depth, path));
    return { $: 'array', items, length: list.length, omitted: list.length - shown };
  }
  if (target instanceof Map) {
    const entries: [Snapshot, Snapshot][] = [];
    for (const [key, entry] of target) {
      if (entries.length >= SNAPSHOT_MAX_ENTRIES) break;
      entries.push([encode(key, budget, depth, path), encode(entry, budget, depth, path)]);
    }
    return { $: 'map', entries, size: target.size, omitted: target.size - entries.length };
  }
  if (target instanceof Set) {
    const items: Snapshot[] = [];
    for (const entry of target) {
      if (items.length >= SNAPSHOT_MAX_ENTRIES) break;
      items.push(encode(entry, budget, depth, path));
    }
    return { $: 'set', items, size: target.size, omitted: target.size - items.length };
  }

  const keys = Object.keys(target);
  const shown = Math.min(keys.length, SNAPSHOT_MAX_ENTRIES);
  const entries: [string, Snapshot][] = [];
  for (let i = 0; i < shown; i++) {
    const key = keys[i] as string;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    // Reading a getter runs player code, which could call the API mid-snapshot.
    const entry: Snapshot =
      descriptor === undefined || !('value' in descriptor)
        ? { $: 'getter' }
        : encode(descriptor.value, budget, depth, path);
    entries.push([key, entry]);
  }
  return { $: 'object', ctor: constructorName(target), entries, omitted: keys.length - shown };
}

function constructorName(target: object): string | null {
  const proto: unknown = Object.getPrototypeOf(target);
  if (proto === null || proto === Object.prototype) return null;
  const ctor: unknown = (proto as { constructor?: unknown }).constructor;
  return typeof ctor === 'function' && ctor.name !== '' ? ctor.name : null;
}

function clipText(text: string): string {
  return text.length <= SNAPSHOT_MAX_STRING ? text : `${text.slice(0, SNAPSHOT_MAX_STRING)}…`;
}
