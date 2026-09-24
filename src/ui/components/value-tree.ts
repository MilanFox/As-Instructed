import type { Snapshot } from '../../engine/index.ts';
import { enumText, fieldType, itemType, typeName } from './value-type.ts';
import type { TypeRef } from './value-type.ts';

export type ValueTone =
  | 'string'
  | 'number'
  | 'boolean'
  | 'nil'
  | 'symbol'
  | 'function'
  | 'type'
  | 'key'
  | 'punct'
  | 'error'
  | 'meta';

export interface ValueSegment {
  text: string;
  tone: ValueTone;
}

export interface ValueRow {
  id: string;
  level: number;
  posInSet: number;
  setSize: number;
  label: string | null;
  separator: string;
  value: Snapshot | null;
  type: TypeRef | undefined;
  omitted: number;
  expandable: boolean;
  expanded: boolean;
  change: 'same' | 'changed' | 'added';
  previous: Snapshot | undefined;
}

interface Child {
  label: string | null;
  separator: string;
  diffKey: string;
  value: Snapshot;
  type: TypeRef | undefined;
}

const PREVIEW_ENTRIES = 5;
const PREVIEW_CHARS = 60;
const PREVIEW_STRING = 24;
const INLINE_OBJECT_ENTRIES = 3;

type Tagged = Exclude<Snapshot, null | boolean | number | string>;

function tagged(value: Snapshot): Tagged | null {
  return typeof value === 'object' && value !== null ? value : null;
}

export function isExpandable(value: Snapshot): boolean {
  const node = tagged(value);
  if (!node) return false;
  switch (node.$) {
    case 'array':
    case 'set':
      return node.items.length > 0 || node.omitted > 0;
    case 'object':
    case 'map':
      return node.entries.length > 0 || node.omitted > 0;
    default:
      return false;
  }
}

function quoted(text: string, limit: number): string {
  const clipped = text.length > limit ? `${text.slice(0, limit)}…` : text;
  return JSON.stringify(clipped);
}

function leaf(
  value: Snapshot,
  stringLimit: number,
  type: TypeRef | undefined,
): ValueSegment[] | null {
  const named = enumText(type, value);
  if (named !== null) return [{ text: named, tone: 'number' }];
  if (value === null) return [{ text: 'null', tone: 'nil' }];
  if (typeof value === 'boolean') return [{ text: String(value), tone: 'boolean' }];
  if (typeof value === 'number') return [{ text: String(value), tone: 'number' }];
  if (typeof value === 'string') return [{ text: quoted(value, stringLimit), tone: 'string' }];
  switch (value.$) {
    case 'undefined':
      return [{ text: 'undefined', tone: 'nil' }];
    case 'number':
      return [{ text: value.value, tone: 'number' }];
    case 'bigint':
      return [{ text: `${value.value}n`, tone: 'number' }];
    case 'symbol':
      return [{ text: `Symbol(${value.description})`, tone: 'symbol' }];
    case 'function':
      return [{ text: `ƒ ${value.name || '(anonymous)'}()`, tone: 'function' }];
    case 'string':
      return [
        { text: quoted(value.head, stringLimit), tone: 'string' },
        { text: ` +${value.omitted} chars`, tone: 'meta' },
      ];
    case 'error':
      return [
        { text: value.message ? `${value.name}: ${value.message}` : value.name, tone: 'error' },
      ];
    case 'getter':
      return [{ text: '‹getter›', tone: 'meta' }];
    case 'cycle':
      return [{ text: '‹cycle›', tone: 'meta' }];
    case 'truncated':
      return [{ text: value.reason === 'depth' ? '‹depth limit›' : '‹size limit›', tone: 'meta' }];
    default:
      return null;
  }
}

function containerTitle(node: Tagged, type: TypeRef | undefined): ValueSegment[] {
  switch (node.$) {
    case 'array':
      return [{ text: `Array(${node.length})`, tone: 'type' }];
    case 'map':
      return [{ text: `Map(${node.size})`, tone: 'type' }];
    case 'set':
      return [{ text: `Set(${node.size})`, tone: 'type' }];
    case 'object': {
      const name = typeName(type, node) ?? node.ctor;
      return name ? [{ text: name, tone: 'type' }] : [];
    }
    default:
      return [];
  }
}

