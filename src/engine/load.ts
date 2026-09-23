import { FED_BY } from './types.ts';
import type { Machine, World } from './types.ts';

export const CEILING = 'ceiling';

const DRAW = 'draw';
const LINKED = 'link:';

export interface TreeSegment {
  id: string;
  parent: string;
  ceiling: number;
  load: number;
}

function parentOf(machine: Machine): string | undefined {
  for (const [name, value] of Object.entries(machine.vars)) {
    if (value === 1 && name.startsWith(FED_BY)) return name.slice(FED_BY.length);
  }
  return undefined;
}

export function cabledTo(world: World): Map<string, string[]> {
  const cables = new Map<string, string[]>();
  const join = (a: string, b: string): void => {
    const list = cables.get(a) ?? [];
    list.push(b);
    cables.set(a, list);
  };
  for (const machine of world.machines) {
    for (const [name, value] of Object.entries(machine.vars)) {
      if (value !== 1 || !name.startsWith(LINKED)) continue;
      const other = name.slice(LINKED.length);
      join(machine.id, other);
      join(other, machine.id);
    }
  }
  return cables;
}

export function treeSegments(world: World): TreeSegment[] {
  const byId = new Map<string, Machine>();
  for (const machine of world.machines) byId.set(machine.id, machine);

  const segments = new Map<string, TreeSegment>();
  for (const machine of world.machines) {
    const ceiling = machine.vars[CEILING];
    const parent = parentOf(machine);
    if (typeof ceiling !== 'number' || parent === undefined) continue;
    segments.set(machine.id, { id: machine.id, parent, ceiling, load: 0 });
  }
  if (segments.size === 0) return [];

  const cables = cabledTo(world);
  for (const consumer of world.machines) {
    const draw = consumer.vars[DRAW];
    if (typeof draw !== 'number') continue;
    for (const end of cables.get(consumer.id) ?? []) {
      const seen = new Set<string>();
      for (let at = segments.get(end); at && !seen.has(at.id); at = segments.get(at.parent)) {
        seen.add(at.id);
        at.load += draw;
      }
    }
  }
  return [...segments.values()].filter((segment) => byId.has(segment.parent));
}
