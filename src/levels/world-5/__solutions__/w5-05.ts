import type { MachineView, Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Grow one network out of the reactor: at every step take the cheapest cable from anything
 * already joined to anything not yet joined, lay it, and bring that station up straight away so
 * the energising order can never run ahead of the cable. Prim, which is the intended heuristic
 * (CURRICULUM.md §2 rule 4) and lands on the exact minimum here.
 *
 * The tree that comes out of it is also the answer to the star. Which station each newcomer was
 * cabled on to is the only record the run needs to keep; the district's weak point is whichever
 * station the most of those paths run through, and counting them costs no ticks at all.
 */
export const solution: ReferenceSolution = {
  levelId: 'w5-05',
  run(sim: Sim, botId: number): void {
    const { probe, link, power, print } = playerApi(sim, botId, 'w5-05');

    const reactor = probe('reactor');
    if (!reactor) return;
    const pending: MachineView[] = [];
    for (let i = 1; ; i++) {
      const station = probe(`sub-${String(i)}`);
      if (station === null) break;
      pending.push(station);
    }

    const joined: MachineView[] = [reactor];
    const feeds = new Map<string, string>();
    const gap = (a: MachineView, b: MachineView): number =>
      Math.abs(a.at.x - b.at.x) + Math.abs(a.at.y - b.at.y);

    while (pending.length > 0) {
      let bestFrom = joined[0] as MachineView;
      let bestAt = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      joined.forEach((from) => {
        pending.forEach((to, index) => {
          const cost = gap(from, to);
          if (cost >= bestCost) return;
          bestCost = cost;
          bestFrom = from;
          bestAt = index;
        });
      });
      const next = pending.splice(bestAt, 1)[0] as MachineView;
      link(bestFrom.id, next.id);
      power(next.id, 'on');
      feeds.set(next.id, bestFrom.id);
      joined.push(next);
    }

    // Every station on the path from a newcomer back to the reactor is one it depends on, so one
    // walk up each of those paths counts, for each station, how much of the district it carries.
    const load = new Map<string, number>();
    for (const id of feeds.keys()) {
      let at: string | undefined = id;
      while (at !== undefined && at !== reactor.id) {
        load.set(at, (load.get(at) ?? 0) + 1);
        at = feeds.get(at);
      }
    }
    let weakest = '';
    let worst = 0;
    for (const [id, carried] of load) {
      if (carried > worst) {
        weakest = id;
        worst = carried;
      }
    }
    print(`weak ${weakest} ${String(worst)}`);
  },
  source: [
    "const reactor = probe('reactor');",
    'const pending = [];',
    'for (let m; (m = probe(`sub-${pending.length + 1}`)); ) pending.push(m);',
    'const joined = [reactor];',
    'const feeds = new Map();',
    'const gap = (a, b) => Math.abs(a.at.x - b.at.x) + Math.abs(a.at.y - b.at.y);',
    'while (pending.length > 0) {',
    '  let from = joined[0];',
    '  let at = 0;',
    '  let cost = Infinity;',
    '  for (const a of joined) {',
    '    pending.forEach((b, i) => {',
    '      if (gap(a, b) < cost) {',
    '        cost = gap(a, b);',
    '        from = a;',
    '        at = i;',
    '      }',
    '    });',
    '  }',
    '  const next = pending.splice(at, 1)[0];',
    '  link(from.id, next.id);',
    "  power(next.id, 'on');",
    '  feeds.set(next.id, from.id);',
    '  joined.push(next);',
    '}',
    '',
    '// Walk each station back to the reactor; everything on the way carries it.',
    'const load = new Map();',
    'for (const id of feeds.keys()) {',
    '  let at = id;',
    "  while (at !== undefined && at !== 'reactor') {",
    '    load.set(at, (load.get(at) ?? 0) + 1);',
    '    at = feeds.get(at);',
    '  }',
    '}',
    "let weakest = '';",
    'let worst = 0;',
    'for (const [id, carried] of load) {',
    '  if (carried > worst) { weakest = id; worst = carried; }',
    '}',
    'print(`weak ${weakest} ${worst}`);',
  ].join('\n'),
};
