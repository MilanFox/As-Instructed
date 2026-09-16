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

    for (const kind of CLASSES) {
      const bay = sim.probe(botId, `${DEPOT_PREFIX}${kind}`);
      if (!bay) continue;
      bays.set(kind, bay.at);
      sim.print(botId, `bay ${bay.id} ${String(bay.at.x)} ${String(bay.at.y)}`);
    }

    observe();
    let capacity = Number.POSITIVE_INFINITY;
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
          if (!CLASSES.includes(stack.kind)) continue;
          if (sim.inventory(botId) >= capacity) break;
          if (sim.pickup(botId, stack.kind, stack.count) < stack.count) {
            capacity = sim.inventory(botId);
          }
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
    'const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];',
    'const seen = new Map();',
    'const bays = new Map();',
    'let cap = Infinity;',
    '',
    'const key = (at) => at.x + "," + at.y;',
    'const note = (v) => { if (v.inBounds) seen.set(key(v.at), v); };',
    '',
    '// free: the tile underfoot, then a ray each way, then any bay it just learned about',
    'const observe = () => {',
    '  note(scan());',
    '  for (let d = 0; d < 4; d++) look(d, 64).forEach(note);',
    '  for (const v of seen.values()) {',
    '    const id = v.machineId;',
    '    if (!id || !id.startsWith("depot-") || bays.has(id.slice(6))) continue;',
    '    bays.set(id.slice(6), key(probe(id).at));',
    '  }',
    '};',
    '',
    'const open = (at) => { const v = seen.get(key(at)); return v && v.walkable; };',
    'const crateAt = (at) => {',
    '  const v = seen.get(key(at));',
    '  if (!v || [...bays.values()].includes(key(at))) return false;',
    '  return v.items.some((s) => KINDS.includes(s.kind));',
    '};',
    'const edgeAt = (at) => open(at) && STEPS.some((s) => {',
    '  const n = { x: at.x + s[0], y: at.y + s[1] };',
    '  return n.x >= 0 && n.y >= 0 && n.x < 34 && n.y < 26 && !seen.has(key(n));',
    '});',
    '',
    '// nearest tile that answers `wanted`, over ground already seen, with the way there',
    'const route = (wanted) => {',
    '  const from = pos();',
    '  const back = new Map([[key(from), []]]);',
    '  const queue = [from];',
    '  for (let head = 0; head < queue.length; head++) {',
    '    const at = queue[head];',
    '    const path = back.get(key(at));',
    '    if (wanted(at)) return { cost: path.length, path };',
    '    for (let d = 0; d < 4; d++) {',
    '      const next = { x: at.x + STEPS[d][0], y: at.y + STEPS[d][1] };',
    '      if (back.has(key(next)) || !open(next)) continue;',
    '      back.set(key(next), [...path, d]);',
    '      queue.push(next);',
    '    }',
    '  }',
    '  return null;',
    '};',
    '',
    'const walk = (leg) => { for (const d of leg.path) { move(d); observe(); } };',
    '',
    '// a pickup that takes less than it was offered is the arms saying they are full',
    'const load = () => {',
    '  for (const s of scan().items) {',
    '    if (!KINDS.includes(s.kind) || inventory() >= cap) continue;',
    '    if (pickup(s.kind, s.count) < s.count) cap = inventory();',
    '  }',
    '  note(scan());',
    '};',
    '',
    '// a bay answers to its id from anywhere, and asking costs nothing',
    'for (const k of KINDS) {',
    '  const bay = probe("depot-" + k);',
    '  if (!bay) continue;',
    '  bays.set(k, key(bay.at));',
    '  print("bay depot-" + k + " " + bay.at.x + " " + bay.at.y);',
    '}',
    '',
    'observe();',
    'for (let guard = 0; guard < 34 * 26; guard++) {',
    '  const room = cap - inventory();',
    '  const held = carrying().filter((k) => bays.has(k));',
    '  const toBay = held.length',
    '    ? route((at) => held.some((k) => bays.get(k) === key(at)))',
    '    : null;',
    '  const toCrate = room > 0 ? route(crateAt) : null;',
    '  const toEdge = route(edgeAt);',
    '  const other = Math.min(toCrate ? toCrate.cost : Infinity, toEdge ? toEdge.cost : Infinity);',
    '',
    '  if (toBay && (room === 0 || toBay.cost <= other)) {',
    '    walk(toBay);',
    '    for (const k of carrying()) if (bays.get(k) === key(pos())) drop(k, inventory(k));',
    '  } else if (toCrate) {',
    '    walk(toCrate);',
    '    load();',
    '  } else if (toEdge) {',
    '    walk(toEdge);',
    '  } else {',
    '    break;',
    '  }',
    '}',
  ].join('\n'),
};
