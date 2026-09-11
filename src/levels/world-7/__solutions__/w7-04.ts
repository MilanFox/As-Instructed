import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

interface Hand {
  id: number;
  at: Vec;
  clock: number;
}

export const solution: ReferenceSolution = {
  levelId: 'w7-04',
  run(sim: Sim): void {
    const board = sim.probe(0, 'board');
    if (!board) return;

    const jobs: { id: string; at: Vec; cost: number }[] = [];
    for (let i = 0; i < (board.vars['jobs'] ?? 0); i++) {
      const job = sim.probe(0, `job-${String(i)}`);
      if (job) jobs.push({ id: job.id, at: job.at, cost: job.vars['cost'] ?? 0 });
    }
    jobs.sort((a, b) => b.cost - a.cost);

    const fleet: Hand[] = sim.botIds().map((id) => ({ id, at: sim.pos(id), clock: 0 }));
    const gap = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;
    const STEPS: [Dir, number, number][] = [
      [Dir.North, 0, -1],
      [Dir.East, 1, 0],
      [Dir.South, 0, 1],
      [Dir.West, -1, 0],
    ];

    const route = (from: Vec, to: Vec, taken: ReadonlySet<string>): Dir[] => {
      const via = new Map<string, { at: Vec; dir: Dir }>();
      const seen = new Set<string>([key(from)]);
      const queue: Vec[] = [from];
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as Vec;
        if (at.x === to.x && at.y === to.y) break;
        for (const [dir, dx, dy] of STEPS) {
          const next = { x: at.x + dx, y: at.y + dy };
          if (next.x < 1 || next.y < 1 || next.x > 26 || next.y > 18) continue;
          if (seen.has(key(next))) continue;
          if (taken.has(key(next)) && !(next.x === to.x && next.y === to.y)) continue;
          seen.add(key(next));
          via.set(key(next), { at, dir });
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

    const walk = (hand: Hand, to: Vec): void => {
      for (let attempt = 0; attempt < 400; attempt++) {
        const from = sim.pos(hand.id);
        if (from.x === to.x && from.y === to.y) return;
        const taken = new Set<string>();
        for (const other of fleet) {
          if (other.id !== hand.id) taken.add(key(sim.pos(other.id)));
        }
        let moved = 0;
        for (const dir of route(from, to, taken)) {
          if (!sim.canMove(hand.id, dir)) break;
          sim.move(hand.id, dir);
          hand.clock++;
          moved++;
        }
        if (moved === 0) {
          sim.wait(hand.id, 1);
          hand.clock++;
        }
      }
    };

    let decider = '';
    let decidedAt = -1;
    for (const job of jobs) {
      let hand = fleet[0] as Hand;
      let best = Number.POSITIVE_INFINITY;
      for (const candidate of fleet) {
        const start = candidate.clock + gap(candidate.at, job.at);
        if (start < best) {
          best = start;
          hand = candidate;
        }
      }
      walk(hand, job.at);
      for (let i = 0; i < job.cost; i++) {
        sim.use(hand.id);
        hand.clock++;
      }
      hand.at = job.at;
      const closed = sim.clock(hand.id);
      if (closed > decidedAt) {
        decidedAt = closed;
        decider = job.id;
      }
    }
    sim.print(0, `last ${decider} ${String(decidedAt)}`);
  },
  source: [
    'const board = probe("board");',
    'const jobs = [];',
    'for (let i = 0; i < board.vars.jobs; i++) {',
    '  const job = probe(`job-${i}`);',
    '  jobs.push({ id: job.id, at: job.at, cost: job.vars.cost });',
    '}',
    'jobs.sort((a, b) => b.cost - a.cost);',
    'const fleet = bots().map((id) => ({ id, at: bot(id).pos(), clock: 0 }));',
    'const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
    'const k = (p) => `${p.x},${p.y}`;',
    'const steps = [[Dir.North, 0, -1], [Dir.East, 1, 0], [Dir.South, 0, 1], [Dir.West, -1, 0]];',
    'const route = (from, to, taken) => {',
    '  const via = new Map();',
    '  const seen = new Set([k(from)]);',
    '  const q = [from];',
    '  for (let i = 0; i < q.length; i++) {',
    '    const at = q[i];',
    '    if (at.x === to.x && at.y === to.y) break;',
    '    for (const [dir, dx, dy] of steps) {',
    '      const n = { x: at.x + dx, y: at.y + dy };',
    '      if (n.x < 1 || n.y < 1 || n.x > 26 || n.y > 18 || seen.has(k(n))) continue;',
    '      if (taken.has(k(n)) && !(n.x === to.x && n.y === to.y)) continue;',
    '      seen.add(k(n));',
    '      via.set(k(n), { at, dir });',
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
    'const walk = (hand, to) => {',
    '  for (let attempt = 0; attempt < 400; attempt++) {',
    '    const from = bot(hand.id).pos();',
    '    if (from.x === to.x && from.y === to.y) return;',
    '    const taken = new Set();',
    '    for (const o of fleet) if (o.id !== hand.id) taken.add(k(bot(o.id).pos()));',
    '    let moved = 0;',
    '    for (const dir of route(from, to, taken)) {',
    '      if (!bot(hand.id).canMove(dir)) break;',
    '      bot(hand.id).move(dir);',
    '      hand.clock++;',
    '      moved++;',
    '    }',
    '    if (moved === 0) { bot(hand.id).wait(1); hand.clock++; }',
    '  }',
    '};',
    'let decider = "";',
    'let decidedAt = -1;',
    'for (const job of jobs) {',
    '  let hand = fleet[0];',
    '  let best = Infinity;',
    '  for (const c of fleet) {',
    '    const start = c.clock + gap(c.at, job.at);',
    '    if (start < best) { best = start; hand = c; }',
    '  }',
    '  walk(hand, job.at);',
    '  for (let i = 0; i < job.cost; i++) { bot(hand.id).use(); hand.clock++; }',
    '  hand.at = job.at;',
    '  const closed = bot(hand.id).clock();',
    '  if (closed > decidedAt) { decidedAt = closed; decider = job.id; }',
    '}',
    'bot(0).print(`last ${decider} ${decidedAt}`);',
  ].join('\n'),
};
