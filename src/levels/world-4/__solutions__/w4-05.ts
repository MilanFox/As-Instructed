import type { Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, ItemKind, Terrain, dirBetween, manhattan, step } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Explore and exploit out of one tank. Every stop casts four free rays, which is enough to see a
 * vein at the far end of a corridor the bot never enters. The map the rays build is what makes
 * the route home computable, so before each errand the bot prices the trip *and* the trip back
 * and refuses anything it cannot pay for. Not an optimal tour — deliberately: the level is
 * priced against reserving a route home, not against the best survey.
 */

const RANGE = 14;
const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;

interface Survey {
  open: Map<string, Vec>;
  seen: Set<string>;
  veins: Map<string, Vec>;
}

function record(survey: Survey, at: Vec, terrain: Terrain, walkable: boolean): void {
  survey.seen.add(key(at));
  if (walkable) survey.open.set(key(at), at);
  else if (terrain === Terrain.Ore) survey.veins.set(key(at), at);
}

/** Steps out of `from` over surveyed open ground. Returns the cost map and the way back. */
function reachable(survey: Survey, from: Vec): { cost: Map<string, number>; via: Map<string, Vec> } {
  const cost = new Map<string, number>([[key(from), 0]]);
  const via = new Map<string, Vec>();
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    const here = cost.get(key(at)) ?? 0;
    for (const dir of ALL_DIRS) {
      const next = step(at, dir);
      if (!survey.open.has(key(next)) || cost.has(key(next))) continue;
      cost.set(key(next), here + 1);
      via.set(key(next), at);
      queue.push(next);
    }
  }
  return { cost, via };
}

function pathTo(via: Map<string, Vec>, from: Vec, to: Vec): Vec[] {
  const route: Vec[] = [];
  let at = to;
  while (key(at) !== key(from)) {
    route.push(at);
    const back = via.get(key(at));
    if (!back) return [];
    at = back;
  }
  return route.reverse();
}