function isPlainLeaf(value: Snapshot): boolean {
  return tagged(value) === null;
}

function abbreviated(value: Snapshot, type: TypeRef | undefined): ValueSegment[] {
  const node = tagged(value);
  if (node?.$ === 'object') {
    const small =
      node.omitted === 0 &&
      node.entries.length <= INLINE_OBJECT_ENTRIES &&
      node.entries.every(([, entry]) => isPlainLeaf(entry));
    if (small && !node.ctor) return previewSegments(value, type, false);
    const title = containerTitle(node, type);
    if (title.length > 0) return title;
    return [{ text: node.entries.length === 0 ? '{}' : '{…}', tone: 'punct' }];
  }
  if (node && isContainer(node)) return containerTitle(node, type);
  return leaf(value, PREVIEW_STRING, type) ?? [];
}

function isContainer(node: Tagged): boolean {
  return node.$ === 'array' || node.$ === 'object' || node.$ === 'map' || node.$ === 'set';
}

function textLength(segments: readonly ValueSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.text.length, 0);
}

export function previewSegments(
  value: Snapshot,
  type?: TypeRef,
  titled: boolean = true,
): ValueSegment[] {
  const node = tagged(value);
  const scalar = leaf(value, PREVIEW_STRING, type);
  if (!node || !isContainer(node)) return scalar ?? [];

  const title = titled ? containerTitle(node, type) : [];
  const [open, close] = node.$ === 'array' ? ['[', ']'] : ['{', '}'];
  const out: ValueSegment[] = title.length > 0 ? [...title, { text: ' ', tone: 'punct' }] : [];
  out.push({ text: open, tone: 'punct' });

  const children = childrenOf(value, type);
  const omitted = 'omitted' in node ? node.omitted : 0;
  let shown = 0;
  for (const child of children) {
    if (shown >= PREVIEW_ENTRIES || textLength(out) > PREVIEW_CHARS) break;
    if (shown > 0) out.push({ text: ', ', tone: 'punct' });
    if (child.label !== null && node.$ !== 'array' && node.$ !== 'set') {
      out.push({ text: child.label, tone: 'key' }, { text: child.separator, tone: 'punct' });
    }
    out.push(...abbreviated(child.value, child.type));
    shown += 1;
  }
  if (shown < children.length || omitted > 0) {
    out.push({ text: shown > 0 ? ', …' : '…', tone: 'punct' });
  }
  out.push({ text: close, tone: 'punct' });
  return out;
}

export function headerSegments(value: Snapshot, type?: TypeRef): ValueSegment[] {
  const node = tagged(value);
  if (!node || !isContainer(node)) return previewSegments(value, type);
  const title = containerTitle(node, type);
  return title.length > 0 ? title : [{ text: 'Object', tone: 'type' }];
}

export function previewText(value: Snapshot, type?: TypeRef): string {
  return previewSegments(value, type)
    .map((segment) => segment.text)
    .join('');
}

function childrenOf(value: Snapshot, type: TypeRef | undefined): Child[] {
  const node = tagged(value);
  if (!node) return [];
  switch (node.$) {
    case 'array': {
      const items = itemType(type, node);
      return node.items.map((item, index) => ({
        label: String(index),
        separator: ': ',
        diffKey: String(index),
        value: item,
        type: items,
      }));
    }
    case 'set':
      return node.items.map((item, index) => ({
        label: null,
        separator: '',
        diffKey: String(index),
        value: item,
        type: undefined,
      }));
    case 'object':
      return node.entries.map(([key, entry]) => ({
        label: key,
        separator: ': ',
        diffKey: key,
        value: entry,
        type: fieldType(type, node, key),
      }));
    case 'map':
      return node.entries.map(([key, entry]) => {
        const label = previewText(key);
        return { label, separator: ' => ', diffKey: label, value: entry, type: undefined };
      });
    default:
      return [];
  }
}

