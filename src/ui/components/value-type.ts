import type { Snapshot } from '../../engine/index.ts';
import { ALL_DIRS, dirName } from '../../engine/index.ts';
import { PLAYER_API } from '../../runtime/index.ts';

// A player-API type expression such as `TileView[]` or `MachineView | null`, or the field types
// of an unnamed object — the named arguments of a call.
export type TypeRef = string | { readonly [field: string]: string };

type Fields = ReadonlyMap<string, string>;

const FIELD_LINE = /^\s+(\w+)\??:\s*(.+);$/;

function interfaceFields(declaration: string): Fields | null {
  if (!declaration.startsWith('interface ')) return null;
  const fields = new Map<string, string>();
  for (const line of declaration.split('\n')) {
    const match = FIELD_LINE.exec(line);
    if (match) fields.set(match[1] as string, match[2] as string);
  }
  return fields;
}

// The inspector shows the engine's bot view, which the player API never declares; only the
// fields whose type has a name of its own are listed.
const INSPECTOR_TYPES: ReadonlyMap<string, Fields> = new Map([
  [
    'BotView',
    new Map([
      ['at', 'Vec'],
      ['facing', 'Dir'],
      ['inventory', 'ItemStack[]'],
    ]),
  ],
]);

const NAMED_TYPES: ReadonlyMap<string, Fields> = new Map([
  ...PLAYER_API.types.map((type): [string, Fields] => [
    type.name,
    interfaceFields(type.declaration) ?? new Map(),
  ]),
  ...INSPECTOR_TYPES,
]);

function kindOf(value: Snapshot): 'array' | 'object' | 'number' | 'other' {
  if (typeof value === 'number') return 'number';
  if (typeof value !== 'object' || value === null) return 'other';
  if (value.$ === 'array') return 'array';
  if (value.$ === 'object') return 'object';
  return 'other';
}

function memberFor(type: string, value: Snapshot): string | undefined {
  const members = type.split('|').map((member) => member.trim());
  switch (kindOf(value)) {
    case 'array':
      return members.find((member) => member.endsWith('[]'));
    case 'object':
      return members.find((member) => NAMED_TYPES.has(member) || member.startsWith('Record<'));
    case 'number':
      return members.find((member) => member === 'Dir');
    default:
      return undefined;
  }
}

export function typeName(type: TypeRef | undefined, value: Snapshot): string | null {
  if (typeof type !== 'string') return null;
  const member = memberFor(type, value);
  return member !== undefined && NAMED_TYPES.has(member) ? member : null;
}

export function fieldType(
  type: TypeRef | undefined,
  value: Snapshot,
  key: string,
): TypeRef | undefined {
  if (type === undefined) return undefined;
  if (typeof type !== 'string') return type[key];
  const member = memberFor(type, value);
  if (member === undefined) return undefined;
  const record = /^Record<string, (.+)>$/.exec(member);
  if (record) return record[1];
  return NAMED_TYPES.get(member)?.get(key);
}

export function itemType(type: TypeRef | undefined, value: Snapshot): TypeRef | undefined {
  if (typeof type !== 'string') return undefined;
  return memberFor(type, value)?.slice(0, -2);
}

export function enumText(type: TypeRef | undefined, value: Snapshot): string | null {
  if (typeof type !== 'string' || typeof value !== 'number') return null;
  if (memberFor(type, value) !== 'Dir') return null;
  if (!(ALL_DIRS as readonly number[]).includes(value)) return null;
  return `Dir.${dirName(value as (typeof ALL_DIRS)[number])}`;
}
