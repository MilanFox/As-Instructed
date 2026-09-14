import type { Dir, Sim, TileView, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

type Key = string;

const key = (x: number, y: number): Key => `${x},${y}`;
const parse = (k: Key): Vec => {
  const [x = '0', y = '0'] = k.split(',');
  return { x: Number(x), y: Number(y) };
};
const around = (k: Key): Key[] => {
  const at = parse(k);
  return [key(at.x, at.y - 1), key(at.x + 1, at.y), key(at.x, at.y + 1), key(at.x - 1, at.y)];
};
const towards = (from: Vec, to: Vec): Dir =>
  (to.y < from.y ? 0 : to.x > from.x ? 1 : to.y > from.y ? 2 : 3) as Dir;

export const solution: ReferenceSolution = {
  levelId: 'w4-03',
  run(sim: Sim, botId: number): void {
    const open = new Map<Key, boolean>();
    const terrain = new Map<Key, string>();

    const note = (view: TileView): void => {
      const k = key(view.at.x, view.at.y);
      open.set(k, view.walkable);
      terrain.set(k, view.terrain);
    };

    const senseHere = (): void => {
      note(sim.scan(botId));
      for (const dir of ALL_DIRS) for (const view of sim.look(botId, dir)) note(view);
    };

    const isLanding = (k: Key): boolean =>
      terrain.get(k) === Terrain.Pad || terrain.get(k) === Terrain.Depot;
    const unfinished = (k: Key): boolean =>
      open.get(k) === true && !isLanding(k) && !around(k).every((n) => open.has(n));

    const routeTo = (from: Key, goal: (k: Key) => boolean): Key[] | null => {
      const previous = new Map<Key, Key>();
      const seen = new Set<Key>([from]);
      const queue: Key[] = [from];
      let found: Key | null = null;
      for (let head = 0; head < queue.length && found === null; head++) {
        const at = queue[head] as Key;
        if (at !== from && goal(at)) {
          found = at;
          break;
        }
        for (const next of around(at)) {
          if (seen.has(next) || open.get(next) !== true) continue;
          seen.add(next);
          previous.set(next, at);
          queue.push(next);
        }
      }
      if (found === null) return null;
      const route: Key[] = [];
      for (let cursor = found; cursor !== from;) {
        route.push(cursor);
        cursor = previous.get(cursor) as Key;
      }
      return route.reverse();
    };

    const distance = (from: Key, to: Key): number => {
      const route = routeTo(from, (k) => k === to);
      return route === null ? Number.POSITIVE_INFINITY : route.length;
    };

    const walk = (route: Key[]): void => {
      for (const next of route) sim.move(botId, towards(sim.pos(botId), parse(next)));
    };

    const origin = sim.pos(botId);
    const start = key(origin.x, origin.y);

    for (;;) {
      senseHere();
      const here = sim.pos(botId);
      const route = routeTo(key(here.x, here.y), unfinished);
      if (route === null || route.length === 0) break;
      walk(route.slice(0, 1));
    }

    const pads = [...terrain.keys()].filter((k) => terrain.get(k) === Terrain.Pad);
    const lift = [...terrain.keys()].find((k) => terrain.get(k) === Terrain.Depot);
    if (lift === undefined || pads.length < 3) return;

    const orders: Key[][] = [];
    for (const a of pads) {
      for (const b of pads) {
        for (const c of pads) {
          if (a === b || b === c || a === c) continue;
          orders.push([a, b, c]);
        }
      }
    }
    let best = orders[0] as Key[];
    let bestCost = Number.POSITIVE_INFINITY;
    for (const order of orders) {
      const stops = [start, ...order, lift];
      let cost = 0;
      for (let n = 1; n < stops.length; n++) cost += distance(stops[n - 1] as Key, stops[n] as Key);
      if (cost < bestCost) {
        bestCost = cost;
        best = order;
      }
    }

    for (const stop of [...best, lift]) {
      const here = sim.pos(botId);
      const route = routeTo(key(here.x, here.y), (k) => k === stop);
      if (route !== null) walk(route);
    }
  },
  source: [
    'const open = new Map();',
    'const ground = new Map();',
    'const key = (x, y) => x + "," + y;',
    'const parse = (k) => ({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]) });',
    'const around = (k) => {',
    '  const a = parse(k);',
    '  return [key(a.x, a.y - 1), key(a.x + 1, a.y), key(a.x, a.y + 1), key(a.x - 1, a.y)];',
    '};',
    'const towards = (f, t) => (t.y < f.y ? 0 : t.x > f.x ? 1 : t.y > f.y ? 2 : 3);',
    'const note = (v) => { open.set(key(v.at.x, v.at.y), v.walkable);',
    '  ground.set(key(v.at.x, v.at.y), v.terrain); };',
    'const senseHere = () => {',
    '  note(scan());',
    '  for (const d of [Dir.North, Dir.East, Dir.South, Dir.West]) look(d).forEach(note);',
    '};',
    'const landing = (k) => ground.get(k) === Terrain.Pad || ground.get(k) === Terrain.Depot;',
    'const unfinished = (k) =>',
    '  open.get(k) === true && !landing(k) && !around(k).every((n) => open.has(n));',
    'const routeTo = (from, goal) => {',
    '  const previous = new Map();',
    '  const seen = new Set([from]);',
    '  const queue = [from];',
    '  let found = null;',
    '  for (let head = 0; head < queue.length && found === null; head++) {',
    '    const at = queue[head];',
    '    if (at !== from && goal(at)) { found = at; break; }',
    '    for (const next of around(at)) {',
    '      if (seen.has(next) || open.get(next) !== true) continue;',
    '      seen.add(next);',
    '      previous.set(next, at);',
    '      queue.push(next);',
    '    }',
    '  }',
    '  if (found === null) return null;',
    '  const route = [];',
    '  for (let c = found; c !== from; c = previous.get(c)) route.push(c);',
    '  return route.reverse();',
    '};',
    'const distance = (a, b) => {',
    '  const route = routeTo(a, (k) => k === b);',
    '  return route === null ? Infinity : route.length;',
    '};',
    'const walk = (route) => { for (const n of route) move(towards(pos(), parse(n))); };',
    'const start = key(pos().x, pos().y);',
    'for (;;) {',
    '  senseHere();',
    '  const route = routeTo(key(pos().x, pos().y), unfinished);',
    '  if (route === null || route.length === 0) break;',
    '  walk(route.slice(0, 1));',
    '}',
    'const pads = [...ground.keys()].filter((k) => ground.get(k) === Terrain.Pad);',
    'const lift = [...ground.keys()].find((k) => ground.get(k) === Terrain.Depot);',
    'const orders = [];',
    'for (const a of pads) for (const b of pads) for (const c of pads) {',
    '  if (a !== b && b !== c && a !== c) orders.push([a, b, c]);',
    '}',
    'let best = orders[0];',
    'let bestCost = Infinity;',
    'for (const order of orders) {',
    '  const stops = [start, ...order, lift];',
    '  let cost = 0;',
    '  for (let n = 1; n < stops.length; n++) cost += distance(stops[n - 1], stops[n]);',
    '  if (cost < bestCost) { bestCost = cost; best = order; }',
    '}',
    'for (const stop of [...best, lift]) {',
    '  const route = routeTo(key(pos().x, pos().y), (k) => k === stop);',
    '  if (route !== null) walk(route);',
    '}',
  ].join('\n'),
};
