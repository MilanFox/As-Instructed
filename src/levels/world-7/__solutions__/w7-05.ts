import type { Dir, Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, manhattan, step } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Scouts buy information and workers spend it, but nobody stands still: a worker with no order
 * goes and looks at something, and stops looking the moment one arrives. Everything anybody sees
 * lands in one shared picture of the site, which is what lets a worker route over ground it has
 * never stood on. `sync()` sits between the send and the read because a worker running behind in
 * virtual time has not been handed the message yet.
 */

const LEG = 3;
const RANGE = 12;
const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;

interface Site {
  id: string;
  at: Vec;
}

export const solution: ReferenceSolution = {
  levelId: 'w7-05',
  run(sim: Sim): void {
    const muster = sim.probe(0, 'muster');
    if (!muster) return;
    const total = muster.vars['sites'] ?? 0;
    const width = 36;
    const ids = sim.botIds();
    const scouts = ids.slice(0, muster.vars['scouts'] ?? 1);
    const hands = ids.slice(muster.vars['scouts'] ?? 1);
    const boss = scouts[0] as number;

    const open = new Map<string, Vec>();
    const seen = new Set<string>();
    const found = new Map<string, Vec>();
    const claimed = new Set<string>();
    const orders = new Map<number, Site>();

    const observe = (id: number): void => {
      const here = sim.pos(id);
      seen.add(key(here));
      open.set(key(here), here);
      for (const dir of ALL_DIRS) {
        for (const view of sim.look(id, dir, RANGE)) {
          if (!view.inBounds) break;
          seen.add(key(view.at));
          if (view.walkable) open.set(key(view.at), view.at);
          if (view.machineId !== null && view.machineId.startsWith('site-')) {
            found.set(view.machineId, view.at);
          }
        }
      }
      const near = sim.probe(id);
      if (near && near.id.startsWith('site-')) found.set(near.id, near.at);
    };

    const route = (from: Vec, to: Vec, taken: ReadonlySet<string>): Dir[] => {
      const via = new Map<string, { at: Vec; dir: Dir }>();
      const visited = new Set<string>([key(from)]);
      const queue: Vec[] = [from];
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as Vec;
        if (at.x === to.x && at.y === to.y) break;
        for (const dir of ALL_DIRS) {
          const next = step(at, dir);
          const id = key(next);
          if (visited.has(id) || !open.has(id)) continue;
          if (taken.has(id) && !(next.x === to.x && next.y === to.y)) continue;
          visited.add(id);
          via.set(id, { at, dir });
          queue.push(next);
        }
      }
      const path: Dir[] = [];
      let at = to;
      while (!(at.x === from.x && at.y === from.y)) {
        const back = via.get(key(at));
        if (!back) return [];
        path.push(back.dir);
        at = back.at;
      }
      return path.reverse();
    };

    const nothing = new Set<string>();

    /**
     * Up to `LEG` steps. A bot that has stopped never gives its tile back, so the first attempt
     * routes around where everybody is now and the second ignores them — better to queue behind
     * somebody who might move than to conclude the site is unreachable.
     */
    const advance = (id: number, to: Vec): void => {
      const from = sim.pos(id);
      if (from.x === to.x && from.y === to.y) return;
      const taken = new Set<string>();
      for (const other of ids) {
        if (other !== id) taken.add(key(sim.pos(other)));
      }
      let path = route(from, to, taken);
      if (path.length === 0) path = route(from, to, nothing);
      let moved = 0;
      for (const dir of path) {
        if (moved >= LEG) break;
        if (!sim.canMove(id, dir)) break;
        sim.move(id, dir);
        observe(id);
        moved++;
      }
      if (moved === 0) sim.wait(id, 1);
    };

    const frontier = (from: Vec, reserved: ReadonlySet<string>): Vec | null => {
      let best: Vec | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const [id, at] of open) {
        if (reserved.has(id)) continue;
        if (!ALL_DIRS.some((dir) => !seen.has(key(step(at, dir))))) continue;
        const score = manhattan(from, at);
        if (score < bestScore) {
          bestScore = score;
          best = at;
        }
      }
      return best;
    };

    for (const id of ids) observe(id);

    let lit = 0;
    for (let round = 0; round < 3000 && lit < total; round++) {
      // ---- dispatch -------------------------------------------------------
      let posted = false;
      for (const [id, at] of found) {
        if (claimed.has(id)) continue;
        let pick = -1;
        let nearest = Number.POSITIVE_INFINITY;
        for (const hand of hands) {
          if (orders.has(hand)) continue;
          const distance = manhattan(sim.pos(hand), at);
          if (distance < nearest) {
            nearest = distance;
            pick = hand;
          }
        }
        if (pick < 0) break;
        claimed.add(id);
        orders.set(pick, { id, at });
        sim.send(boss, pick, at.y * width + at.x);
        posted = true;
      }
      if (posted) {
        sim.sync();
        for (const hand of hands) {
          while (sim.recv(hand) !== null) {
            // Reading is what makes the order this worker's; the position was in the body.
          }
        }
      }

      // ---- everybody moves ------------------------------------------------
      const reserved = new Set<string>();
      let acted = false;
      for (const id of ids) {
        const order = orders.get(id);
        if (order) {
          const at = sim.pos(id);
          if (at.x === order.at.x && at.y === order.at.y) {
            sim.use(id);
            observe(id);
            orders.delete(id);
            lit++;
          } else {
            advance(id, order.at);
          }
          acted = true;
          continue;
        }
        if (found.size >= total) continue;
        const target = frontier(sim.pos(id), reserved);
        if (!target) continue;
        reserved.add(key(target));
        advance(id, target);
        acted = true;
      }
      if (!acted) break;
    }
  },
  source: [
    'const muster = probe(0, "muster");',
    'const ids = bots();',
    'const scouts = ids.slice(0, muster.vars.scouts);',
    'const hands = ids.slice(muster.vars.scouts);',
    'const boss = scouts[0];',
    'const k = (p) => `${p.x},${p.y}`;',
    'const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    'const shift = (p, d) => ({',
    '  x: p.x + (d === Dir.East ? 1 : d === Dir.West ? -1 : 0),',
    '  y: p.y + (d === Dir.South ? 1 : d === Dir.North ? -1 : 0),',
    '});',
    'const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
    'const open = new Map();',
    'const seen = new Set();',
    'const found = new Map();',
    'const claimed = new Set();',
    'const orders = new Map();',
    'const observe = (id) => {',
    '  const here = bot(id).pos();',
    '  seen.add(k(here));',
    '  open.set(k(here), here);',
    '  for (const d of dirs) {',
    '    for (const v of bot(id).look(d, 12)) {',
    '      if (!v.inBounds) break;',
    '      seen.add(k(v.at));',
    '      if (v.walkable) open.set(k(v.at), v.at);',
    '      if (v.machineId && v.machineId.startsWith("site-")) found.set(v.machineId, v.at);',
    '    }',
    '  }',
    '  const near = bot(id).probe();',
    '  if (near && near.id.startsWith("site-")) found.set(near.id, near.at);',
    '};',
    'const route = (from, to, taken) => {',
    '  const via = new Map();',
    '  const visited = new Set([k(from)]);',
    '  const q = [from];',
    '  for (let i = 0; i < q.length; i++) {',
    '    const at = q[i];',
    '    if (at.x === to.x && at.y === to.y) break;',
    '    for (const d of dirs) {',
    '      const n = shift(at, d);',
    '      if (visited.has(k(n)) || !open.has(k(n))) continue;',
    '      if (taken.has(k(n)) && !(n.x === to.x && n.y === to.y)) continue;',
    '      visited.add(k(n));',
    '      via.set(k(n), { at, dir: d });',
    '      q.push(n);',
    '    }',
    '  }',
    '  const path = [];',
    '  let at = to;',
    '  while (!(at.x === from.x && at.y === from.y)) {',
    '    const back = via.get(k(at));',
    '    if (!back) return [];',
    '    path.push(back.dir);',
    '    at = back.at;',
    '  }',
    '  return path.reverse();',
    '};',
    'const nothing = new Set();',
    'const advance = (id, to) => {',
    '  const from = bot(id).pos();',
    '  if (from.x === to.x && from.y === to.y) return;',
    '  const taken = new Set();',
    '  for (const o of ids) if (o !== id) taken.add(k(bot(o).pos()));',
    '  let path = route(from, to, taken);',
    '  if (path.length === 0) path = route(from, to, nothing);',
    '  let moved = 0;',
    '  for (const d of path) {',
    '    if (moved >= 3 || !bot(id).canMove(d)) break;',
    '    bot(id).move(d);',
    '    observe(id);',
    '    moved++;',
    '  }',
    '  if (moved === 0) bot(id).wait(1);',
    '};',
    'const frontier = (from, reserved) => {',
    '  let best = null;',
    '  let score = Infinity;',
    '  for (const [id, at] of open) {',
    '    if (reserved.has(id)) continue;',
    '    if (!dirs.some((d) => !seen.has(k(shift(at, d))))) continue;',
    '    if (gap(from, at) < score) { score = gap(from, at); best = at; }',
    '  }',
    '  return best;',
    '};',
    'for (const id of ids) observe(id);',
    'let lit = 0;',
    'for (let round = 0; round < 3000 && lit < muster.vars.sites; round++) {',
    '  let posted = false;',
    '  for (const [id, at] of found) {',
    '    if (claimed.has(id)) continue;',
    '    let pick = -1;',
    '    let nearest = Infinity;',
    '    for (const h of hands) {',
    '      if (orders.has(h)) continue;',
    '      if (gap(bot(h).pos(), at) < nearest) { nearest = gap(bot(h).pos(), at); pick = h; }',
    '    }',
    '    if (pick < 0) break;',
    '    claimed.add(id);',
    '    orders.set(pick, { id, at });',
    '    bot(boss).send(pick, at.y * 36 + at.x);',
    '    posted = true;',
    '  }',
    '  if (posted) {',
    '    sync();',
    '    for (const h of hands) while (bot(h).recv() !== null) {}',
    '  }',
    '  const reserved = new Set();',
    '  let acted = false;',
    '  for (const id of ids) {',
    '    const order = orders.get(id);',
    '    if (order) {',
    '      const at = bot(id).pos();',
    '      if (at.x === order.at.x && at.y === order.at.y) {',
    '        bot(id).use();',
    '        observe(id);',
    '        orders.delete(id);',
    '        lit++;',
    '      } else {',
    '        advance(id, order.at);',
    '      }',
    '      acted = true;',
    '      continue;',
    '    }',
    '    if (found.size >= muster.vars.sites) continue;',
    '    const target = frontier(bot(id).pos(), reserved);',
    '    if (!target) continue;',
    '    reserved.add(k(target));',
    '    advance(id, target);',
    '    acted = true;',
    '  }',
    '  if (!acted) break;',
    '}',
  ].join('\n'),
};
