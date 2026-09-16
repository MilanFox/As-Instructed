import type { Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, ItemKind, Terrain, dirBetween } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

const QUOTA = 5;
const CUT = 2;
const OVER = 12;
const ROUNDS = 4000;

const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;
const parse = (id: string): Vec => {
  const [x = '0', y = '0'] = id.split(',');
  return { x: Number(x), y: Number(y) };
};
const around = (at: Vec): Vec[] => [
  { x: at.x, y: at.y - 1 },
  { x: at.x + 1, y: at.y },
  { x: at.x, y: at.y + 1 },
  { x: at.x - 1, y: at.y },
];
const solid = (at: Vec): boolean => at.x % 2 === 0 && at.y % 2 === 0;

interface Reach {
  cost: Map<string, number>;
  via: Map<string, Vec>;
}

interface Target {
  stand: Vec;
  face: Vec;
  out: number;
  deep: boolean;
}

export const solution: ReferenceSolution = {
  levelId: 'w4-04',
  run(sim: Sim, botId: number): void {
    const home = sim.pos(botId);
    const deepest = (sim.fuel(botId) - CUT - OVER) / 2;
    const ground = new Map<string, Terrain>();
    const walkable = new Map<string, boolean>();
    const cut = new Set<string>();
    let mined = 0;
    let deepCut = false;

    const observe = (): void => {
      const at = sim.pos(botId);
      walkable.set(key(at), true);
      for (const dir of ALL_DIRS) {
        for (const view of sim.look(botId, dir)) {
          if (!view.inBounds) break;
          ground.set(key(view.at), view.terrain);
          walkable.set(key(view.at), view.walkable);
        }
      }
    };

    const isOpen = (at: Vec): boolean => walkable.get(key(at)) === true;
    const isDry = (at: Vec): boolean =>
      around(at).some((side) => ground.get(key(side)) === Terrain.Rubble);
    const halfLit = (at: Vec): boolean =>
      around(at).some((side) => !walkable.has(key(side)) && !solid(side));

    const flood = (from: Vec): Reach => {
      const cost = new Map<string, number>([[key(from), 0]]);
      const via = new Map<string, Vec>();
      const queue: Vec[] = [from];
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as Vec;
        const base = cost.get(key(at)) ?? 0;
        for (const next of around(at)) {
          if (!isOpen(next) || isDry(next) || cost.has(key(next))) continue;
          cost.set(key(next), base + 1);
          via.set(key(next), at);
          queue.push(next);
        }
      }
      return { cost, via };
    };

    const trail = (via: Map<string, Vec>, from: Vec, to: Vec): Vec[] => {
      const route: Vec[] = [];
      let at = to;
      while (key(at) !== key(from)) {
        route.push(at);
        const back = via.get(key(at));
        if (back === undefined) return [];
        at = back;
      }
      return route.reverse();
    };

    const drive = (route: readonly Vec[]): void => {
      for (const next of route) {
        const dir = dirBetween(sim.pos(botId), next);
        if (dir === null || !sim.move(botId, dir)) return;
        observe();
      }
    };

    observe();

    for (let round = 0; round < ROUNDS; round++) {
      const here = flood(sim.pos(botId));
      const homeward = flood(home).cost;
      const fuel = sim.fuel(botId);
      const done = mined >= QUOTA && deepCut;

      let target: Target | null = null;
      for (const [id, terrain] of ground) {
        if (done || terrain !== Terrain.Ore || cut.has(id)) continue;
        const face = parse(id);
        const stand = around(face).find((side) => isOpen(side));
        if (stand === undefined) continue;
        const out = here.cost.get(key(stand));
        const legs = homeward.get(key(stand));
        if (out === undefined || legs === undefined) continue;
        const deep = legs >= deepest;
        if (mined >= QUOTA && !deep) continue;
        if (out + CUT + legs > fuel) continue;
        if (target === null || out < target.out) target = { stand, face, out, deep };
      }
      if (target !== null) {
        drive(trail(here.via, sim.pos(botId), target.stand));
        const dir = dirBetween(sim.pos(botId), target.face);
        if (dir !== null && sim.mine(botId, dir) === ItemKind.Ore) {
          mined += 1;
          if (target.deep) deepCut = true;
        }
        cut.add(key(target.face));
        observe();
        continue;
      }

      let goal: Vec | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const [id, out] of here.cost) {
        if (done) continue;
        const legs = homeward.get(id);
        if (legs === undefined || legs > deepest) continue;
        const tile = parse(id);
        if (!halfLit(tile)) continue;
        if (out + legs + CUT > fuel) continue;
        if (out - legs < best) {
          best = out - legs;
          goal = tile;
        }
      }
      if (goal !== null) {
        drive(trail(here.via, sim.pos(botId), goal));
        continue;
      }

      if (key(sim.pos(botId)) !== key(home)) {
        drive(trail(here.via, sim.pos(botId), home));
        continue;
      }
      if (done || !sim.refuel(botId) || sim.fuel(botId) <= fuel) break;
    }
  },
  source: [
    '// The tank is the survey. It holds the drive out to the deepest face, the cut,',
    '// the drive back and twelve tiles over, so the deepest face is (fuel() - 14) / 2',
    '// out and nothing needs looking at beyond that ring.',
    'const QUOTA = 5;',
    'const CUT = 2;',
    'const home = pos();',
    'const deepest = (fuel() - CUT - 12) / 2;',
    'const ground = new Map();',
    'const walkable = new Map();',
    'const cut = new Set();',
    'let mined = 0;',
    'let deepCut = false;',
    '',
    'const k = (p) => `${p.x},${p.y}`;',
    'const parse = (id) => ({ x: Number(id.split(",")[0]), y: Number(id.split(",")[1]) });',
    'const around = (p) => [',
    '  { x: p.x, y: p.y - 1 },',
    '  { x: p.x + 1, y: p.y },',
    '  { x: p.x, y: p.y + 1 },',
    '  { x: p.x - 1, y: p.y },',
    '];',
    '// An even x with an even y is always rock, so it is never worth walking to.',
    'const solid = (p) => p.x % 2 === 0 && p.y % 2 === 0;',
    '',
    'function observe() {',
    '  walkable.set(k(pos()), true);',
    '  for (const d of [Dir.North, Dir.East, Dir.South, Dir.West]) {',
    '    for (const v of look(d)) {',
    '      if (!v.inBounds) break;',
    '      ground.set(k(v.at), v.terrain);',
    '      walkable.set(k(v.at), v.walkable);',
    '    }',
    '  }',
    '}',
    'const isOpen = (p) => walkable.get(k(p)) === true;',
    '// Spoil beside a tile means that tile is the blind end of an empty passage.',
    'const isDry = (p) => around(p).some((s) => ground.get(k(s)) === Terrain.Rubble);',
    'const halfLit = (p) => around(p).some((s) => !walkable.has(k(s)) && !solid(s));',
    '',
    'function flood(from) {',
    '  const cost = new Map([[k(from), 0]]);',
    '  const via = new Map();',
    '  const queue = [from];',
    '  for (let head = 0; head < queue.length; head++) {',
    '    const at = queue[head];',
    '    for (const next of around(at)) {',
    '      if (!isOpen(next) || isDry(next) || cost.has(k(next))) continue;',
    '      cost.set(k(next), cost.get(k(at)) + 1);',
    '      via.set(k(next), at);',
    '      queue.push(next);',
    '    }',
    '  }',
    '  return { cost, via };',
    '}',
    'function trail(via, from, to) {',
    '  const route = [];',
    '  let at = to;',
    '  while (k(at) !== k(from)) {',
    '    route.push(at);',
    '    at = via.get(k(at));',
    '    if (!at) return [];',
    '  }',
    '  return route.reverse();',
    '}',
    'function drive(route) {',
    '  for (const next of route) {',
    '    const at = pos();',
    '    const d =',
    '      next.x > at.x ? Dir.East : next.x < at.x ? Dir.West : next.y > at.y ? Dir.South : Dir.North;',
    '    if (!move(d)) return;',
    '    observe();',
    '  }',
    '}',
    '',
    'observe();',
    'for (let round = 0; round < 4000; round++) {',
    '  const here = flood(pos());',
    '  const homeward = flood(home).cost;',
    '  const tank = fuel();',
    '  const done = mined >= QUOTA && deepCut;',
    '',
    '  // Cut whatever is affordable, nearest first, and always keep the way home.',
    '  let target = null;',
    '  for (const [id, terrain] of ground) {',
    '    if (done || terrain !== Terrain.Ore || cut.has(id)) continue;',
    '    const face = parse(id);',
    '    const stand = around(face).find((s) => isOpen(s));',
    '    if (!stand) continue;',
    '    const out = here.cost.get(k(stand));',
    '    const legs = homeward.get(k(stand));',
    '    if (out === undefined || legs === undefined) continue;',
    '    const deep = legs >= deepest;',
    '    if (mined >= QUOTA && !deep) continue;',
    '    if (out + CUT + legs > tank) continue;',
    '    if (!target || out < target.out) target = { stand, face, out, deep };',
    '  }',
    '  if (target) {',
    '    drive(trail(here.via, pos(), target.stand));',
    '    const at = pos();',
    '    const f = target.face;',
    '    const d = f.x > at.x ? Dir.East : f.x < at.x ? Dir.West : f.y > at.y ? Dir.South : Dir.North;',
    '    if (mine(d) === ItemKind.Ore) {',
    '      mined += 1;',
    '      if (target.deep) deepCut = true;',
    '    }',
    '    cut.add(k(target.face));',
    '    observe();',
    '    continue;',
    '  }',
    '',
    '  // Otherwise read somewhere new: close to the bot, far from the lift.',
    '  let goal = null;',
    '  let best = Infinity;',
    '  for (const [id, out] of here.cost) {',
    '    if (done) continue;',
    '    const legs = homeward.get(id);',
    '    if (legs === undefined || legs > deepest) continue;',
    '    const tile = parse(id);',
    '    if (!halfLit(tile)) continue;',
    '    if (out + legs + CUT > tank) continue;',
    '    if (out - legs < best) {',
    '      best = out - legs;',
    '      goal = tile;',
    '    }',
    '  }',
    '  if (goal) {',
    '    drive(trail(here.via, pos(), goal));',
    '    continue;',
    '  }',
    '',
    '  if (k(pos()) !== k(home)) {',
    '    drive(trail(here.via, pos(), home));',
    '    continue;',
    '  }',
    '  if (done || !refuel() || fuel() <= tank) break;',
    '}',
  ].join('\n'),
};