function omittedOf(value: Snapshot): number {
  const node = tagged(value);
  return node && isContainer(node) && 'omitted' in node ? node.omitted : 0;
}

export function sameSnapshot(a: Snapshot | undefined, b: Snapshot | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface FlattenOptions {
  label: string | null;
  expanded: ReadonlySet<string>;
  diff: boolean;
  previous: Snapshot | undefined;
  type?: TypeRef;
}

export const ROOT_ROW = 'r';

export function flattenRows(value: Snapshot, options: FlattenOptions): ValueRow[] {
  const rows: ValueRow[] = [];
  const visit = (
    id: string,
    level: number,
    posInSet: number,
    setSize: number,
    child: Omit<Child, 'diffKey'>,
    previous: Snapshot | undefined,
    hasPrevious: boolean,
  ): void => {
    const expandable = isExpandable(child.value);
    const expanded = expandable && options.expanded.has(id);
    const change = !options.diff
      ? 'same'
      : !hasPrevious
        ? 'added'
        : sameSnapshot(previous, child.value)
          ? 'same'
          : 'changed';
    rows.push({
      id,
      level,
      posInSet,
      setSize,
      label: child.label,
      separator: child.separator,
      value: child.value,
      type: child.type,
      omitted: 0,
      expandable,
      expanded,
      change,
      previous: hasPrevious ? previous : undefined,
    });
    if (!expanded) return;

    const priorChildren = new Map(
      (previous === undefined ? [] : childrenOf(previous, child.type)).map((each) => [
        each.diffKey,
        each.value,
      ]),
    );
    const children = childrenOf(child.value, child.type);
    const omitted = omittedOf(child.value);
    const size = children.length + (omitted > 0 ? 1 : 0);
    children.forEach((each, index) => {
      visit(
        `${id}.${index}`,
        level + 1,
        index + 1,
        size,
        each,
        priorChildren.get(each.diffKey),
        priorChildren.has(each.diffKey),
      );
    });
    if (omitted > 0) {
      rows.push({
        id: `${id}.more`,
        level: level + 1,
        posInSet: size,
        setSize: size,
        label: null,
        separator: '',
        value: null,
        type: undefined,
        omitted,
        expandable: false,
        expanded: false,
        change: 'same',
        previous: undefined,
      });
    }
  };
  visit(
    ROOT_ROW,
    1,
    1,
    1,
    { label: options.label, separator: ': ', value, type: options.type },
    options.previous,
    options.previous !== undefined,
  );
  return rows;
}

export interface TreeKeyAction {
  focus?: string;
  toggle?: string;
}

function parentId(id: string): string | null {
  const cut = id.lastIndexOf('.');
  return cut < 0 ? null : id.slice(0, cut);
}

export function treeKeyAction(
  rows: readonly ValueRow[],
  focused: string,
  key: string,
): TreeKeyAction | null {
  const index = Math.max(
    0,
    rows.findIndex((row) => row.id === focused),
  );
  const row = rows[index];
  if (!row) return null;
  switch (key) {
    case 'ArrowDown': {
      const next = rows[index + 1];
      return next ? { focus: next.id } : null;
    }
    case 'ArrowUp': {
      const prev = rows[index - 1];
      return prev ? { focus: prev.id } : null;
    }
    case 'Home':
      return rows[0] ? { focus: rows[0].id } : null;
    case 'End': {
      const last = rows[rows.length - 1];
      return last ? { focus: last.id } : null;
    }
    case 'ArrowRight':
      if (!row.expandable) return null;
      if (!row.expanded) return { focus: row.id, toggle: row.id };
      return rows[index + 1] ? { focus: (rows[index + 1] as ValueRow).id } : null;
    case 'ArrowLeft': {
      if (row.expanded) return { focus: row.id, toggle: row.id };
      const parent = parentId(row.id);
      return parent ? { focus: parent } : null;
    }
    case 'Enter':
    case ' ':
      return row.expandable ? { focus: row.id, toggle: row.id } : null;
    default:
      return null;
  }
}