export const solution: ReferenceSolution = {
  levelId: 'w4-05',
  run(sim: Sim, botId: number): void {
    const home = sim.pos(botId);
    const survey: Survey = { open: new Map([[key(home), home]]), seen: new Set([key(home)]), veins: new Map() };
    const cut = new Set<string>();

    const observe = (): void => {
      const at = sim.pos(botId);
      survey.seen.add(key(at));
      survey.open.set(key(at), at);
      for (const dir of ALL_DIRS) {
        for (const view of sim.look(botId, dir, RANGE)) {
          if (!view.inBounds) break;
          record(survey, view.at, view.terrain, view.walkable);
        }
      }
    };

    const walk = (route: readonly Vec[]): void => {
      for (const next of route) {
        const dir = dirBetween(sim.pos(botId), next);
        if (dir === null || !sim.move(botId, dir)) return;
        observe();
      }
    };

    observe();

    for (let round = 0; round < 400; round++) {
      const have = sim.inventory(botId, ItemKind.Ore);
      if (have >= 5) break;

      const at = sim.pos(botId);
      const { cost, via } = reachable(survey, at);
      const homeward = reachable(survey, home).cost;
      const budget = sim.fuel(botId);

      // A vein first: it is the only thing that finishes the job.
      let bestVein: { stand: Vec; face: Vec; price: number } | null = null;
      for (const [id, face] of survey.veins) {
        if (cut.has(id)) continue;
        for (const dir of ALL_DIRS) {
          const stand = step(face, dir);
          const out = cost.get(key(stand));
          const back = homeward.get(key(stand));
          if (out === undefined || back === undefined) continue;
          const price = out + 2 + back;
          if (price > budget) continue;
          if (!bestVein || out < bestVein.price) bestVein = { stand, face, price: out };
        }
      }
      if (bestVein) {
        walk(pathTo(via, at, bestVein.stand));
        const dir = dirBetween(sim.pos(botId), bestVein.face);
        if (dir !== null) sim.mine(botId, dir);
        cut.add(key(bestVein.face));
        observe();
        continue;
      }

      // Otherwise buy information, but never more of it than the way home costs.
      const reserve = (5 - have) * 2 + 2;
      let frontier: Vec | null = null;
      let cheapest = Number.POSITIVE_INFINITY;
      for (const [id, tile] of survey.open) {
        const out = cost.get(id);
        const back = homeward.get(id);
        if (out === undefined || back === undefined || out === 0) continue;
        if (out + back + reserve > budget) continue;
        const unknown = ALL_DIRS.some((dir) => !survey.seen.has(key(step(tile, dir))));
        if (!unknown) continue;
        const score = out * 2 + manhattan(tile, home);
        if (score < cheapest) {
          cheapest = score;
          frontier = tile;
        }
      }
      if (!frontier) break;
      walk(pathTo(via, at, frontier));
    }

    const at = sim.pos(botId);
    if (key(at) !== key(home)) {
      const { via } = reachable(survey, at);
      walk(pathTo(via, at, home));
    }
  },
  source: [
    '// Four free rays at every stop; the map they build is what makes the way home a number.',
    'const home = pos();',
    'const open = new Map([[`${home.x},${home.y}`, home]]);',
    'const seen = new Set([`${home.x},${home.y}`]);',
    'const veins = new Map();',
    'const cut = new Set();',
    'const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    'const k = (p) => `${p.x},${p.y}`;',
    'const stepTo = (p, d) => ({',
    '  x: p.x + (d === Dir.East ? 1 : d === Dir.West ? -1 : 0),',
    '  y: p.y + (d === Dir.South ? 1 : d === Dir.North ? -1 : 0),',
    '});',
    'function observe() {',
    '  const at = pos();',
    '  seen.add(k(at)); open.set(k(at), at);',
    '  for (const d of dirs) {',
    '    for (const v of look(d, 14)) {',
    '      if (!v.inBounds) break;',
    '      seen.add(k(v.at));',
    '      if (v.walkable) open.set(k(v.at), v.at);',
    '      else if (v.terrain === Terrain.Ore) veins.set(k(v.at), v.at);',
    '    }',
    '  }',
    '}',
    'function flood(from) {',
    '  const cost = new Map([[k(from), 0]]); const via = new Map(); const q = [from];',
    '  for (let i = 0; i < q.length; i++) {',
    '    const at = q[i];',
    '    for (const d of dirs) {',
    '      const n = stepTo(at, d);',
    '      if (!open.has(k(n)) || cost.has(k(n))) continue;',
    '      cost.set(k(n), cost.get(k(at)) + 1); via.set(k(n), at); q.push(n);',
    '    }',
    '  }',
    '  return { cost, via };',
    '}',
    'function route(via, from, to) {',
    '  const out = []; let at = to;',
    '  while (k(at) !== k(from)) { out.push(at); at = via.get(k(at)); if (!at) return []; }',
    '  return out.reverse();',
    '}',
    'function drive(path) {',
    '  for (const n of path) {',
    '    const at = pos();',
    '    const d = n.x > at.x ? Dir.East : n.x < at.x ? Dir.West : n.y > at.y ? Dir.South : Dir.North;',
    '    if (!move(d)) return;',
    '    observe();',
    '  }',
    '}',
    'observe();',
    'for (let round = 0; round < 400; round++) {',
    '  const have = inventory(ItemKind.Ore);',
    '  if (have >= 5) break;',
    '  const at = pos();',
    '  const here = flood(at);',
    '  const back = flood(home).cost;',
    '  const budget = fuel();',
    '  let best = null;',
    '  for (const [id, face] of veins) {',
    '    if (cut.has(id)) continue;',
    '    for (const d of dirs) {',
    '      const stand = stepTo(face, d);',
    '      const out = here.cost.get(k(stand)); const home2 = back.get(k(stand));',
    '      if (out === undefined || home2 === undefined) continue;',
    '      if (out + 2 + home2 > budget) continue;',
    '      if (!best || out < best.out) best = { stand, face, out };',
    '    }',
    '  }',
    '  if (best) {',
    '    drive(route(here.via, at, best.stand));',
    '    const p = pos();',
    '    const d = best.face.x > p.x ? Dir.East : best.face.x < p.x ? Dir.West : best.face.y > p.y ? Dir.South : Dir.North;',
    '    mine(d); cut.add(k(best.face)); observe();',
    '    continue;',
    '  }',
    '  const reserve = (5 - have) * 2 + 2;',
    '  let front = null; let score = Infinity;',
    '  for (const [id, tile] of open) {',
    '    const out = here.cost.get(id); const home2 = back.get(id);',
    '    if (out === undefined || home2 === undefined || out === 0) continue;',
    '    if (out + home2 + reserve > budget) continue;',
    '    if (!dirs.some((d) => !seen.has(k(stepTo(tile, d))))) continue;',
    '    const s = out * 2 + Math.abs(tile.x - home.x) + Math.abs(tile.y - home.y);',
    '    if (s < score) { score = s; front = tile; }',
    '  }',
    '  if (!front) break;',
    '  drive(route(here.via, at, front));',
    '}',
    'const at = pos();',
    'if (k(at) !== k(home)) drive(route(flood(at).via, at, home));',
  ].join('\n'),
};
