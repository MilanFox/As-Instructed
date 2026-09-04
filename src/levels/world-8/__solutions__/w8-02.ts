import type { ItemKind, Sim, TileView, Vec } from '../../../engine/index.ts';
import { eq, step } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { KnownMap, follow } from '../shared.ts';

const DEPOT_W = 34;
const DEPOT_H = 26;
const DEPOT_PREFIX = 'depot-';
const CLASSES: readonly string[] = ['ore', 'ice', 'scrap', 'part', 'cell', 'chip'];

interface Leg {
  to: Vec;
  cost: number;
}

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * One loop, three moves it can make, and the whole level is the order it picks them in:
 *
 * 1. carrying something whose bay is known, and that bay is no further than the next thing
 *    worth walking to (or the arms are full) — go and drop it;
 * 2. otherwise walk to the nearest crate that has been seen and not yet lifted;
 * 3. otherwise walk to the nearest edge of what has been seen.
 *
 * The map is a `KnownMap` fed only by `scan` and `look` from tiles the bot has actually stood on,
 * so nothing here can path through a wall the player would not have seen either. Not an optimal
 * router: it is the intended heuristic, and par is derived from it.
 */
export const solution: ReferenceSolution = {
  levelId: 'w8-02',
  run(sim: Sim, botId: number): void {
    const map = new KnownMap({ w: DEPOT_W, h: DEPOT_H });
    const bays = new Map<string, Vec>();

    const observe = (): void => {
      map.observe(sim, botId, 64);
      for (const view of map.where((v) => v.machineId !== null)) {
        const id = view.machineId as string;
        if (!id.startsWith(DEPOT_PREFIX)) continue;
        const kind = id.slice(DEPOT_PREFIX.length);
        if (bays.has(kind)) continue;
        const machine = sim.probe(botId, id);
        if (machine) bays.set(kind, machine.at);
      }
    };

    const isBay = (at: Vec): boolean => {
      for (const bay of bays.values()) if (eq(bay, at)) return true;
      return false;
    };

    const hasCrate = (view: TileView | undefined): boolean =>
      view !== undefined &&
      view.items.some((stack) => CLASSES.includes(stack.kind)) &&
      !isBay(view.at);

    const nearest = (wanted: (at: Vec) => boolean): Leg | null => {
      const from = sim.pos(botId);
      const path = map.pathToNearest(from, wanted);
      if (path === null) return null;
      let at = from;
      for (const dir of path) at = step(at, dir);
      return { to: at, cost: path.length };
    };

    const walkTo = (to: Vec): void => {
      follow(sim, botId, map, to, { onStep: () => observe() });
    };

    observe();
    const capacity = sim.capacity(botId);
    const guardLimit = DEPOT_W * DEPOT_H;

    for (let guard = 0; guard < guardLimit; guard++) {
      const room = capacity - sim.inventory(botId);
      const holding = sim.carrying(botId).filter((kind) => bays.has(kind));

      const toBay =
        holding.length > 0
          ? nearest((at) => holding.some((kind) => eq(bays.get(kind) as Vec, at)))
          : null;
      const toCrate = room > 0 ? nearest((at) => hasCrate(map.view(at))) : null;
      const toEdge = nearest((at) => map.isFrontier(at));

      const next = Math.min(
        toCrate?.cost ?? Number.POSITIVE_INFINITY,
        toEdge?.cost ?? Number.POSITIVE_INFINITY,
      );

      if (toBay !== null && (room === 0 || toBay.cost <= next)) {
        walkTo(toBay.to);
        const here = sim.pos(botId);
        for (const kind of sim.carrying(botId)) {
          const bay = bays.get(kind);
          if (bay && eq(bay, here)) sim.drop(botId, kind as ItemKind, sim.inventory(botId, kind));
        }
        continue;
      }

      if (toCrate !== null) {
        walkTo(toCrate.to);
        for (const stack of sim.scan(botId).items) {
          const space = capacity - sim.inventory(botId);
          if (space <= 0) break;
          if (!CLASSES.includes(stack.kind)) continue;
          sim.pickup(botId, stack.kind, Math.min(stack.count, space));
        }
        map.record(sim.scan(botId));
        continue;
      }

      if (toEdge !== null) {
        walkTo(toEdge.to);
        continue;
      }
      break;
    }
  },
  source: [
    'const KINDS = ["ore", "ice", "scrap", "part", "cell", "chip"];',
    'const map = new KnownMap(34, 26);',
    'const bays = new Map();',
    '',
    'const observe = () => {',
    '  map.observe();',
    '  for (const view of map.where((v) => v.machineId)) {',
    '    const kind = view.machineId.slice(6);',
    '    if (!bays.has(kind)) bays.set(kind, probe(view.machineId).at);',
    '  }',
    '};',
    '',
    'const isBay = (at) => [...bays.values()].some((b) => b.x === at.x && b.y === at.y);',
    'const hasCrate = (at) => {',
    '  const view = map.view(at);',
    '  return view && view.items.some((s) => KINDS.includes(s.kind)) && !isBay(at);',
    '};',
    '',
    'const nearest = (wanted) => {',
    '  const path = map.pathToNearest(pos(), wanted);',
    '  if (!path) return null;',
    '  let at = pos();',
    '  for (const dir of path) at = stepped(at, dir);',
    '  return { to: at, cost: path.length };',
    '};',
    '',
    'const walkTo = (to) => follow(map, to, observe);',
    '',
    'observe();',
    'const cap = capacity();',
    '',
    'for (let guard = 0; guard < 34 * 26; guard++) {',
    '  const room = cap - inventory();',
    '  const held = carrying().filter((k) => bays.has(k));',
    '  const toBay = held.length',
    '    ? nearest((at) => held.some((k) => bays.get(k).x === at.x && bays.get(k).y === at.y))',
    '    : null;',
    '  const toCrate = room > 0 ? nearest(hasCrate) : null;',
    '  const toEdge = nearest((at) => map.isFrontier(at));',
    '  const next = Math.min(toCrate ? toCrate.cost : Infinity, toEdge ? toEdge.cost : Infinity);',
    '',
    '  if (toBay && (room === 0 || toBay.cost <= next)) {',
    '    walkTo(toBay.to);',
    '    for (const k of carrying()) {',
    '      const bay = bays.get(k);',
    '      if (bay.x === pos().x && bay.y === pos().y) drop(k, inventory(k));',
    '    }',
    '  } else if (toCrate) {',
    '    walkTo(toCrate.to);',
    '    for (const s of scan().items) {',
    '      const space = cap - inventory();',
    '      if (space <= 0) break;',
    '      if (KINDS.includes(s.kind)) pickup(s.kind, Math.min(s.count, space));',
    '    }',
    '    map.record(scan());',
    '  } else if (toEdge) {',
    '    walkTo(toEdge.to);',
    '  } else {',
    '    break;',
    '  }',
    '}',
  ].join('\n'),
};
